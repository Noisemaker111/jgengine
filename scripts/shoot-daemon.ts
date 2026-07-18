/**
 * Persistent screenshot service: keeps one apps/dev Vite + one headless Chrome
 * warm across many `bun run shoot` captures so later shots attach in seconds
 * instead of paying the 60–90s cold boot. Folds the manual `--keep`/`--connect`
 * warm loop into a discoverable managed service.
 *
 *   bun run shoot --serve              # start daemon (foreground)
 *   bun run shoot daemon start         # start daemon (background)
 *   bun run shoot daemon status
 *   bun run shoot daemon stop
 *   bun run shoot <game> --mode play   # auto-attaches when daemon is live
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  checkoutIdentity,
  ensureDevServer,
  isUp,
  killPid,
  killProcessTree,
  launchChrome,
  resolveDevPort,
  resolveWarmChromePort,
  waitForDebugger,
} from "./browser-lib";

export interface ShootDaemonState {
  identity: string;
  chromePort: number;
  devPort: number;
  devBase: string;
  chromePid?: number;
  devPid?: number;
  startedAt: string;
}

type DaemonStartWaitOptions = {
  pid?: number;
  timeoutMs?: number;
  pollMs?: number;
};

export function daemonStatePath(cwd = process.cwd()): string {
  const port = resolveWarmChromePort(cwd);
  return join(tmpdir(), `jgengine-shoot-daemon-${port}.json`);
}

export function readDaemonState(cwd = process.cwd()): ShootDaemonState | null {
  const path = daemonStatePath(cwd);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ShootDaemonState;
  } catch {
    return null;
  }
}

export function writeDaemonState(state: ShootDaemonState, cwd = process.cwd()): void {
  writeFileSync(daemonStatePath(cwd), `${JSON.stringify(state, null, 2)}\n`);
}

export function clearDaemonState(cwd = process.cwd()): void {
  const path = daemonStatePath(cwd);
  if (existsSync(path)) unlinkSync(path);
}

function pidAlive(pid: number | undefined): boolean {
  if (pid === undefined || !Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** True when the recorded daemon is still serving Chrome CDP + this checkout's Vite. */
export async function isDaemonLive(cwd = process.cwd()): Promise<boolean> {
  const state = readDaemonState(cwd);
  if (state === null) return false;
  if (state.identity !== checkoutIdentity(cwd)) return false;
  try {
    const version = await fetch(`http://127.0.0.1:${state.chromePort}/json/version`, {
      signal: AbortSignal.timeout(800),
    });
    if (!version.ok) return false;
  } catch {
    return false;
  }
  if (!(await isUp(state.devBase))) return false;
  return true;
}

/**
 * When a daemon is live for this checkout, return its chrome/dev endpoints so
 * shoot can attach without launching anything. Otherwise null.
 */
export async function attachDaemon(cwd = process.cwd()): Promise<ShootDaemonState | null> {
  if (!(await isDaemonLive(cwd))) return null;
  return readDaemonState(cwd);
}

/** Wait for a background daemon to expose both its Chrome and Vite endpoints. */
export async function waitForDaemonLive(
  cwd = process.cwd(),
  options: DaemonStartWaitOptions = {},
): Promise<ShootDaemonState | null> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const pollMs = options.pollMs ?? 250;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const state = await attachDaemon(cwd);
    if (state !== null) return state;
    if (options.pid !== undefined && !pidAlive(options.pid)) return null;

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) return null;
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, remainingMs)));
  }
}

export async function startDaemon(options: {
  cwd?: string;
  foreground?: boolean;
}): Promise<ShootDaemonState> {
  const cwd = options.cwd ?? process.cwd();
  if (await isDaemonLive(cwd)) {
    const existing = readDaemonState(cwd);
    if (existing !== null) {
      console.error(
        `shoot daemon: already running — chrome :${existing.chromePort}, dev ${existing.devBase}`,
      );
      return existing;
    }
  }

  const identity = checkoutIdentity(cwd);
  const chromePort = resolveWarmChromePort(cwd);
  const dev = await ensureDevServer(cwd);
  const chrome = launchChrome(chromePort, "jg-shoot-daemon-");
  await waitForDebugger(chromePort, 30_000);

  const state: ShootDaemonState = {
    identity,
    chromePort,
    devPort: dev.port,
    devBase: dev.base,
    chromePid: chrome.pid,
    devPid: dev.child?.pid,
    startedAt: new Date().toISOString(),
  };
  writeDaemonState(state, cwd);
  console.error(`shoot daemon: ready — chrome :${chromePort}, dev ${dev.base}`);
  console.error(`shoot daemon: next shot → bun run shoot <game> --mode play`);
  console.error(`shoot daemon: stop → bun run shoot daemon stop`);

  if (options.foreground) {
    const stop = () => {
      void stopDaemon({ cwd, chrome, server: dev.child });
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    await new Promise(() => {
      /* stay alive until signal */
    });
  } else {
    chrome.unref();
    dev.child?.unref();
  }

  return state;
}

export async function stopDaemon(options: {
  cwd?: string;
  chrome?: ChildProcess | null;
  server?: ChildProcess | null;
} = {}): Promise<boolean> {
  const cwd = options.cwd ?? process.cwd();
  const state = readDaemonState(cwd);
  let stopped = false;

  if (options.chrome !== undefined) {
    killProcessTree(options.chrome);
    stopped = true;
  } else if (state?.chromePid !== undefined && pidAlive(state.chromePid)) {
    killPid(state.chromePid);
    stopped = true;
  }

  if (options.server !== undefined) {
    killProcessTree(options.server);
    stopped = true;
  } else if (state?.devPid !== undefined && pidAlive(state.devPid)) {
    killPid(state.devPid);
    stopped = true;
  }

  clearDaemonState(cwd);
  if (stopped || state !== null) {
    console.error("shoot daemon: stopped");
    return true;
  }
  console.error("shoot daemon: not running");
  return false;
}

export async function statusDaemon(cwd = process.cwd()): Promise<number> {
  const state = readDaemonState(cwd);
  if (state === null) {
    console.log("shoot daemon: not running");
    return 1;
  }
  const live = await isDaemonLive(cwd);
  if (!live) {
    console.log("shoot daemon: stale state (Chrome/Vite not reachable)");
    console.log(JSON.stringify(state, null, 2));
    return 1;
  }
  console.log("shoot daemon: running");
  console.log(JSON.stringify(state, null, 2));
  return 0;
}

/**
 * Background start: spawn a detached `shoot --serve` child so the CLI returns.
 * On Windows we still spawn the same entrypoint; the child owns the long-lived
 * Chrome + Vite processes.
 */
export function spawnDaemonBackground(cwd = process.cwd()): ChildProcess {
  const entry = join(import.meta.dir, "shoot-dev.ts");
  const child = spawn(process.execPath, [entry, "--serve"], {
    cwd,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  console.error(`shoot daemon: starting in background (pid ${child.pid ?? "?"})`);
  return child;
}

export async function runDaemonCommand(argv: string[], cwd = process.cwd()): Promise<number> {
  const verb = argv[0] ?? "status";
  if (verb === "start") {
    if (argv.includes("--foreground") || argv.includes("-f")) {
      await startDaemon({ cwd, foreground: true });
      return 0;
    }
    const existing = await attachDaemon(cwd);
    if (existing !== null) {
      console.error(
        `shoot daemon: already running — chrome :${existing.chromePort}, dev ${existing.devBase}`,
      );
      return 0;
    }

    const child = spawnDaemonBackground(cwd);
    const state = await waitForDaemonLive(cwd, { pid: child.pid });
    if (state === null) {
      const reason = pidAlive(child.pid)
        ? "did not become ready within 120 seconds"
        : "exited before Chrome and Vite became ready";
      console.error(`shoot daemon: failed — background process ${reason}`);
      return 1;
    }
    console.error(`shoot daemon: ready — chrome :${state.chromePort}, dev ${state.devBase}`);
    return 0;
  }
  if (verb === "stop") {
    await stopDaemon({ cwd });
    return 0;
  }
  if (verb === "status") {
    return statusDaemon(cwd);
  }
  if (verb === "help" || verb === "--help" || verb === "-h") {
    console.log(`shoot daemon commands:
  start [--foreground]   keep Vite + Chrome warm (background by default)
  status                 print state JSON if live
  stop                   kill warm Chrome/Vite and clear state

Shorthand: bun run shoot --serve  (= daemon start --foreground)
While running, plain shoot attaches automatically (no --connect needed).`);
    return 0;
  }
  console.error(`shoot daemon: unknown command "${verb}" (try start|status|stop|help)`);
  return 1;
}

export function isDaemonArgv(argv: string[]): boolean {
  if (argv[0] === "daemon") return true;
  if (argv.includes("--serve")) return true;
  return false;
}
