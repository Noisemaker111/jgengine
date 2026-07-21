/**
 * Persistent capture service: starts headless Chrome immediately, then lazily
 * starts and retains apps/dev or apps/web when a capture needs that target.
 * Later shots reuse browser, module, and shader caches.
 *
 *   bun run shoot --serve              # start daemon (foreground)
 *   bun run shoot daemon start         # start daemon (background)
 *   bun run shoot daemon status
 *   bun run shoot daemon stop
 *   bun run shoot <game> --mode play   # auto-attaches when daemon is live
 */
import { spawn, type ChildProcess } from "node:child_process";
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  checkoutIdentity,
  ensureDevServer,
  ensureWebServer,
  killPid,
  killProcessTree,
  launchChrome,
  resolveDevPort,
  resolveWarmChromePort,
  waitForDebugger,
  type EnsureDevServerResult,
} from "./browser-lib";

export interface ShootDaemonState {
  identity: string;
  chromePort: number;
  devPort?: number;
  devBase?: string;
  chromePid?: number;
  devPid?: number;
  webPort?: number;
  webBase?: string;
  webPid?: number;
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
  const path = daemonStatePath(cwd);
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(temporary, path);
}

export function clearDaemonState(cwd = process.cwd()): void {
  const path = daemonStatePath(cwd);
  if (existsSync(path)) unlinkSync(path);
}

async function withDaemonStateLock<T>(cwd: string, fn: () => T): Promise<T> {
  const lockPath = `${daemonStatePath(cwd)}.lock`;
  const deadline = Date.now() + 5_000;
  let fd: number | undefined;
  while (fd === undefined) {
    try {
      fd = openSync(lockPath, "wx");
    } catch (error) {
      const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
      if (code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > 30_000) unlinkSync(lockPath);
      } catch {
        /* lock owner released it */
      }
      if (Date.now() >= deadline) throw new Error("shoot daemon: timed out waiting for state lock");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  try {
    return fn();
  } finally {
    closeSync(fd);
    if (existsSync(lockPath)) unlinkSync(lockPath);
  }
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

/** True when the recorded daemon's persistent Chrome is reachable. Vite starts lazily per target. */
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

export type ShootDaemonTarget = "dev" | "web";

/** Start or reuse one Vite target and persist its endpoint in daemon state. */
export async function ensureDaemonTarget(
  state: ShootDaemonState,
  target: ShootDaemonTarget,
  cwd = process.cwd(),
  ensure: (cwd: string) => Promise<EnsureDevServerResult> = target === "web" ? ensureWebServer : ensureDevServer,
): Promise<EnsureDevServerResult> {
  const server = await ensure(cwd);
  try {
    await withDaemonStateLock(cwd, () => {
      const latest = readDaemonState(cwd);
      if (latest === null) throw new Error("shoot daemon: stopped while starting Vite target");
      if (latest.identity !== state.identity) throw new Error(`shoot daemon: state belongs to ${latest.identity}`);
      Object.assign(state, latest);
      if (target === "web") {
        state.webPort = server.port;
        state.webBase = server.base;
        state.webPid = server.child?.pid ?? state.webPid;
      } else {
        state.devPort = server.port;
        state.devBase = server.base;
        state.devPid = server.child?.pid ?? state.devPid;
      }
      writeDaemonState(state, cwd);
    });
  } catch (error) {
    killProcessTree(server.child);
    throw error;
  }
  return server;
}

/** Reap recorded Chrome/Vite trees when their endpoints are no longer healthy. */
export async function reapStaleDaemonState(cwd = process.cwd()): Promise<boolean> {
  const state = readDaemonState(cwd);
  if (state === null) return false;
  if (state.identity !== checkoutIdentity(cwd)) {
    throw new Error(`shoot daemon: state port collision with checkout ${state.identity}`);
  }
  if (await isDaemonLive(cwd)) return false;
  if (pidAlive(state.chromePid)) killPid(state.chromePid, true);
  if (pidAlive(state.devPid)) killPid(state.devPid, true);
  if (pidAlive(state.webPid)) killPid(state.webPid, true);
  clearDaemonState(cwd);
  console.error("shoot daemon: reaped stale Chrome/Vite state before restart");
  return true;
}

/** Wait for a background daemon to expose Chrome; Vite targets start on demand. */
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
        `shoot daemon: already running — chrome :${existing.chromePort}`,
      );
      return existing;
    }
  }
  await reapStaleDaemonState(cwd);

  const identity = checkoutIdentity(cwd);
  const chromePort = resolveWarmChromePort(cwd);
  let chrome: ChildProcess | null = null;
  try {
    chrome = launchChrome(chromePort, "jg-shoot-daemon-");
    await waitForDebugger(chromePort, 30_000);
  } catch (error) {
    killProcessTree(chrome);
    throw error;
  }
  const chromePid = chrome.pid;

  const state: ShootDaemonState = {
    identity,
    chromePort,
    chromePid,
    startedAt: new Date().toISOString(),
  };
  writeDaemonState(state, cwd);
  console.error(`shoot daemon: ready — chrome :${chromePort}; Vite starts lazily on first capture`);
  console.error(`shoot daemon: next shot → bun run shoot <game> --mode play`);
  console.error(`shoot daemon: stop → bun run shoot daemon stop`);

  if (options.foreground) {
    const stop = () => {
      void stopDaemon({ cwd, chrome });
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    await new Promise<void>((resolve) => {
      const monitor = setInterval(() => {
        const current = readDaemonState(cwd);
        if (current === null || current.chromePid !== chromePid || !pidAlive(chromePid)) {
          clearInterval(monitor);
          resolve();
        }
      }, 250);
    });
  } else {
    chrome.unref();
  }

  return state;
}

export async function stopDaemon(options: {
  cwd?: string;
  chrome?: ChildProcess | null;
  server?: ChildProcess | null;
  webServer?: ChildProcess | null;
} = {}): Promise<boolean> {
  const cwd = options.cwd ?? process.cwd();
  const state = await withDaemonStateLock(cwd, () => {
    const current = readDaemonState(cwd);
    if (current !== null && current.identity !== checkoutIdentity(cwd)) {
      throw new Error(`shoot daemon: refusing to stop daemon owned by ${current.identity}`);
    }
    clearDaemonState(cwd);
    return current;
  });
  let stopped = false;

  if (options.chrome !== undefined) {
    killProcessTree(options.chrome);
    stopped = true;
  } else if (state?.chromePid !== undefined && pidAlive(state.chromePid)) {
    killPid(state.chromePid, true);
    stopped = true;
  }

  if (options.server !== undefined) {
    killProcessTree(options.server);
    stopped = true;
  } else if (state?.devPid !== undefined && pidAlive(state.devPid)) {
    killPid(state.devPid, true);
    stopped = true;
  }

  if (options.webServer !== undefined) {
    killProcessTree(options.webServer);
    stopped = true;
  } else if (state?.webPid !== undefined && pidAlive(state.webPid)) {
    killPid(state.webPid, true);
    stopped = true;
  }

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
    console.log("shoot daemon: stale state (Chrome not reachable)");
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
 * Chrome and any lazily-started Vite processes.
 */
export function spawnDaemonBackground(cwd = process.cwd()): ChildProcess {
  const entry = join(import.meta.dir, "shoot-dev.ts");
  const child = spawn(process.execPath, [entry, "--serve"], {
    cwd,
    detached: true,
    stdio: "ignore",
    env: process.env,
    windowsHide: true,
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
        `shoot daemon: already running — chrome :${existing.chromePort}`,
      );
      return 0;
    }
    await reapStaleDaemonState(cwd);

    const child = spawnDaemonBackground(cwd);
    const state = await waitForDaemonLive(cwd, { pid: child.pid });
    if (state === null) {
      const reason = pidAlive(child.pid)
        ? "did not become ready within 120 seconds"
        : "exited before Chrome became ready";
      console.error(`shoot daemon: failed — background process ${reason}`);
      return 1;
    }
    console.error(`shoot daemon: ready — chrome :${state.chromePort}; Vite starts lazily on first capture`);
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
  start [--foreground]   keep Chrome warm; start each Vite target lazily
  status                 print state JSON if live
  stop                   kill warm Chrome/Vite and clear state

Shorthand: bun run shoot --serve  (= daemon start --foreground)
While running, shoot and drive attach automatically (no --connect needed).`);
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
