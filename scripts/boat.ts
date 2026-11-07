// boat.dev machines for whole Linux checks, so a landing's tests and gates run off this PC.
//
// One machine per run: `boat run --no-env --timeout <s> --push <dir> -- <command>` starts a fresh
// Ubuntu machine, copies `<dir>` in, runs the command, prints its output and cost, deletes the
// machine and exits with the command's code. This module owns everything around that call:
//
// - Capacity. This PC runs at most `BOAT_MAX_MACHINES` (2) machines at once, shared by every
//   thread and repo (Jon, 2026-11-07); boat's paid plan itself allows 100, and boat never queues a
//   start. A run first takes a lease from `fairshare lease boat` and holds it until its machine is
//   deleted, and counts `boat list` only while holding it: counting and then starting let three
//   machines run at once on 2026-11-07, since a machine is missing from the list while it is
//   created. A lease is a lock file Windows frees when its holder dies, so a crash never keeps one.
//   A busy lease, a full count or a start refused for a limit is waited for here: the work never
//   moves back onto this PC because boat was busy.
// - Spent. A start window that frees later than this run waits (the day's starts used, a rate
//   limit hours away): `spent`, with when it frees. The caller stops; it never runs the Linux work
//   on this PC for it, since every thread would then run its whole suite here at once.
// - Unusable. Not logged in, out of hours, the trial over, the network down, no fairshare to hold
//   the cap: `unusable` with the reason in plain words, and the caller runs the work locally, since a landing must still work.
// - Cleanup. Every machine this PC starts is written to a registry in the git common dir with the
//   pid that owns it. The owner deletes it on exit, Ctrl-C included; a machine whose owner died
//   (killed, crashed) is deleted by the next run that looks. `boat list` ends empty.
// - No secrets. `--no-env` starts the machine without the account's stored logins (its default
//   environment holds Jon's), and the pushed directory holds only what the caller put in it.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Machines at once across every thread on the PC, whatever the plan allows (Jon, 2026-11-07). */
export const BOAT_MAX_MACHINES_DEFAULT = 2;

/** The machine count this PC may run: `BOAT_MAX_MACHINES`, else 2. */
export function boatMaxMachines(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const configured = Number(env["BOAT_MAX_MACHINES"]);
  return Number.isInteger(configured) && configured > 0 ? configured : BOAT_MAX_MACHINES_DEFAULT;
}

/** The boat CLI: `BOAT_EXE`, else `~/.ascii/bin/boat(.exe)`, else `boat` on PATH; null when none exists. */
export function boatExe(env: Readonly<Record<string, string | undefined>> = process.env, exists: (path: string) => boolean = existsSync): string | null {
  const configured = env["BOAT_EXE"];
  if (configured !== undefined && configured !== "") return configured === "off" ? null : configured;
  const home = join(homedir(), ".ascii", "bin", process.platform === "win32" ? "boat.exe" : "boat");
  if (exists(home)) return home;
  const onPath = spawnSync(process.platform === "win32" ? "where" : "which", ["boat"], { encoding: "utf8" });
  const found = (onPath.stdout ?? "").split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0);
  return onPath.status === 0 && found !== undefined ? found : null;
}

/** Whether boat can take a start now. */
export type BoatState =
  | { kind: "ready" }
  /** Full for now: a machine or a start-rate window frees on its own. `retryAt` when boat said when. */
  | { kind: "busy"; why: string; retryAt?: number }
  /** Out of starts for longer than a run waits: stop, and never move the work to this PC. `until` when boat said. */
  | { kind: "spent"; why: string; until?: number }
  /** Not usable for this run: the work goes to the local slot. */
  | { kind: "unusable"; why: string };

/** fairshare, which holds this PC's heavy-job slots and boat machine leases: FAIRSHARE_EXE ("off" for none), else where `fairshare install` puts it. */
export function fairshareExe(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  if (env["FAIRSHARE_EXE"] !== undefined) return env["FAIRSHARE_EXE"] === "off" || env["FAIRSHARE_EXE"] === "" ? null : env["FAIRSHARE_EXE"];
  if (process.platform !== "win32" || env["LOCALAPPDATA"] === undefined) return null;
  const path = join(env["LOCALAPPDATA"], "fairshare", "bin", "fairshare.exe");
  return existsSync(path) ? path : null;
}

/** One of this PC's boat machine leases, held; or why none can be. */
export type BoatLease = HeldLease | { unusable: string };
/** `claim` names the lease's machine once boat reports it, so fairshare never counts it twice. */
export type HeldLease = { claim: (id: string) => void; release: () => void };

/** The fields of `boat limits --json` this reads. */
export interface BoatLimits {
  activeSandboxes?: number;
  maxActiveSandboxes?: number;
  canStart?: boolean;
  blockedReason?: string | null;
  startBlockedReason?: string | null;
  trialComputeCapSeconds?: number;
  trialComputeUsedSeconds?: number;
  startWindowFull?: { window?: string; freesAt?: string; short?: string } | null;
  starts?: Partial<Record<"day" | "hour" | "minute", { limit?: number; used?: number; remaining?: number }>>;
}

/** A start-rate window that frees within this is waited for; later, the run stops as spent. */
export const LONGEST_WINDOW_WAIT_MS = 60 * 60_000;

/** A full start window: waited for when it frees within the hour, otherwise spent. */
function windowState(why: string, at: number, now: number): BoatState {
  if (!Number.isFinite(at)) return { kind: "spent", why };
  return at - now <= LONGEST_WINDOW_WAIT_MS ? { kind: "busy", why, retryAt: at } : { kind: "spent", why, until: at };
}

/**
 * What `boat limits` and `boat list` say about starting one machine now. Running machines at the
 * PC's cap, or a start window that frees within the hour, is busy; a window that frees later (the
 * day's starts used) is spent; a blocked account or used compute is unusable. The start windows are
 * read before boat's start block, which can name the same full window.
 */
export function classifyLimits(limits: BoatLimits, running: number, max: number, now: number): BoatState {
  const accountBlock = limits.blockedReason;
  if (accountBlock !== undefined && accountBlock !== null && accountBlock !== "") return { kind: "unusable", why: `boat refuses starts: ${accountBlock}` };
  const cap = limits.trialComputeCapSeconds;
  if (cap !== undefined && cap > 0 && (limits.trialComputeUsedSeconds ?? 0) >= cap) {
    return { kind: "unusable", why: "the boat trial used all its compute hours" };
  }
  const full = limits.startWindowFull;
  if (full !== undefined && full !== null) {
    const freesAt = full.freesAt === undefined ? Number.NaN : Date.parse(full.freesAt);
    return windowState(`boat's ${full.window ?? "start"} start limit is used${Number.isFinite(freesAt) ? ` until ${new Date(freesAt).toISOString()}` : ""}`, freesAt, now);
  }
  const day = limits.starts?.day;
  if (day?.remaining === 0) return { kind: "spent", why: day.limit === undefined ? "boat used all of the day's starts" : `boat used all ${day.limit} of the day's starts` };
  for (const window of ["hour", "minute"] as const) {
    if (limits.starts?.[window]?.remaining === 0) return { kind: "busy", why: `boat's ${window} start limit is used` };
  }
  const startBlock = limits.startBlockedReason;
  if (startBlock !== undefined && startBlock !== null && startBlock !== "") return { kind: "unusable", why: `boat refuses starts: ${startBlock}` };
  const allowed = Math.min(max, limits.maxActiveSandboxes ?? max);
  const active = Math.max(running, limits.activeSandboxes ?? 0);
  if (active >= allowed) return { kind: "busy", why: `${active} boat machine(s) already run, the most this PC uses at once is ${allowed}` };
  return { kind: "ready" };
}

/** An `{"event":"error"}` line from `boat run --json` that refused the start. */
export interface BoatError {
  event?: string;
  code?: string;
  status?: number;
  error?: string;
  retryAfterSeconds?: number;
  nextStartAt?: string;
}

/** The codes boat answers when a start is refused for a limit that frees on its own. */
const BUSY_CODES = new Set(["limit_reached", "member_limit_reached", "no_ready_machine", "out_of_capacity", "IP_RATE_LIMIT_EXCEEDED"]);

/** What a refused start means: busy (wait, then start again), spent (stop) or unusable (run locally). */
export function classifyStartError(error: BoatError, now: number): BoatState {
  const code = error.code ?? "";
  const why = (error.error ?? code).split("\n")[0]!.trim() || `boat refused the start (${error.status ?? "no status"})`;
  if (code === "rate_limited") {
    return windowState(why, error.nextStartAt === undefined ? now + (error.retryAfterSeconds ?? 60) * 1000 : Date.parse(error.nextStartAt), now);
  }
  if (BUSY_CODES.has(code)) {
    return error.retryAfterSeconds === undefined ? { kind: "busy", why } : { kind: "busy", why, retryAt: now + error.retryAfterSeconds * 1000 };
  }
  return { kind: "unusable", why };
}

/** Seconds between capacity checks: 15, 30, then every 60, each with up to a fifth more so threads spread out. Every thread on the PC races for a freed machine, so the cap stays short; a check is two cheap API reads. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(60_000, 15_000 * 2 ** Math.max(0, attempt));
  return Math.round(base * (1 + random() * 0.2));
}

/** One command's exit and its whole output. */
export interface CliResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** What this module needs of the boat CLI and the clock, so a test can stand in for both. */
export interface BoatCli {
  limits: () => Promise<CliResult>;
  list: () => Promise<CliResult>;
  /** `boat run`: each stdout line goes to `onLine` as it arrives; resolves with the exit. */
  run: (args: readonly string[], onLine: (line: string) => void, onErr: (line: string) => void) => Promise<{ status: number }>;
  delete: (id: string) => Promise<CliResult>;
  /** Wait its turn for one of this PC's boat machine leases (`fairshare lease boat`); `note` hears why it waits. */
  lease: (what: string, note: (line: string) => void) => Promise<BoatLease>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

/** The machines `boat list --json` reports running, by id. */
export function runningIds(text: string): string[] | null {
  try {
    const parsed = JSON.parse(text) as { sandboxes?: { id?: string }[] };
    return (parsed.sandboxes ?? []).flatMap((sandbox) => (typeof sandbox.id === "string" ? [sandbox.id] : []));
  } catch {
    return null;
  }
}

/** Why a failed `boat limits` / `boat list` means boat cannot be used: its own words, first line. */
function cliProblem(result: CliResult, what: string): string {
  const text = `${result.stderr}\n${result.stdout}`.trim();
  try {
    const parsed = JSON.parse(text.split("\n").find((line) => line.trim().startsWith("{")) ?? "") as BoatError;
    if (parsed.error !== undefined) return `${what}: ${parsed.error.split("\n")[0]}`;
  } catch {
    // not JSON: the plain words below
  }
  const first = text.split("\n").map((line) => line.trim()).find((line) => line.length > 0);
  return `${what} failed (exit ${result.status})${first === undefined ? "" : `: ${first}`}`;
}

/** Ask boat once whether a start can go now. */
export async function boatState(cli: BoatCli, max: number): Promise<BoatState> {
  const [limits, list] = await Promise.all([cli.limits(), cli.list()]);
  if (limits.status !== 0) return { kind: "unusable", why: cliProblem(limits, "boat limits") };
  if (list.status !== 0) return { kind: "unusable", why: cliProblem(list, "boat list") };
  let parsed: BoatLimits;
  try {
    parsed = JSON.parse(limits.stdout) as BoatLimits;
  } catch {
    return { kind: "unusable", why: "boat limits printed no JSON" };
  }
  const ids = runningIds(list.stdout);
  if (ids === null) return { kind: "unusable", why: "boat list printed no JSON" };
  return classifyLimits(parsed, ids.length, max, cli.now());
}

/**
 * Wait until boat can take a start: every busy answer waits (`backoffMs`, or until the time boat
 * named), and the first note says what it waits for. Resolves `ready`, or `spent` / `unusable`
 * with why. `maxWaitMs` bounds the wait; past it the answer is spent, so a caller is never stuck
 * forever and never moves the work to this PC because boat stayed full.
 */
export async function waitForCapacity(
  cli: BoatCli,
  options: { max: number; note: (line: string) => void; maxWaitMs?: number; first?: BoatState },
): Promise<{ state: BoatState; waitedMs: number }> {
  const started = cli.now();
  let attempt = 0;
  let lastWhy = "";
  let state = options.first ?? (await boatState(cli, options.max));
  while (state.kind === "busy") {
    const waited = cli.now() - started;
    if (options.maxWaitMs !== undefined && waited >= options.maxWaitMs) {
      return { state: { kind: "spent", why: `boat stayed full for ${Math.round(waited / 60_000)} min (${state.why})` }, waitedMs: waited };
    }
    if (state.why !== lastWhy) {
      options.note(`boat: waiting for a machine: ${state.why}. The Linux steps wait for boat; they do not run on this PC.`);
      lastWhy = state.why;
    }
    const pause = state.retryAt === undefined ? backoffMs(attempt) : Math.max(5_000, Math.min(state.retryAt - cli.now() + 2_000, LONGEST_WINDOW_WAIT_MS));
    await cli.sleep(pause);
    attempt += 1;
    state = await boatState(cli, options.max);
  }
  return { state, waitedMs: cli.now() - started };
}

// ---- The registry of machines this PC started ----

/** One machine a run on this PC started, and the process that owns it. */
export interface MachineEntry {
  id: string;
  pid: number;
  startedAt: number;
  what: string;
}

/** The registry file: in the git common dir, so every worktree of the repository shares it. */
export function registryPath(root: string): string {
  const common = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: root, encoding: "utf8" });
  const dir = common.status === 0 && common.stdout.trim().length > 0 ? common.stdout.trim() : join(root, ".scratch");
  return join(dir, "boat-machines.json");
}

export function readRegistry(path: string): MachineEntry[] {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as MachineEntry[];
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry.id === "string" && typeof entry.pid === "number") : [];
  } catch {
    return [];
  }
}

/** Read, change and write the registry under a lock file, so two runs never lose each other's entries. */
export function updateRegistry(path: string, change: (entries: MachineEntry[]) => MachineEntry[]): MachineEntry[] {
  mkdirSync(dirname(path), { recursive: true });
  const lock = `${path}.lock`;
  const deadline = Date.now() + 5_000;
  for (;;) {
    try {
      writeFileSync(lock, String(process.pid), { flag: "wx" });
      break;
    } catch {
      // A lock older than 30 s belongs to a run that died while holding it.
      try {
        const age = Date.now() - Bun.file(lock).lastModified;
        if (age > 30_000) rmSync(lock, { force: true });
      } catch {
        // gone already
      }
      if (Date.now() > deadline) break;
      Bun.sleepSync(25);
    }
  }
  try {
    const next = change(readRegistry(path));
    writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return next;
  } finally {
    rmSync(lock, { force: true });
  }
}

/** Whether a process is alive (signal 0 probes without touching it). */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Delete every registered machine whose owner is gone (killed or crashed before it could delete
 * its own). Machines this registry does not list (another repo's, another tool's) are never touched.
 * Returns the ids deleted.
 */
export async function reapOrphans(cli: BoatCli, path: string, alive: (pid: number) => boolean = pidAlive): Promise<string[]> {
  const orphans = readRegistry(path).filter((entry) => entry.pid !== process.pid && !alive(entry.pid));
  const deleted: string[] = [];
  for (const entry of orphans) {
    const result = await cli.delete(entry.id);
    // A machine that is already gone needs nothing more; anything else stays listed for the next look.
    if (result.status === 0 || /not.?found|no such|404/i.test(`${result.stdout}${result.stderr}`)) deleted.push(entry.id);
  }
  if (deleted.length > 0) updateRegistry(path, (entries) => entries.filter((entry) => !deleted.includes(entry.id)));
  return deleted;
}

// ---- One run ----

/** What `boat run` reported about its machine, for the receipt. */
export interface RunFacts {
  id?: string;
  costUsd?: number;
  seconds?: number;
  /** Whether boat said it deleted the machine. */
  deleted?: boolean;
}

/**
 * The id, cost and seconds a `boat run --json` event reports, merged into `facts`. Measured
 * 2026-11-07: `{"event":"created","id":"bx_…"}` first, then the command's output as
 * `{"type":"stdout","data":"…"}` chunks, `{"type":"exit","exitCode":3}`, and last
 * `{"event":"summary","deleted":true,"dollars":0.0001,"elapsedSeconds":10,"exitCode":3}`.
 */
export function readRunFacts(event: Record<string, unknown>, facts: RunFacts): void {
  if (facts.id === undefined && typeof event["id"] === "string" && event["id"].startsWith("bx_")) facts.id = event["id"];
  if (event["event"] !== "summary") return;
  if (typeof event["dollars"] === "number") facts.costUsd = event["dollars"];
  if (typeof event["elapsedSeconds"] === "number") facts.seconds = event["elapsedSeconds"];
  if (typeof event["deleted"] === "boolean") facts.deleted = event["deleted"];
}

export interface RunOptions {
  /** The directory `--push` copies in; nothing else reaches the machine. */
  push: string;
  /** The command on the machine (an argv; boat runs it in the pushed directory). */
  command: readonly string[];
  timeoutSeconds: number;
  /** What the registry calls this run, for a person reading it. */
  what: string;
  registry: string;
  max: number;
  /** Every stdout line of the command, as it arrives (boat's own JSON events are filtered out). */
  onLine: (line: string) => void;
  /** Every stderr line of the command; stdout's handler when absent. */
  onErrLine?: (line: string) => void;
  /** Boat's own progress and error words, not the command's. */
  onBoatLine?: (line: string) => void;
  note: (line: string) => void;
  maxWaitMs?: number;
}

export type RunOutcome =
  | { kind: "ran"; status: number; facts: RunFacts; waitedMs: number }
  | { kind: "spent"; why: string; until?: number; waitedMs: number }
  | { kind: "unusable"; why: string; waitedMs: number };

/** A line boat itself printed (an `event` or `type` record of `--json`); null for anything else. */
export function boatEvent(line: string): Record<string, unknown> | null {
  if (!line.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    return typeof parsed["event"] === "string" || typeof parsed["type"] === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Joins the command's output chunks into whole lines: boat cuts `data` wherever it likes, so one
 * long result line can arrive in several events.
 */
export function lineJoiner(emit: (line: string) => void): { push: (data: string) => void; end: () => void } {
  let rest = "";
  return {
    push: (data) => {
      rest += data;
      const parts = rest.split(/\r?\n/);
      rest = parts.pop() ?? "";
      for (const part of parts) emit(part);
    },
    end: () => {
      if (rest.length > 0) emit(rest);
      rest = "";
    },
  };
}

/**
 * Run one command on one boat machine: wait for capacity, start, stream, and make sure the machine
 * is deleted whatever happens. A start refused for capacity goes back to waiting, one refused for
 * starts used for hours answers spent, and any other refusal unusable. A refusal with a code this
 * does not know is judged by `boat limits` read right after, so a newly full window is never unusable. `--timeout` is always passed, so a hung command never runs on plan hours.
 */
export async function runOnBoat(cli: BoatCli, options: RunOptions): Promise<RunOutcome> {
  const asked = cli.now();
  // Held from before the first count of running machines until this run's machine is deleted.
  const lease = await cli.lease(options.what, options.note);
  if ("unusable" in lease) return { kind: "unusable", why: lease.unusable, waitedMs: cli.now() - asked };
  try {
    return await runLeased(cli, options, lease, cli.now() - asked);
  } finally {
    lease.release();
  }
}

async function runLeased(cli: BoatCli, options: RunOptions, lease: HeldLease, leaseWaitMs: number): Promise<RunOutcome> {
  await reapOrphans(cli, options.registry);
  let waitedMs = leaseWaitMs;
  let first: BoatState | undefined;
  for (;;) {
    const waited = await waitForCapacity(cli, { max: options.max, note: options.note, ...(options.maxWaitMs === undefined ? {} : { maxWaitMs: Math.max(0, options.maxWaitMs - waitedMs) }), ...(first === undefined ? {} : { first }) });
    waitedMs += waited.waitedMs;
    if (waited.state.kind === "spent" || waited.state.kind === "unusable") return { ...waited.state, waitedMs };

    const facts: RunFacts = {};
    let refused: BoatError | null = null;
    let registered: string | null = null;
    const register = (id: string): void => {
      if (registered !== null) return;
      registered = id;
      lease.claim(id);
      updateRegistry(options.registry, (entries) => [...entries.filter((entry) => entry.id !== id), { id, pid: process.pid, startedAt: cli.now(), what: options.what }]);
    };
    const stdout = lineJoiner(options.onLine);
    const stderr = lineJoiner(options.onErrLine ?? options.onLine);
    const handle = (line: string): void => {
      const event = boatEvent(line);
      if (event === null) {
        // Boat's own words (a progress line such as "creating a default sandbox...").
        if (line.trim().length > 0) options.onBoatLine?.(line);
        return;
      }
      readRunFacts(event, facts);
      if (facts.id !== undefined) register(facts.id);
      if (event["event"] === "error" && registered === null) refused = event as BoatError;
      else if (event["type"] === "stdout" && typeof event["data"] === "string") stdout.push(event["data"]);
      else if (event["type"] === "stderr" && typeof event["data"] === "string") stderr.push(event["data"]);
      else if (event["event"] === "error") options.onBoatLine?.(String(event["error"] ?? line));
    };
    const onLine = handle;
    const onErr = handle;
    const args = ["run", "--json", "--no-env", "--no-update", "--timeout", String(options.timeoutSeconds), "--push", options.push, "--", ...options.command];
    let status: number;
    try {
      ({ status } = await cli.run(args, onLine, onErr));
    } finally {
      stdout.end();
      stderr.end();
      // `boat run` deletes its machine when it ends; this makes sure, Ctrl-C and crashes included.
      if (registered !== null) await settleMachine(cli, options.registry, registered, facts.deleted === true);
    }
    const refusal = refused as BoatError | null;
    if (refusal !== null && registered === null) {
      let state = classifyStartError(refusal, cli.now());
      if (state.kind === "unusable") {
        const now = await boatState(cli, options.max);
        if (now.kind === "busy" || now.kind === "spent") state = now;
      }
      if (state.kind === "spent" || state.kind === "unusable") return { ...state, waitedMs };
      first = state;
      continue;
    }
    return { kind: "ran", status, facts, waitedMs };
  }
}

/** After a run: delete the machine if it still exists, then drop it from the registry. */
async function settleMachine(cli: BoatCli, registry: string, id: string, deleted: boolean): Promise<void> {
  if (!deleted) {
    const list = await cli.list();
    const ids = runningIds(list.stdout);
    if (ids === null || ids.includes(id)) await cli.delete(id);
  }
  updateRegistry(registry, (entries) => entries.filter((entry) => entry.id !== id));
}

/** Delete every machine this process registered (an exit path: Ctrl-C, a thrown error). */
export function deleteOwnMachinesSync(exe: string, registry: string): void {
  const own = readRegistry(registry).filter((entry) => entry.pid === process.pid);
  for (const entry of own) spawnSync(exe, ["delete", entry.id, "--yes", "--no-update"], { encoding: "utf8", timeout: 30_000 });
  if (own.length > 0) updateRegistry(registry, (entries) => entries.filter((entry) => entry.pid !== process.pid));
}

/**
 * `fairshare lease boat`: resolves once it prints "held". The lease ends when `release` closes its
 * stdin, or when this process dies and Windows closes the pipe.
 */
export function fairshareLease(fairshare: string | null, what: string, note: (line: string) => void): Promise<BoatLease> {
  if (fairshare === null) return Promise.resolve({ unusable: "fairshare is not installed, so this PC's boat machine cap cannot be held (run `fairshare install`)" });
  return new Promise((resolve) => {
    const child = spawn(fairshare, ["lease", "boat", "--label", what], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let out = "";
    let err = "";
    let held = false;
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
      if (!held && /^held\r?$/m.test(out)) {
        held = true;
        resolve({
          claim: (id) => {
            if (child.stdin.writable) child.stdin.write(`machine ${id}\n`);
          },
          release: () => {
            child.stdin.end();
            setTimeout(() => child.kill(), 5_000).unref();
          },
        });
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString("utf8");
      for (const line of chunk.toString("utf8").split(/\r?\n/)) if (line.trim().length > 0) note(line.trim());
    });
    child.on("error", (error) => {
      if (!held) resolve({ unusable: `fairshare lease could not start: ${error.message}` });
    });
    child.on("close", (code) => {
      const last = err.trim().split(/\r?\n/).at(-1) ?? "";
      if (!held) resolve({ unusable: `fairshare lease ended before holding a lease (exit ${code ?? "none"})${last === "" ? "" : `: ${last}`}` });
    });
  });
}

/** The real CLI. */
export function realBoatCli(exe: string, fairshare: string | null = fairshareExe()): BoatCli {
  const capture = (args: string[]): Promise<CliResult> =>
    new Promise((resolve) => {
      const child = spawn(exe, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
      child.on("error", (error) => resolve({ status: 127, stdout, stderr: `${stderr}${String(error)}` }));
      child.on("close", (code) => resolve({ status: code ?? 1, stdout, stderr }));
    });
  return {
    limits: () => capture(["limits", "--json", "--no-update"]),
    list: () => capture(["list", "--json", "--no-update"]),
    delete: (id) => capture(["delete", id, "--yes", "--no-update"]),
    run: (args, onLine, onErr) =>
      new Promise((resolve) => {
        const child = spawn(exe, [...args], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
        const lines = (emit: (line: string) => void) => {
          let rest = "";
          return {
            data: (chunk: Buffer): void => {
              rest += chunk.toString("utf8");
              const parts = rest.split(/\r?\n/);
              rest = parts.pop() ?? "";
              for (const part of parts) emit(part);
            },
            end: (): void => {
              if (rest.length > 0) emit(rest);
              rest = "";
            },
          };
        };
        const out = lines(onLine);
        const err = lines(onErr);
        child.stdout.on("data", out.data);
        child.stderr.on("data", err.data);
        child.on("error", (error) => {
          onErr(String(error));
          resolve({ status: 127 });
        });
        child.on("close", (code) => {
          out.end();
          err.end();
          resolve({ status: code ?? 1 });
        });
      }),
    lease: (what, note) => fairshareLease(fairshare, what, note),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: Date.now,
  };
}
