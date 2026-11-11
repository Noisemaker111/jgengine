/**
 * The machine's one limit on browsers rendering games at once. Every capture, drive, perf run, boot
 * probe and broker browser takes a render slot before its Chrome starts and holds it while that
 * Chrome lives, whether it came through the broker or not.
 *
 * Before this, nothing counted them: the broker's one shared browser was the only limit, and any run
 * that passed the broker by (a slow broker under load, an explicit `--port`, a duplicate broker on
 * another port) started its own Chrome. On a boat host (2026-11-11, 8 cores) that reached 60 chrome
 * processes and five software-GL GPU processes at 50-96% CPU each, load 107, memory full: every
 * capture on the machine slowed, timed out, and was started again by its run, adding more load.
 *
 * A slot is a file `<tmp>/jgengine-render/slot-<n>.json` created exclusively, naming the launcher's
 * pid and, once it exists, the browser's. A slot whose processes are all gone is taken back, so a
 * killed run never holds one. `JG_RENDER_SLOTS` sets the count; by default it is sized to the
 * machine (`renderSlotCount`). Where fairshare is installed it already measures the machine, so a
 * slot beyond the first also needs `fairshare room` to say there is room. A run that finds every slot
 * held waits its turn and says who holds them; it never starts a browser outside the count.
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, linkSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir, totalmem } from "node:os";
import { join } from "node:path";

export const RENDER_SLOTS_ENV = "JG_RENDER_SLOTS";
export const RENDER_WAIT_ENV = "JG_RENDER_WAIT_MINUTES";
export const RENDER_DIR_ENV = "JG_RENDER_DIR";

/** What one rendering browser costs the machine, for the default count and fairshare's room check. */
export const RENDER_CORES = 4;
export const RENDER_MEM_GB = 4;

/**
 * Slots on this machine: `JG_RENDER_SLOTS`, else one per four threads and four GB of memory, at least
 * one. A software-GL GPU process alone keeps a core busy, and the page, the dev server and the run
 * beside it take the rest; 8 threads and 16 GB give two.
 */
export function renderSlotCount(env: NodeJS.ProcessEnv = process.env, threads = availableParallelism(), memBytes = totalmem()): number {
  const asked = Number(env[RENDER_SLOTS_ENV]);
  if (Number.isInteger(asked) && asked > 0) return asked;
  return Math.max(1, Math.min(Math.floor(threads / RENDER_CORES), Math.floor(memBytes / 2 ** 30 / RENDER_MEM_GB)));
}

export function renderWaitMs(env: NodeJS.ProcessEnv = process.env): number {
  const minutes = Number(env[RENDER_WAIT_ENV]);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 10) * 60_000;
}

export function renderSlotDir(env: NodeJS.ProcessEnv = process.env): string {
  return env[RENDER_DIR_ENV] ?? join(tmpdir(), "jgengine-render");
}

export interface SlotRecord {
  token: string;
  label: string;
  /** The process that took the slot. */
  pid: number;
  /** The browser it started, once started; the slot lives while either lives. */
  browserPid?: number;
  takenAt: string;
}

export interface RenderSlot {
  index: number;
  /** Name the browser this slot is for, so the slot outlives the launcher while that browser runs. */
  attach(browserPid: number | undefined): void;
  release(): void;
}

export interface RenderSlotOptions {
  label: string;
  env?: NodeJS.ProcessEnv;
  /** Is this pid running. */
  alive?: (pid: number) => boolean;
  /** Is there room on the machine for one more browser: true, false, or null when nothing can tell. */
  room?: () => boolean | null;
  sleep?: (ms: number) => void;
  now?: () => number;
  log?: (line: string) => void;
  pid?: number;
}

export function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * fairshare's answer for one more browser, when it is installed: `fairshare room` exits 0 for room,
 * 1 for none and 2 when it cannot tell. Null when there is no fairshare or it could not answer.
 */
export function fairshareRoom(env: NodeJS.ProcessEnv = process.env): boolean | null {
  const exe = env["FAIRSHARE_EXE"] ?? Bun.which("fairshare");
  if (exe === null || exe === undefined || exe === "") return null;
  const run = spawnSync(exe, ["room", "--cores", String(RENDER_CORES / 2), "--mem-gb", String(RENDER_MEM_GB / 2)], { stdio: "ignore", timeout: 10_000, windowsHide: true });
  if (run.status === 0) return true;
  if (run.status === 1) return false;
  return null;
}

function readSlot(path: string): SlotRecord | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as SlotRecord;
  } catch {
    return null;
  }
}

function holderAlive(record: SlotRecord | null, alive: (pid: number) => boolean): boolean {
  if (record === null) return false;
  return alive(record.pid) || (record.browserPid !== undefined && alive(record.browserPid));
}

/** Who holds each slot now, for a waiting run's line and `status`. */
export function renderSlotHolders(env: NodeJS.ProcessEnv = process.env, alive: (pid: number) => boolean = pidAlive): SlotRecord[] {
  const dir = renderSlotDir(env);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^slot-\d+\.json$/.test(name))
    .map((name) => readSlot(join(dir, name)))
    .filter((record): record is SlotRecord => holderAlive(record, alive));
}

/**
 * Take back a slot whose holders are gone. The rename is atomic, so of two runs that both saw it
 * stale only one moves it; a run that moved a slot someone had just taken puts it back.
 */
function reclaim(path: string, stale: SlotRecord | null, pid: number): void {
  const tomb = `${path}.${pid}.${randomUUID()}.stale`;
  try {
    renameSync(path, tomb);
  } catch {
    return;
  }
  const moved = readSlot(tomb);
  if (moved !== null && (stale === null || moved.token !== stale.token)) {
    try {
      linkSync(tomb, path);
    } catch {
      /* someone took the slot again meanwhile; this one is gone */
    }
  }
  rmSync(tomb, { force: true });
}

/**
 * Create the slot with its record already in it: written to a file of its own, then linked into
 * place, which fails when the slot exists. Created empty and written after, another run could read
 * the empty file in between, call it stale and take the same slot (four browsers on two slots under
 * a loaded gate).
 */
function tryTake(path: string, record: SlotRecord): boolean {
  const temporary = `${path}.${record.token}.new`;
  writeFileSync(temporary, JSON.stringify(record));
  try {
    linkSync(temporary, path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  } finally {
    rmSync(temporary, { force: true });
  }
}

/** A slot file nobody can read is a run mid-write, or wreckage once it is this old. */
const UNREADABLE_STALE_MS = 10_000;

function stale(path: string, record: SlotRecord | null, alive: (pid: number) => boolean, now: number): boolean {
  if (record !== null) return !holderAlive(record, alive);
  try {
    return now - statSync(path).mtimeMs > UNREADABLE_STALE_MS;
  } catch {
    return false;
  }
}

export const RENDER_UNDER_TEST_ENV = "JG_RENDER_UNDER_TEST";
export const RENDER_SLOTS_IN_TESTS_ENV = "JG_RENDER_SLOTS_IN_TESTS";

/**
 * A browser a test starts (in `bun test`, or in a process a test spawned) takes no slot: its runner's
 * lanes already bound it (`verify:fast --jobs`), and a slot wait inside a test's 20 s budget would turn
 * the machine's load into a red test. `JG_RENDER_SLOTS_IN_TESTS=1` puts a test back under the slots.
 */
export function slotsSkipped(env: NodeJS.ProcessEnv, main: string = Bun.main): boolean {
  if (env[RENDER_SLOTS_IN_TESTS_ENV] === "1") return false;
  if (env[RENDER_UNDER_TEST_ENV] === "1") return true;
  if (!/\.(test|spec)\.[cm]?[jt]sx?$/.test(main)) return false;
  // What the test spawns inherits this, so a drive a test starts is a test's browser too.
  env[RENDER_UNDER_TEST_ENV] = "1";
  return true;
}

const UNCOUNTED: RenderSlot = { index: -1, attach: () => {}, release: () => {} };

/**
 * Take a render slot, waiting while every slot is held, and throw once the wait (`JG_RENDER_WAIT_MINUTES`,
 * 10) runs out. Synchronous, so the one browser launch every path calls can take it.
 */
export function takeRenderSlot(options: RenderSlotOptions): RenderSlot {
  const env = options.env ?? process.env;
  if (slotsSkipped(env)) return UNCOUNTED;
  const alive = options.alive ?? pidAlive;
  const room = options.room ?? (() => fairshareRoom(env));
  const sleep = options.sleep ?? ((ms: number) => Bun.sleepSync(ms));
  const now = options.now ?? Date.now;
  const log = options.log ?? ((line: string) => console.error(line));
  const pid = options.pid ?? process.pid;
  const count = renderSlotCount(env);
  const dir = renderSlotDir(env);
  mkdirSync(dir, { recursive: true });
  const deadline = now() + renderWaitMs(env);
  let said = false;
  for (;;) {
    let held = 0;
    for (let index = 0; index < count; index += 1) {
      const path = join(dir, `slot-${index}.json`);
      if (existsSync(path)) {
        const current = readSlot(path);
        if (!stale(path, current, alive, now())) {
          held += 1;
          continue;
        }
        reclaim(path, current, pid);
      }
      // A second browser at once only when the machine has room for it, where something can tell.
      if (held > 0 && room() === false) break;
      const record: SlotRecord = { token: randomUUID(), label: options.label, pid, takenAt: new Date(now()).toISOString() };
      if (!tryTake(path, record)) {
        held += 1;
        continue;
      }
      return slotHandle(index, path, record);
    }
    // A run already holding a slot that needs a second browser at once (an A/B pair) would wait on
    // itself until the wait ran out: it takes one past the count instead, never more than it holds.
    const mine = renderSlotHolders(env, alive).filter((holder) => holder.pid === pid).length;
    if (held >= count && mine > 0) {
      for (let index = count; index < count + mine + 1; index += 1) {
        const path = join(dir, `slot-${index}.json`);
        if (existsSync(path)) {
          const current = readSlot(path);
          if (!stale(path, current, alive, now())) continue;
          reclaim(path, current, pid);
        }
        const record: SlotRecord = { token: randomUUID(), label: options.label, pid, takenAt: new Date(now()).toISOString() };
        if (tryTake(path, record)) return slotHandle(index, path, record);
      }
    }
    if (now() >= deadline) {
      throw new Error(`render slots: all ${count} held for ${Math.round(renderWaitMs(env) / 60_000)} min by ${describeHolders(renderSlotHolders(env, alive))}; ${RENDER_SLOTS_ENV} sets the count`);
    }
    if (!said) {
      said = true;
      log(`render slots: waiting for one of ${count} (held by ${describeHolders(renderSlotHolders(env, alive))})`);
    }
    sleep(500);
  }
}

function describeHolders(holders: readonly SlotRecord[]): string {
  if (holders.length === 0) return "nobody now; fairshare says the machine has no room";
  return holders.map((holder) => `${holder.label} (pid ${holder.pid}${holder.browserPid === undefined ? "" : `, browser ${holder.browserPid}`})`).join("; ");
}

function slotHandle(index: number, path: string, record: SlotRecord): RenderSlot {
  let released = false;
  return {
    index,
    attach(browserPid) {
      if (released || browserPid === undefined) return;
      record.browserPid = browserPid;
      const current = readSlot(path);
      if (current?.token === record.token) writeFileSync(path, JSON.stringify(record));
    },
    release() {
      if (released) return;
      released = true;
      const current = readSlot(path);
      if (current?.token !== record.token) return;
      try {
        unlinkSync(path);
      } catch {
        /* already taken back */
      }
    },
  };
}
