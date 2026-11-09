import { spawnSync } from "node:child_process";
import { linkSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

import { beginPause, endPause, markStep } from "./hangReport";

/**
 * One machine-wide mutex for the timed part of every run that times frames in a browser or a
 * desktop build, so two never overlap. On 2026-11-08 six threads timed games at once, the PC sat at
 * 87-99% CPU, and in four hours none of them got a number worth reading.
 *
 * Held around the dev-server check, browser launch, page load, warmup and the measurement windows:
 * never around builds or installs. The server check sits inside because a server obtained before a
 * 503 s wait was gone after it (the broker had been restarted; 2026-11-08). Who takes it: `measureGame` in perf-play (perf play, gate, fps-gap, shadow-audit;
 * `perf play` holds it across its one-browser batch), perf network, perf desktop from app launch to
 * close, perf native's timed rows, and `drive --hitches` or `--trace`. Shoot and a plain drive time no frames,
 * and perf live only reads a page already open, so they do not wait for it. It is a mutex, not a
 * load check: a busy PC never stops a run, only another timed run does.
 *
 * Taken before the browser launches (a session `turn`, see {@link perfLockTurn}), so a queued run
 * has no uncapped Chrome idling while it waits.
 *
 * The lock file lives once per machine (`%LOCALAPPDATA%\jgengine\perf.lock`), not per worktree,
 * because every worktree is its own checkout. A holder whose process is gone, or that stopped
 * touching the file for {@link STALE_HEARTBEAT_MS}, is taken over with a `degraded:` line, so a
 * run killed with `taskkill /F` frees it for the next waiter at once. Time a run spends waiting is
 * credited back to the guard's and the browser session's deadlines (`hangReport` pauses), so a
 * long queue never kills a run that has not started; the record it writes says how long it waited
 * ({@link perfLockWaitedMs}). A queued run prints {@link waitingLine} once.
 */

/** Overrides the lock file's path; tests point it at a scratch file so they never queue behind a real run. */
export const PERF_LOCK_ENV = "JG_PERF_LOCK";
export const HEARTBEAT_MS = 5_000;
/** A live holder touches the file every {@link HEARTBEAT_MS}; one silent this long is a reused pid or a frozen run. */
export const STALE_HEARTBEAT_MS = 120_000;
const POLL_MS = 250;

export interface PerfLockHolder {
  pid: number;
  branch: string;
  what: string;
  cwd: string;
  since: number;
  token: string;
}

export interface PerfLockOptions {
  path?: string;
  pollMs?: number;
  log?: (line: string) => void;
  isAlive?: (pid: number) => boolean;
  /** Branch named in the holder record; defaults to this checkout's. */
  branch?: string;
}

export function perfLockPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[PERF_LOCK_ENV];
  if (override !== undefined && override !== "") return override;
  return join(env["LOCALAPPDATA"] ?? join(homedir(), ".cache"), "jgengine", "perf.lock");
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

const clock = (ms: number): string => new Date(ms).toTimeString().slice(0, 5);

/**
 * The one line a queued run prints: `perf lock: waiting for pid <n> (<branch>: <what>, since <hh:mm>) …`.
 * AGENTS.md names it, so a thread that sees it lets the run wait instead of killing it.
 */
export function waitingLine(holder: Pick<PerfLockHolder, "branch" | "pid" | "since"> & { what?: string }): string {
  const label = holder.what === undefined || holder.what === "" ? holder.branch : `${holder.branch}: ${holder.what}`;
  return `perf lock: waiting for pid ${holder.pid} (${label}, since ${clock(holder.since)}) …`;
}

let waitedTotalMs = 0;

/** Ms this process has spent queued for the lock so far; a record or report says it as seconds waited. */
export function perfLockWaitedMs(): number {
  return waitedTotalMs;
}

let cachedBranch: string | null = null;
function currentBranch(): string {
  if (cachedBranch !== null) return cachedBranch;
  const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8", windowsHide: true });
  const name = result.status === 0 ? result.stdout.trim() : "";
  cachedBranch = name === "" || name === "HEAD" ? basename(process.cwd()) : name;
  return cachedBranch;
}

function readHolder(path: string): PerfLockHolder | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<PerfLockHolder>;
    if (typeof parsed.pid !== "number" || typeof parsed.token !== "string") return null;
    return {
      pid: parsed.pid,
      branch: typeof parsed.branch === "string" ? parsed.branch : "unknown branch",
      what: typeof parsed.what === "string" ? parsed.what : "",
      cwd: typeof parsed.cwd === "string" ? parsed.cwd : "",
      since: typeof parsed.since === "number" ? parsed.since : 0,
      token: parsed.token,
    };
  } catch {
    return null;
  }
}

/**
 * Waiters queue in order. Each writes a ticket named `<queued-at>-<pid>` beside the lock, and a
 * waiter only tries for a free lock while no older ticket's process is alive; a dead ticket is
 * removed by whoever sees it. Without this, every release was a race between all pollers and a run
 * from one worktree was passed over by three newer arrivals from others in eight minutes (2026-11-08).
 */
function queueDirOf(path: string): string {
  return `${path}.queue`;
}

function writeTicket(path: string, queuedAt: number): string {
  const dir = queueDirOf(path);
  mkdirSync(dir, { recursive: true });
  const ticket = join(dir, `${String(queuedAt).padStart(15, "0")}-${process.pid}`);
  writeFileSync(ticket, String(process.pid));
  return ticket;
}

/** True when no live process holds an older ticket than this process (or this process holds none yet and the queue is empty). */
function myTurn(path: string, isAlive: (pid: number) => boolean): boolean {
  let names: string[];
  try {
    names = readdirSync(queueDirOf(path)).sort();
  } catch {
    return true;
  }
  for (const name of names) {
    const pid = Number(/^\d+-(\d+)$/.exec(name)?.[1]);
    if (pid === process.pid) return true;
    if (Number.isFinite(pid) && isAlive(pid)) return false;
    try {
      unlinkSync(join(queueDirOf(path), name));
    } catch {
      /* another waiter removed it */
    }
  }
  return true;
}

function dropTicket(ticket: string | null): void {
  if (ticket === null) return;
  try {
    unlinkSync(ticket);
  } catch {
    /* already removed */
  }
}

/** Create the lock file with its whole record in one step: a hard link fails if the file exists, so no reader sees half a record. */
function tryCreate(path: string, holder: PerfLockHolder): boolean {
  const staging = `${path}.${holder.pid}.${holder.token}.tmp`;
  writeFileSync(staging, `${JSON.stringify(holder)}\n`);
  try {
    linkSync(staging, path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  } finally {
    try {
      unlinkSync(staging);
    } catch {
      /* already gone */
    }
  }
}

/** Why the holder no longer holds the lock, or null while it does. */
function staleReason(path: string, holder: PerfLockHolder, isAlive: (pid: number) => boolean): string | null {
  if (!isAlive(holder.pid)) return "its process is gone";
  try {
    const silentMs = Date.now() - statSync(path).mtimeMs;
    if (silentMs > STALE_HEARTBEAT_MS) return `it has not touched the lock for ${Math.round(silentMs / 1000)}s`;
  } catch {
    /* released between the read and the stat */
  }
  return null;
}

/**
 * Remove a stale lock only while it still holds the record judged stale. Two waiters can judge the
 * same dead holder; a takeover file lets one of them remove it, so neither deletes a fresh lock.
 */
function takeOver(path: string, stale: PerfLockHolder): void {
  const guard = `${path}.takeover`;
  try {
    writeFileSync(guard, String(process.pid), { flag: "wx" });
  } catch {
    try {
      if (Date.now() - statSync(guard).mtimeMs > 30_000) unlinkSync(guard);
    } catch {
      /* the other waiter finished */
    }
    return;
  }
  try {
    if (readHolder(path)?.token === stale.token) unlinkSync(path);
  } catch {
    /* already released */
  } finally {
    try {
      unlinkSync(guard);
    } catch {
      /* cleared as old by another waiter */
    }
  }
}

let held: { path: string; token: string; depth: number; heartbeat: ReturnType<typeof setInterval>; onExit: () => void } | null = null;

function releaseFile(path: string, token: string): void {
  try {
    if (readHolder(path)?.token === token) unlinkSync(path);
  } catch {
    /* already gone */
  }
}

/**
 * Wait for the machine-wide perf lock and return its release. Re-entrant within one process, so a
 * timed step inside another (perf native's desktop row) does not wait for itself.
 */
export async function acquirePerfLock(what: string, options: PerfLockOptions = {}): Promise<() => void> {
  const path = options.path ?? perfLockPath();
  if (held !== null && held.path === path) {
    held.depth += 1;
    let released = false;
    return () => {
      if (released || held === null) return;
      released = true;
      held.depth -= 1;
    };
  }
  const log = options.log ?? ((line: string) => console.error(line));
  const isAlive = options.isAlive ?? processAlive;
  const pollMs = options.pollMs ?? POLL_MS;
  mkdirSync(dirname(path), { recursive: true });
  const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const queuedAt = Date.now();
  let announced: string | null = null;
  let ticket: string | null = null;
  try {
    for (;;) {
      const mine: PerfLockHolder = { pid: process.pid, branch: options.branch ?? currentBranch(), what, cwd: process.cwd(), since: Date.now(), token };
      if (myTurn(path, isAlive) && tryCreate(path, mine)) break;
      if (ticket === null) ticket = writeTicket(path, queuedAt);
      const holder = readHolder(path);
      if (holder === null) {
        // Released between the link and the read, a record nobody can read (hand-edited, a full
        // disk), or free but an older ticket's turn.
        let silentMs: number;
        try {
          silentMs = Date.now() - statSync(path).mtimeMs;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, pollMs));
          continue;
        }
        if (silentMs > STALE_HEARTBEAT_MS) {
          log(`degraded: stale perf lock at ${path}: its record is unreadable; taking it over`);
          try {
            unlinkSync(path);
          } catch {
            /* someone else took it over */
          }
          continue;
        }
      } else {
        const stale = staleReason(path, holder, isAlive);
        if (stale !== null) {
          log(`degraded: stale perf lock held by ${holder.branch} (pid ${holder.pid}, since ${clock(holder.since)}): ${stale}; taking it over`);
          takeOver(path, holder);
          continue;
        }
        if (announced !== holder.token) {
          announced = holder.token;
          const line = waitingLine(holder);
          log(line);
          beginPause(line);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  } finally {
    dropTicket(ticket);
    if (announced !== null) endPause();
  }
  if (announced !== null) {
    const waitedMs = Date.now() - queuedAt;
    waitedTotalMs += waitedMs;
    log(`perf lock: taken for ${what} after waiting ${Math.round(waitedMs / 1000)} s`);
  }
  markStep(`hold the perf lock: ${what}`);
  const heartbeat = setInterval(() => {
    try {
      const now = new Date();
      utimesSync(path, now, now);
    } catch {
      /* released or taken over */
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.();
  const onExit = (): void => releaseFile(path, token);
  process.on("exit", onExit);
  held = { path, token, depth: 1, heartbeat, onExit };
  const state = held;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.depth -= 1;
    if (state.depth > 0) return;
    clearInterval(state.heartbeat);
    process.off("exit", state.onExit);
    releaseFile(state.path, state.token);
    if (held === state) held = null;
  };
}

/** Run `work` holding the machine-wide perf lock; `what` names the run to anyone waiting. */
export async function withPerfLock<T>(what: string, work: () => Promise<T>, options: PerfLockOptions = {}): Promise<T> {
  const release = await acquirePerfLock(what, options);
  try {
    return await work();
  } finally {
    release();
  }
}

type Turn = () => Promise<() => Promise<void>>;

/**
 * A `withBrowserSession` turn that holds the perf lock for the whole session, taken before the
 * shared browser's own turn (`broker`), so a run queued for the lock never stalls the daemon's other
 * captures. Timed steps inside the session take the lock again for free (it is re-entrant).
 *
 * Only for a session that asks for its dev server inside the session callback. The turn waits after
 * everything before `withBrowserSession` ran, so a server asked for before it can be gone by the time
 * the lock frees (fps-gap and drive --hitches failed on ERR_CONNECTION_REFUSED this way, 2026-11-08).
 * A script that gets its server first takes {@link acquirePerfLock} before it instead; the takers
 * test checks that order.
 */
export function perfLockTurn(what: string, broker: Turn | undefined, options: PerfLockOptions = {}): Turn {
  return async () => {
    const releaseLock = await acquirePerfLock(what, options);
    try {
      const releaseTurn = await broker?.();
      return async () => {
        try {
          await releaseTurn?.();
        } finally {
          releaseLock();
        }
      };
    } catch (error) {
      releaseLock();
      throw error;
    }
  };
}

/** Who holds the lock now, or null. */
export function perfLockHolder(path = perfLockPath()): PerfLockHolder | null {
  return readHolder(path);
}
