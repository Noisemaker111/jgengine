/**
 * Persistent capture service: starts headless Chrome immediately, then lazily
 * starts and retains apps/dev or apps/web when a capture needs that target.
 * Later shots reuse browser, module, and shader caches.
 *
 * Every capture lane (shoot, drive, perf) acquires it through
 * {@link acquireWarmCapture}: reuse a live one, start one when none is running,
 * replace one that serves another commit, and fall back to a direct launch when
 * it cannot be had. `--cold` skips it entirely.
 *
 *   bun run shoot <game> --mode play   # starts or reuses the daemon, then attaches
 *   bun run shoot <game> --cold        # no daemon: clean boot for evidence runs
 *   bun run shoot --serve              # start daemon (foreground)
 *   bun run shoot daemon start         # start daemon (background)
 *   bun run shoot daemon status
 *   bun run shoot daemon stop
 *   bun run shoot daemon reap         # retire warm Chrome idle past JG_SHOOT_IDLE_MINUTES
 */
import type { ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { headRevision, shortRevision } from "./captureRevision";
import {
  checkoutIdentity,
  ensureDevServer,
  ensureWebServer,
  killPid,
  killProcessTree,
  launchPersistentChrome,
  pidAlive,
  removeProfileDir,
  resolveDevPort,
  resolveWarmChromePort,
  startBrowser,
  waitForPidExit,
  type ChromeProcess,
  type EnsureDevServerResult,
} from "./browser-lib";
import { localOk } from "./localhostHttp";

export interface ShootDaemonState {
  identity: string;
  chromePort: number;
  /** Engine commit this daemon's Chrome and Vite booted from; absent on records written before revision keying. */
  head?: string;
  devPort?: number;
  devBase?: string;
  chromePid?: number;
  /** Chrome profile, removed when the daemon stops. */
  userDataDir?: string;
  devPid?: number;
  webPort?: number;
  webBase?: string;
  webPid?: number;
  /** Games world the dev server was booted against; a mismatch means its game list is stale. */
  devWorld?: GamesWorld;
  /** Games world the website server was booted against. */
  webWorld?: GamesWorld;
  startedAt: string;
  /** Last capture that attached to this daemon; absent on records written before idle sweeping. */
  lastUsedAt?: string;
}

/**
 * The part of the world a running Vite server froze at boot: its `@games/<id>`
 * aliases and game glob are computed once, so a `Games` link created or
 * repointed after boot is invisible to it.
 */
export interface GamesWorld {
  /** Resolved path of the games checkout, or null when there is no `Games`. */
  target: string | null;
  /** `Games` entry mtime: changes when the link is created or repointed. */
  linkMtimeMs: number | null;
  /** Games checkout HEAD, read from its `.git/HEAD` file rather than a git process. */
  head: string | null;
  /** Game ids the runner can resolve. */
  games: string[];
}

function readHead(checkout: string): string | null {
  try {
    const head = readFileSync(join(checkout, ".git", "HEAD"), "utf8").trim();
    if (!head.startsWith("ref:")) return head;
    return readFileSync(join(checkout, ".git", head.slice(4).trim()), "utf8").trim();
  } catch {
    return null;
  }
}

/**
 * Cheap fingerprint of the games world: one realpath, one lstat, one readdir and
 * one HEAD read (no git process, no game source scan), so it can run on every
 * shot without costing a rescan.
 */
export function gamesWorld(cwd = process.cwd()): GamesWorld {
  const entry = join(cwd, "Games");
  let linkMtimeMs: number | null = null;
  try {
    linkMtimeMs = statSync(entry).mtimeMs;
  } catch {
    return { target: null, linkMtimeMs: null, head: null, games: [] };
  }
  let target: string;
  try {
    target = realpathSync(entry);
  } catch {
    return { target: null, linkMtimeMs, head: null, games: [] };
  }
  const games: string[] = [];
  try {
    for (const item of readdirSync(target, { withFileTypes: true })) {
      if (item.isDirectory() && existsSync(join(target, item.name, "src", "index.tsx"))) games.push(item.name);
    }
  } catch {
    /* unreadable checkout: an empty list is the honest answer */
  }
  games.sort();
  return { target, linkMtimeMs, head: readHead(target), games };
}

export function worldChanged(previous: GamesWorld | undefined, current: GamesWorld): boolean {
  if (previous === undefined) return false;
  if (previous.target !== current.target) return true;
  if (previous.head !== current.head) return true;
  if (previous.games.length !== current.games.length) return true;
  return previous.games.some((game, index) => game !== current.games[index]);
}

/** One line naming what moved, so a restart is never a mystery. */
export function describeWorldChange(previous: GamesWorld, current: GamesWorld): string {
  const parts: string[] = [];
  if (previous.target !== current.target) parts.push(`Games ${previous.target ?? "(none)"} → ${current.target ?? "(none)"}`);
  if (previous.head !== current.head) parts.push(`games HEAD ${previous.head?.slice(0, 8) ?? "(none)"} → ${current.head?.slice(0, 8) ?? "(none)"}`);
  const added = current.games.filter((game) => !previous.games.includes(game));
  const removed = previous.games.filter((game) => !current.games.includes(game));
  if (added.length > 0) parts.push(`+${added.join(", +")}`);
  if (removed.length > 0) parts.push(`-${removed.join(", -")}`);
  return parts.length > 0 ? parts.join("; ") : "game list changed";
}

type DaemonStartWaitOptions = {
  pid?: number;
  timeoutMs?: number;
  pollMs?: number;
};

export function daemonStatePath(cwd = process.cwd()): string {
  const port = resolveWarmChromePort(cwd);
  const identity = createHash("sha256").update(checkoutIdentity(cwd)).digest("hex");
  return join(tmpdir(), `jgengine-shoot-daemon-${port}-${identity}.json`);
}

function readStatePath(path: string): ShootDaemonState | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ShootDaemonState;
  } catch {
    return null;
  }
}

function legacyStatePath(cwd: string): string {
  return join(tmpdir(), `jgengine-shoot-daemon-${resolveWarmChromePort(cwd)}.json`);
}

export function readDaemonState(cwd = process.cwd(), legacyPath = legacyStatePath(cwd)): ShootDaemonState | null {
  const path = daemonStatePath(cwd);
  if (existsSync(path)) return readStatePath(path);
  // Reuse old port-only records only for their exact owning checkout.
  // Reading does not migrate, replace, or delete another checkout's record.
  const legacy = readStatePath(legacyPath);
  return legacy?.identity === checkoutIdentity(cwd) ? legacy : null;
}

export function writeDaemonState(state: ShootDaemonState, cwd = process.cwd()): void {
  state.lastUsedAt = new Date().toISOString();
  const path = daemonStatePath(cwd);
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(temporary, path);
}

export function clearDaemonState(cwd = process.cwd(), legacyPath = legacyStatePath(cwd)): void {
  const path = daemonStatePath(cwd);
  if (existsSync(path)) unlinkSync(path);
  if (readStatePath(legacyPath)?.identity === checkoutIdentity(cwd)) unlinkSync(legacyPath);
}

async function withDaemonStateLock<T>(cwd: string, fn: () => T | Promise<T>): Promise<T> {
  return withDaemonFileLock(`${daemonStatePath(cwd)}.lock`, fn);
}

async function withDaemonFileLock<T>(lockPath: string, fn: () => T | Promise<T>, timeoutMs = 5_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let fd: number | undefined;
  while (fd === undefined) {
    try {
      fd = openSync(lockPath, "wx");
    } catch (error) {
      const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
      if (code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > 120_000) unlinkSync(lockPath);
      } catch {
        /* lock owner released it */
      }
      if (Date.now() >= deadline) throw new Error("shoot daemon: timed out waiting for daemon lock");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  try {
    return await fn();
  } finally {
    closeSync(fd);
    if (existsSync(lockPath)) unlinkSync(lockPath);
  }
}

/** True when the recorded daemon's persistent Chrome is reachable. Vite starts lazily per target. */
export async function isDaemonLive(cwd = process.cwd()): Promise<boolean> {
  const state = readDaemonState(cwd);
  if (state === null) return false;
  if (state.identity !== checkoutIdentity(cwd)) return false;
  try {
    if (!(await localOk(`http://127.0.0.1:${state.chromePort}/json/version`, 800))) return false;
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
  const state = readDaemonState(cwd);
  if (state !== null) await touchDaemonState(cwd);
  return state;
}

async function touchDaemonState(cwd: string): Promise<void> {
  try {
    await withDaemonStateLock(cwd, () => {
      const current = readDaemonState(cwd);
      if (current !== null) writeDaemonState(current, cwd);
    });
  } catch {
    // A contended lock costs one idle window, never a capture.
  }
}

export type ShootDaemonTarget = "dev" | "web";

/** What a lane got when it asked for a warm capture. */
export interface WarmCapture {
  /** The daemon to attach to, or null when this run owns its own Chrome. */
  daemon: ShootDaemonState | null;
  /** `warm` reused a live daemon; `cold` started one, was refused one, or was told not to. */
  mode: "warm" | "cold";
  /** Wall time the acquisition cost, so a lane's own timing line accounts for it. */
  seconds: number;
}

/**
 * True when a daemon serves a different commit than the tree holds. A record with
 * no recorded commit cannot prove what it serves, so it is retired rather than
 * trusted; a non-git checkout has nothing to compare and keeps the old reuse.
 */
export function daemonRevisionDrift(recorded: string | undefined, current: string | undefined): boolean {
  if (current === undefined) return false;
  if (recorded === undefined) return true;
  return recorded !== current;
}

/** Test seams: the acquisition talks to these instead of the real machine. */
export interface AcquireWarmCaptureOptions {
  cwd?: string;
  /** `--cold`: never reuse or start a daemon; the lane boots its own Chrome. */
  cold?: boolean;
  /** Why this lane is cold when it was not `--cold`; printed instead of the default reason. */
  because?: string;
  /** Return the live daemon for this checkout, or null. Defaults to {@link attachDaemon}. */
  probe?: (cwd: string) => Promise<ShootDaemonState | null>;
  /** Start a daemon and return it. Defaults to {@link startDaemon}. */
  start?: (cwd: string) => Promise<ShootDaemonState>;
  /** Retire a daemon that serves another commit. Defaults to {@link stopDaemon}. */
  stop?: (cwd: string) => Promise<boolean>;
  /** Commit the tree holds. Defaults to {@link headRevision}. */
  head?: (cwd: string) => string | undefined;
}

/**
 * The one decision every capture lane makes: attach to the daemon, start it, or
 * boot alone. Prints exactly one line saying which happened and how long it took,
 * and never waits on a daemon that is not there — a failure to provide one is a
 * printed fallback to the direct launch, not a retry.
 */
export async function acquireWarmCapture(options: AcquireWarmCaptureOptions = {}): Promise<WarmCapture> {
  const cwd = options.cwd ?? process.cwd();
  const startedAt = performance.now();
  const head = options.head ?? headRevision;
  const probe = options.probe ?? attachDaemon;
  const start = options.start ?? ((root: string) => startDaemon({ cwd: root }));
  const stop = options.stop ?? ((root: string) => stopDaemon({ cwd: root }));
  const done = (daemon: ShootDaemonState | null, mode: WarmCapture["mode"], line: string): WarmCapture => {
    console.error(line);
    return { daemon, mode, seconds: (performance.now() - startedAt) / 1_000 };
  };
  const elapsed = (): string => ((performance.now() - startedAt) / 1_000).toFixed(1);

  if (options.cold === true) {
    return done(null, "cold", `cold: ${options.because ?? "--cold asked for a clean boot"} — no daemon reused or started`);
  }

  let live: ShootDaemonState | null = null;
  try {
    live = await probe(cwd);
  } catch (error) {
    return done(null, "cold", `cold: could not read the daemon (${reason(error)}) — direct launch, no retry`);
  }

  if (live !== null) {
    const current = head(cwd);
    if (daemonRevisionDrift(live.head, current)) {
      try {
        await stop(cwd);
      } catch (error) {
        return done(null, "cold", `cold: a stale daemon would not stop (${reason(error)}) — direct launch, no retry`);
      }
      console.error(
        `cold: replaced daemon on :${live.chromePort} serving ${shortRevision(live.head)}, engine is ${shortRevision(current)}`,
      );
    } else {
      return done(live, "warm", `warm: reused :${live.chromePort} (${elapsed()}s)`);
    }
  }

  try {
    const state = await start(cwd);
    return done(state, "cold", `cold: started :${state.chromePort} (${elapsed()}s)`);
  } catch (error) {
    return done(null, "cold", `cold: daemon unavailable (${reason(error)}) — direct launch, no retry`);
  }
}

function reason(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\s+/g, " ").trim().slice(0, 160) || "unknown error";
}

/**
 * True when a run that attached to `daemon` then failed, and the daemon is gone:
 * the failure is explained by the daemon dying, so the lane may boot once by itself.
 */
export async function daemonDiedUnder(daemon: ShootDaemonState | null, cwd = process.cwd()): Promise<boolean> {
  if (daemon === null) return false;
  return !(await isDaemonLive(cwd));
}

/**
 * Settle only when the daemon stops answering. A CDP call into a browser that died
 * does not fail — it waits — so a capture that attached to the daemon races this and
 * fails in seconds, which turns a hang into the one-line fallback.
 */
export async function watchDaemon(daemon: ShootDaemonState, cwd = process.cwd(), intervalMs = 2_000): Promise<never> {
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    if (!(await isDaemonLive(cwd))) throw new Error(`shoot daemon: :${daemon.chromePort} stopped answering mid-run`);
  }
}

/** Run a capture session, failing early if the daemon it borrowed dies under it. */
export async function withDaemonWatch<T>(daemon: ShootDaemonState | null, run: Promise<T>, cwd = process.cwd()): Promise<T> {
  if (daemon === null) return run;
  return Promise.race([run, watchDaemon(daemon, cwd)]);
}

/** Start or reuse one Vite target and persist its endpoint in daemon state. */
export async function ensureDaemonTarget(
  state: ShootDaemonState,
  target: ShootDaemonTarget,
  cwd = process.cwd(),
  ensure: (cwd: string) => Promise<EnsureDevServerResult> = target === "web" ? ensureWebServer : ensureDevServer,
): Promise<EnsureDevServerResult> {
  // A warm Vite server froze its `@games/<id>` aliases and game glob at boot, so
  // a `Games` link created or repointed afterwards leaves it rejecting a game
  // that exists on disk. Retire that server before the call, not on a timer and
  // not after a failed capture.
  const observed = gamesWorld(cwd);
  await withDaemonStateLock(cwd, () => {
    const latest = readDaemonState(cwd);
    if (latest === null) throw new Error("shoot daemon: stopped while starting Vite target");
    if (latest.identity !== state.identity) throw new Error(`shoot daemon: state belongs to ${latest.identity}`);
    Object.assign(state, latest);
    const previous = target === "web" ? state.webWorld : state.devWorld;
    if (!worldChanged(previous, observed)) return;
    const pid = target === "web" ? state.webPid : state.devPid;
    if (pid !== undefined && pidAlive(pid)) killPid(pid, true);
    if (target === "web") {
      state.webPort = undefined;
      state.webBase = undefined;
      state.webPid = undefined;
    } else {
      state.devPort = undefined;
      state.devBase = undefined;
      state.devPid = undefined;
    }
    writeDaemonState(state, cwd);
    console.error(`shoot daemon: ${describeWorldChange(previous!, observed)} — restarting the ${target} server against it`);
  });

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
        state.webPid = server.pid ?? server.child?.pid ?? state.webPid;
        state.webWorld = observed;
      } else {
        state.devPort = server.port;
        state.devBase = server.base;
        state.devPid = server.pid ?? server.child?.pid ?? state.devPid;
        state.devWorld = observed;
      }
      writeDaemonState(state, cwd);
    });
  } catch (error) {
    killProcessTree(server.child);
    killPid(server.pid, true);
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
  if (state.userDataDir !== undefined) {
    await waitForPidExit(state.chromePid);
    removeProfileDir(state.userDataDir);
  }
  clearDaemonState(cwd);
  console.error("shoot daemon: reaped stale Chrome/Vite state before restart");
  return true;
}

/** Idle window after which a warm daemon is retired: one hour unless `JG_SHOOT_IDLE_MINUTES` says otherwise. */
export function idleDaemonMs(env: NodeJS.ProcessEnv = process.env): number {
  const minutes = Number(env.JG_SHOOT_IDLE_MINUTES ?? "");
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 60) * 60_000;
}

/** What the idle sweep retired, so a caller can print it. */
export interface IdleDaemonReap {
  retired: { identity: string; chromePort: number; idleMs: number }[];
  profilesRemoved: number;
}

/** Test seams: the sweep reads and kills through these instead of the real machine. */
export interface ReapIdleDaemonsOptions {
  dir?: string;
  idleMs?: number;
  now?: number;
  alive?: (pid: number | undefined) => boolean;
  kill?: (pid: number) => void;
  wait?: (pid: number | undefined) => Promise<void>;
  remove?: (dir: string) => void;
}

/**
 * Retire every warm Chrome on this machine that no capture has used for the idle
 * window. Records live in the temp directory per checkout, so a lane that ends
 * without `daemon stop` otherwise leaves its Chrome running for days.
 */
export async function reapIdleDaemons(options: ReapIdleDaemonsOptions = {}): Promise<IdleDaemonReap> {
  const dir = options.dir ?? tmpdir();
  const idleMs = options.idleMs ?? idleDaemonMs();
  const now = options.now ?? Date.now();
  const alive = options.alive ?? pidAlive;
  const kill = options.kill ?? ((pid: number) => killPid(pid, true));
  const wait = options.wait ?? waitForPidExit;
  const remove = options.remove ?? removeProfileDir;
  const retired: IdleDaemonReap["retired"] = [];
  const kept = new Set<string>();
  let profilesRemoved = 0;

  for (const name of readdirSync(dir)) {
    if (!name.startsWith("jgengine-shoot-daemon-") || !name.endsWith(".json")) continue;
    const path = join(dir, name);
    const state = readStatePath(path);
    if (state === null) {
      unlinkSync(path);
      continue;
    }
    const used = Date.parse(state.lastUsedAt ?? state.startedAt);
    const idle = Number.isFinite(used) ? now - used : idleMs;
    if (idle < idleMs) {
      if (state.userDataDir !== undefined) kept.add(join(dir, state.userDataDir.replace(/^.*[\\/]/, "")));
      continue;
    }
    for (const pid of [state.chromePid, state.devPid, state.webPid]) {
      if (pid !== undefined && alive(pid)) kill(pid);
    }
    await wait(state.chromePid);
    if (state.userDataDir !== undefined) {
      remove(state.userDataDir);
      kept.add(join(dir, state.userDataDir.replace(/^.*[\\/]/, "")));
      profilesRemoved += 1;
    }
    unlinkSync(path);
    retired.push({ identity: state.identity, chromePort: state.chromePort, idleMs: idle });
    console.error(
      `shoot daemon: retired idle ${state.identity} (chrome :${state.chromePort}, idle ${Math.round(idle / 60_000)}m)`,
    );
  }

  for (const name of readdirSync(dir)) {
    if (!name.startsWith("jg-shoot-daemon-")) continue;
    const path = join(dir, name);
    if (!existsSync(path) || !statSync(path).isDirectory()) continue;
    if (kept.has(path) || now - statSync(path).mtimeMs < idleMs) continue;
    remove(path);
    profilesRemoved += 1;
  }

  return { retired, profilesRemoved };
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
  /** Idle sweep before launch; tests turn it off. */
  reapIdle?: boolean;
}): Promise<ShootDaemonState> {
  const cwd = options.cwd ?? process.cwd();
  if (options.reapIdle !== false) {
    try {
      await reapIdleDaemons();
    } catch (error) {
      console.error(`shoot daemon: idle sweep skipped (${reason(error)})`);
    }
  }
  if (await isDaemonLive(cwd)) {
    const existing = readDaemonState(cwd);
    if (existing !== null) {
      console.error(
        `shoot daemon: already running — chrome :${existing.chromePort}`,
      );
      return existing;
    }
  }
  const identity = checkoutIdentity(cwd);
  const chromePort = resolveWarmChromePort(cwd);
  // Chrome ports are shared machine resources even though metadata is per checkout.
  // Serialize occupancy checking and launch so two checkouts cannot race onto one port.
  const owned = await withDaemonFileLock(join(tmpdir(), `jgengine-shoot-chrome-${chromePort}.lock`), async () => {
    if (await isDaemonLive(cwd)) return { state: readDaemonState(cwd)!, chrome: null, started: false };
    let occupied = false;
    try {
      occupied = await localOk(`http://127.0.0.1:${chromePort}/json/version`, 800);
    } catch { /* no reachable debugger */ }
    if (occupied) {
      throw new Error(`shoot daemon: Chrome debug port ${chromePort} is already reachable without a live record for this checkout. Use a unique JG_CHROME_PORT to start a separate daemon, or explicitly --connect ${chromePort} to use the existing browser; its ownership and storage were not changed.`);
    }
    await reapStaleDaemonState(cwd);
    const launched = await startBrowser<{ pid: number; child: ChromeProcess | null; userDataDir: string }>({
      debugPort: chromePort,
      prefix: "jg-shoot-daemon-",
      launch: (port, prefix) => launchPersistentChrome(port, prefix ?? "jg-shoot-daemon-"),
    });
    const chrome = launched.browser.child;
    const chromePid = launched.browser.pid;
    const userDataDir = launched.browser.userDataDir;
    const started: ShootDaemonState = {
      identity,
      chromePort,
      head: headRevision(cwd),
      chromePid,
      userDataDir,
      startedAt: new Date().toISOString(),
    };
    writeDaemonState(started, cwd);
    return { state: started, chrome, started: true };
  }, 35_000);
  const { state, chrome } = owned;
  const chromePid = state.chromePid;
  if (!owned.started) {
    console.error(`shoot daemon: already running — chrome :${state.chromePort}`);
    return state;
  }
  console.error(`shoot daemon: ready — chrome :${chromePort}; Vite starts lazily on first capture`);
  console.error(`shoot daemon: next shot → bun run shoot <game> --mode play`);
  console.error(`shoot daemon: stop → bun run shoot daemon stop`);

  if (options.foreground) {
    const stop = () => {
      const stopping = chrome === null ? stopDaemon({ cwd }) : stopDaemon({ cwd, chrome });
      void stopping.finally(() => process.exit(0));
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
    chrome?.unref();
  }

  return state;
}

export async function stopDaemon(options: {
  cwd?: string;
  chrome?: ChromeProcess | null;
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
  const profileDir = options.chrome?.userDataDir ?? state?.userDataDir;

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

  if (profileDir !== undefined) {
    await waitForPidExit(options.chrome?.pid ?? state?.chromePid);
    removeProfileDir(profileDir);
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

export async function runDaemonCommand(argv: string[], cwd = process.cwd()): Promise<number> {
  const verb = argv[0] ?? "status";
  if (verb === "start") {
    if (argv.includes("--foreground") || argv.includes("-f")) {
      await startDaemon({ cwd, foreground: true });
      return 0;
    }
    return withDaemonStateLock(cwd, async () => {
      const existing = await attachDaemon(cwd);
      if (existing !== null) {
        console.error(
          `shoot daemon: already running — chrome :${existing.chromePort}`,
        );
        return 0;
      }
      await reapStaleDaemonState(cwd);
      // Chrome is the persistent daemon. Launch it directly instead of spawning a second Bun
      // supervisor and polling for a state file; that extra launcher caused console focus theft on
      // Windows and could make a failed start wait blindly for two minutes.
      await startDaemon({ cwd, foreground: false });
      return 0;
    });
  }
  if (verb === "stop") {
    await stopDaemon({ cwd });
    return 0;
  }
  if (verb === "status") {
    return statusDaemon(cwd);
  }
  if (verb === "reap") {
    const report = await reapIdleDaemons();
    if (report.retired.length === 0 && report.profilesRemoved === 0) {
      console.log("shoot daemon: nothing idle to reap");
      return 0;
    }
    for (const item of report.retired) {
      console.log(`retired ${item.identity} (chrome :${item.chromePort}, idle ${Math.round(item.idleMs / 60_000)}m)`);
    }
    console.log(`shoot daemon: reaped ${report.retired.length} idle daemon(s), ${report.profilesRemoved} profile(s)`);
    return 0;
  }
  if (verb === "help" || verb === "--help" || verb === "-h") {
    console.log(`shoot daemon commands:
  start [--foreground]   keep Chrome warm; start each Vite target lazily
  status                 print state JSON if live
  stop                   kill warm Chrome/Vite and clear state
  reap                   retire every warm Chrome idle past JG_SHOOT_IDLE_MINUTES (60)

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
