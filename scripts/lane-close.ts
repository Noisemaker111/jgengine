// The last step of a lane, done as one command so it is not a paragraph of
// remembered steps:
//
//   bun run lane:close                 # the current branch's lane
//   bun run lane:close --pr 2274
//   bun run lane:close --waive "nightly build really is 20 minutes"
//
// It verifies, lands (staging and committing the lane's work first, with its `changes/`
// fragment as the message), asks `ci:status` once for the truth about the checks, then
// reads this session from `lane:audit` and gates on how it spent its own time. A
// lane that slept or watched CI is refused, because neither is needed any more:
// `ci:status` answers in a second, and a wait on a condition is a command that
// exits when the condition holds. `--waive "<reason>"` overrides the refusal and
// the reason is printed, so a genuinely slow build is recorded rather than hidden.
//
// The numbers come from the audit, never from a threshold chosen here: the lane is
// placed in the measured population by percentile. It exits 2 on waiting, 3 when
// it cannot answer (no PR, no session, no audit), and prints a report skeleton a
// lane can paste instead of writing prose.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const EXIT_CLOSED = 0;
export const EXIT_VERIFY_FAILED = 1;
export const EXIT_WAITED = 2;
export const EXIT_CANNOT_ANSWER = 3;

const root = fileURLToPath(new URL("..", import.meta.url));

export interface LaneCloseArgs {
  pr?: number;
  waive?: string;
  session?: string;
}

export function parseArgs(argv: readonly string[]): LaneCloseArgs {
  const args: LaneCloseArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--pr") {
      const raw = argv[(i += 1)];
      const pr = Number(raw);
      if (raw === undefined || !Number.isInteger(pr) || pr <= 0) throw new Error("--pr needs a PR number");
      args.pr = pr;
    } else if (arg === "--waive") {
      const reason = argv[(i += 1)];
      if (reason === undefined || reason.trim().length === 0) throw new Error("--waive needs a reason");
      args.waive = reason.trim();
    } else if (arg === "--session") args.session = value(argv, (i += 1), arg);
    else throw new Error(`unknown argument ${arg}`);
  }
  return args;
}

function value(argv: readonly string[], at: number, flag: string): string {
  const found = argv[at];
  if (found === undefined || found.startsWith("--")) throw new Error(`${flag} needs a value`);
  return found;
}

/** One command a session ran, as `lane:audit` reports it in `longest`. */
export interface AuditCall {
  command?: string;
  cmd?: string;
  text?: string;
  ms?: number;
  durationMs?: number;
  duration?: number;
  kind?: string;
}

/** A sleep or CI watch the audit counted, as `waits` reports it. */
export interface AuditWait {
  kind?: string;
  ms: number;
  command: string;
}

export interface AuditSession {
  id: string;
  title: string;
  directory: string;
  spanMs: number;
  toolMs: number;
  sleepMs: number;
  ciWatchMs: number;
  waitingShare: number;
  /** Where this lane sits among recent lanes; the audit owns the population it comes from. */
  percentile?: number | null;
  /** How many tool calls the lane made. A count, not a list: `waits` and `longest` carry the calls. */
  calls?: number;
  longest?: AuditCall[];
  /** Every sleep and CI watch, oldest first; absent from audit output older than #2300's follow-up. */
  waits?: AuditWait[];
}

export interface AuditReport {
  sessions: AuditSession[];
  totals?: { sessions?: number; count?: number; n?: number };
  /** Which session `--cwd` attributed this lane to, and why; the audit prints the same line. */
  attribution?: { session: string | null; reason: string; basis?: string | null; references?: number };
}

export interface Waiting {
  sleepMs: number;
  ciWatchMs: number;
  calls: { command: string; ms: number }[];
}

const SLEEP = /\bstart-sleep\b|\bsleep\s+\d|\bsleep\s*\(|\btimeout\s+\/t\b|\bstop-sleep\b/i;
const WATCH = /--watch\b|\brun\s+watch\b|\bchecks\s+--watch\b|\bpr\s+checks\b.*\bwatch\b/i;

function callCommand(call: AuditCall): string {
  return (call.command ?? call.cmd ?? call.text ?? "").trim();
}

function callMs(call: AuditCall): number {
  return call.ms ?? call.durationMs ?? call.duration ?? 0;
}

/** Is this call one of the two unnecessary waits, rather than ordinary work? */
export function isWaitingCall(call: AuditCall): boolean {
  if (call.kind === "sleep" || call.kind === "ciWatch" || call.kind === "ci-watch") return true;
  const command = callCommand(call);
  return SLEEP.test(command) || WATCH.test(command);
}

/**
 * Any sleep or CI watch blocks, because neither is ever required: `ci:status`
 * answers in one shot and a condition wait is a command that returns. There is no
 * tolerable percentage - the count is the gate, not a share of a lane's span.
 *
 * The audits own the waits: `waits` lists every one of them, `longest` only the
 * three slowest commands, so a wait shorter than those is invisible there.
 */
export function waitingGate(session: AuditSession): Waiting & { blocked: boolean } {
  const sleepMs = session.sleepMs ?? 0;
  const ciWatchMs = session.ciWatchMs ?? 0;
  const waits = Array.isArray(session.waits) ? session.waits : [];
  const longest = Array.isArray(session.longest) ? session.longest : [];
  const named: { command: string; ms: number }[] =
    waits.length > 0
      ? waits.map((wait) => ({ command: wait.command?.trim() ?? "", ms: wait.ms ?? 0 }))
      : (longest.filter(isWaitingCall).length > 0 ? longest.filter(isWaitingCall) : longest).map((call) => ({
          command: callCommand(call),
          ms: callMs(call),
        }));
  return {
    sleepMs,
    ciWatchMs,
    calls: named.map((call) => ({ command: call.command || "(command not reported)", ms: call.ms })),
    blocked: sleepMs > 0 || ciWatchMs > 0,
  };
}

/**
 * The session this lane is: the one the harness names, else the one the audit attributed to this
 * worktree by its own commands, else the only one in this directory, else the one with the most
 * waiting. The audit's attribution is the only signal that survives a subagent recording its parent's
 * directory, so it wins over the harness id when the harness id is not one of the rows.
 */
export function pickSession(
  sessions: readonly AuditSession[],
  options: {
    session?: string;
    env?: Record<string, string | undefined>;
    attribution?: { session: string | null; reason: string };
  } = {},
): { session: AuditSession | null; note: string } {
  const want =
    options.session ??
    options.env?.LANE_SESSION_ID ??
    options.env?.CLAUDE_SESSION_ID ??
    options.env?.OPENCODE_SESSION_ID ??
    "";
  if (want.length > 0) {
    const found = sessions.find((session) => session.id === want);
    if (found !== undefined) return { session: found, note: options.attribution?.reason ?? `session ${found.id}` };
  }
  const attributed = options.attribution?.session ?? null;
  if (attributed !== null) {
    const found = sessions.find((session) => session.id === attributed);
    if (found !== undefined) {
      const reason = options.attribution!.reason;
      return {
        session: found,
        note: want.length > 0 ? `${reason}; named session ${want} is not in this lane's rows` : reason,
      };
    }
  }
  if (want.length > 0) return { session: null, note: `no session ${want} in the transcript store` };
  if (sessions.length === 0) return { session: null, note: "no session in this directory in the last 6 hours" };
  if (sessions.length === 1) return { session: sessions[0]!, note: `session ${sessions[0]!.id}` };
  const worst = sessions.reduce((best, session) => (waited(session) > waited(best) || (waited(session) === waited(best) && session.spanMs > best.spanMs) ? session : best), sessions[0]!);
  return {
    session: worst,
    note: `session ${worst.id} (the one with the most waiting of ${sessions.length} in this directory; pass --session <id> to name another)`,
  };
}

function waited(session: AuditSession): number {
  return (session.sleepMs ?? 0) + (session.ciWatchMs ?? 0);
}

export function population(report: AuditReport): number {
  return report.totals?.sessions ?? report.totals?.count ?? report.totals?.n ?? report.sessions.length;
}

function kindOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value === "number" ? "a number" : typeof value === "string" ? "a string" : typeof value === "object" ? "an object" : typeof value;
}

function shapeFailure(path: string, value: unknown, expected: string, keys?: readonly string[]): string {
  const seen = keys === undefined || keys.length === 0 ? "" : ` (keys seen: ${keys.join(", ")})`;
  return `the audit output shape changed: ${path} is ${kindOf(value)}, expected ${expected}${seen}`;
}

/**
 * Everything `lane:close` reads out of `lane:audit --json`, checked before it is used. The two scripts
 * drifted apart once already (`calls` is the lane's call count, not its calls), and a TypeError is not
 * a report: a mismatch says which field and what the document actually carried.
 */
export function auditShapeProblem(value: unknown): string | null {
  if (value === null || typeof value !== "object") return shapeFailure("the document", value, "an object");
  const document = value as { sessions?: unknown };
  if (!Array.isArray(document.sessions)) {
    return shapeFailure("sessions", document.sessions, "an array", Object.keys(document));
  }
  for (const [index, entry] of document.sessions.entries()) {
    if (entry === null || typeof entry !== "object") return shapeFailure(`sessions[${index}]`, entry, "an object");
    const session = entry as Record<string, unknown>;
    const keys = Object.keys(session);
    for (const field of ["id", "title", "directory"] as const) {
      if (typeof session[field] !== "string") return shapeFailure(`sessions[${index}].${field}`, session[field], "a string", keys);
    }
    for (const field of ["spanMs", "toolMs", "sleepMs", "ciWatchMs", "waitingShare"] as const) {
      if (typeof session[field] !== "number") return shapeFailure(`sessions[${index}].${field}`, session[field], "a number", keys);
    }
    if (session.percentile !== undefined && session.percentile !== null && typeof session.percentile !== "number") {
      return shapeFailure(`sessions[${index}].percentile`, session.percentile, "a number or null", keys);
    }
    if (session.calls !== undefined && typeof session.calls !== "number") {
      return shapeFailure(`sessions[${index}].calls`, session.calls, "the lane's call count", keys);
    }
    for (const field of ["longest", "waits"] as const) {
      const list = session[field];
      if (list === undefined) continue;
      if (!Array.isArray(list)) return shapeFailure(`sessions[${index}].${field}`, list, "an array", keys);
      for (const [at, call] of list.entries()) {
        if (call === null || typeof call !== "object") {
          return shapeFailure(`sessions[${index}].${field}[${at}]`, call, "an object", keys);
        }
        if (typeof (call as { ms?: unknown }).ms !== "number") {
          return shapeFailure(`sessions[${index}].${field}[${at}].ms`, (call as { ms?: unknown }).ms, "a number", keys);
        }
      }
    }
  }
  return null;
}

function minutes(ms: number): string {
  return `${Math.round(ms / 60_000)} min`;
}

/** `61st`, `2nd`, `113th`: the ordinal a percentile is read with. */
export function ordinal(value: number): string {
  const rounded = Math.round(value);
  const tens = rounded % 100;
  if (tens >= 11 && tens <= 13) return `${rounded}th`;
  const ones = rounded % 10;
  const suffix = ones === 1 ? "st" : ones === 2 ? "nd" : ones === 3 ? "rd" : "th";
  return `${rounded}${suffix}`;
}

/** Where the lane sits in the measured population, or a plain statement that the audit gave none. */
export function placement(session: AuditSession, count: number): string {
  const percentile = session.percentile;
  if (typeof percentile !== "number" || !Number.isFinite(percentile)) {
    return "percentile not reported by lane:audit";
  }
  const lanes = count === 1 ? "recent lane" : `${count} recent lanes`;
  return `${ordinal(percentile)} percentile of ${lanes}`;
}

export interface ReportInput {
  branch: string;
  pr: number;
  prState?: string;
  prUrl?: string;
  status?: { counts: { pass: number; fail: number; pending: number }; verdict: string; runIds: number[] };
  checksProblem?: string;
  session: AuditSession | null;
  lanes: number;
  filesChanged: string;
  waive?: string;
}

/** The report a lane pastes: the numbers, filled in, with nothing to write by hand. */
export function reportSkeleton(input: ReportInput): string {
  const lines = ["Lane report", `- branch: ${input.branch}`];
  const state = input.prState === undefined ? "" : ` ${input.prState.toLowerCase()}`;
  lines.push(`- PR: #${input.pr}${state}${input.prUrl === undefined ? "" : ` ${input.prUrl}`}`.trimEnd());
  if (input.status === undefined) {
    lines.push(`- checks: unavailable — ${input.checksProblem ?? "ci:status did not answer"}`);
  } else {
    const { pass, fail, pending } = input.status.counts;
    const runs = input.status.runIds.length > 0 ? ` (run ${input.status.runIds.join(", ")})` : "";
    lines.push(`- checks: ${pass} pass, ${fail} fail, ${pending} pending — ${input.status.verdict}${runs}`);
  }
  const session = input.session;
  if (session === null) {
    lines.push("- span/time: unavailable — no session found for this directory");
  } else {
    lines.push(
      `- span ${minutes(session.spanMs)}, tool ${minutes(session.toolMs)}, waiting ${minutes(session.sleepMs + session.ciWatchMs)} — ${placement(session, input.lanes)}`,
    );
  }
  lines.push(`- files changed: ${input.filesChanged}`);
  if (input.waive !== undefined) lines.push(`- waiting waived: ${input.waive}`);
  return lines.join("\n");
}

export interface LaneIo {
  /** Runs one command; `inherit` streams its output instead of capturing it. */
  sh: (argv: string[], inherit: boolean) => { status: number; stdout: string; stderr: string };
  cwd: string;
  env: Record<string, string | undefined>;
  out: (line: string) => void;
  err: (line: string) => void;
}

function lastLine(text: string): string {
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .pop() ?? ""
  );
}

function parseJson<T>(text: string): { value: T } | { error: string } {
  try {
    return { value: JSON.parse(text) as T };
  } catch (error) {
    return { error: `unreadable JSON: ${String(error)}` };
  }
}

export function closeLane(args: LaneCloseArgs, io: LaneIo): number {
  const branchRun = io.sh(["git", "rev-parse", "--abbrev-ref", "HEAD"], false);
  const branch = branchRun.stdout.trim();
  if (branchRun.status !== 0 || branch.length === 0) {
    io.err("lane:close: could not read the current branch");
    return EXIT_CANNOT_ANSWER;
  }
  if (branch === "main" || branch === "beta") {
    io.err(`lane:close: refusing to close ${branch}: a lane is a task branch, not the base`);
    return EXIT_CANNOT_ANSWER;
  }

  io.out(`lane:close: ${branch} — verify:fast`);
  const verified = io.sh(["run", "verify:fast"], true);
  if (verified.status !== 0) {
    io.err(`lane:close: verify:fast failed (exit ${verified.status}); nothing landed`);
    return EXIT_VERIFY_FAILED;
  }

  io.out("lane:close: land --commit");
  const landed = io.sh(["run", "land", "--commit"], true);
  if (landed.status !== 0) {
    io.err(`lane:close: land exited ${landed.status}; the lane is not closed`);
    return landed.status;
  }

  const pr = args.pr ?? branchPr(branch, io);
  if (pr === null) {
    io.err(`lane:close: landed ${branch} but cannot name its PR; no checks or report to print`);
    return EXIT_CANNOT_ANSWER;
  }
  const view = io.sh(["run", "ci:status", "--json", "--pr", String(pr)], false);
  const parsed = parseJson<{
    ok: boolean;
    message?: string;
    state?: string;
    url?: string;
    counts?: { pass: number; fail: number; pending: number };
    verdict?: string;
    runIds?: number[];
  }>(view.stdout);
  const answer = "value" in parsed ? parsed.value : null;
  const status =
    answer !== null && answer.ok === true && answer.counts !== undefined
      ? { counts: answer.counts, verdict: answer.verdict ?? "unknown", runIds: answer.runIds ?? [] }
      : undefined;
  const checksProblem =
    "error" in parsed
      ? parsed.error
      : (answer?.message ?? `ci:status exited ${view.status} and printed no status`);

  const audit = io.sh(["run", "lane:audit", "--json", "--cwd", io.cwd, "--hours", "6"], false);
  if (audit.status !== 0) {
    io.err(
      `lane:close: lane:audit did not run (exit ${audit.status}): ${lastLine(audit.stderr) || lastLine(audit.stdout) || "no output"}`,
    );
    io.err("lane:close: cannot check this lane's waiting without it");
  }
  const auditJson = parseJson<unknown>(audit.stdout);
  let report: AuditReport | null = null;
  if ("error" in auditJson) {
    if (audit.status === 0) io.err(`lane:close: lane:audit output is not JSON (${auditJson.error})`);
  } else {
    const problem = auditShapeProblem(auditJson.value);
    if (problem !== null) {
      io.err(`lane:close: ${problem}`);
      io.err("lane:close: cannot judge this lane's waiting without a readable audit; the gate needs the fields it reads.");
      return EXIT_CANNOT_ANSWER;
    }
    report = auditJson.value as AuditReport;
  }

  const picked =
    report === null
      ? { session: null, note: "no audit report to read" }
      : pickSession(report.sessions, { session: args.session, env: io.env, attribution: report.attribution });
  const lanes = report === null ? 0 : population(report);
  const gate = picked.session === null ? null : waitingGate(picked.session);

  if (gate !== null && gate.blocked && args.waive === undefined) {
    io.err("lane:close: this lane waited, and neither wait is needed any more:");
    io.err(`  session "${picked.session!.title}" (${picked.session!.id})`);
    io.err(`  sleep ${minutes(gate.sleepMs)}, CI watch ${minutes(gate.ciWatchMs)}`);
    for (const call of gate.calls) io.err(`  ${minutes(call.ms)}  ${call.command}`);
    io.err("lane:close: ask `bun run ci:status` for the checks; wait on a condition with a command that exits.");
    io.err('lane:close: --waive "<reason>" records a wait that was genuinely necessary.');
    io.out("");
    io.out(
      reportSkeleton({
        branch,
        pr,
        prState: answer?.state,
        prUrl: answer?.url,
        status,
        checksProblem,
        session: picked.session,
        lanes,
        filesChanged: filesChanged(io),
      }),
    );
    return EXIT_WAITED;
  }
  if (gate !== null && gate.blocked) {
    io.out(`lane:close: waiting waived (${args.waive}): sleep ${minutes(gate.sleepMs)}, CI watch ${minutes(gate.ciWatchMs)}`);
  }
  if (picked.session !== null) io.out(`lane:close: read session "${picked.session.title}" — ${picked.note}`);

  io.out("");
  io.out(
    reportSkeleton({
      branch,
      pr,
      prState: answer?.state,
      prUrl: answer?.url,
      status,
      checksProblem,
      session: picked.session,
      lanes,
      filesChanged: filesChanged(io),
      waive: args.waive,
    }),
  );

  if (picked.session === null) {
    io.err(`lane:close: cannot check waiting: ${picked.note}`);
    return EXIT_CANNOT_ANSWER;
  }
  if (status === undefined) {
    io.err(`lane:close: cannot report the checks: ${checksProblem}`);
    return EXIT_CANNOT_ANSWER;
  }
  return EXIT_CLOSED;
}

/**
 * The PR this branch handed over: open and armed, or already merged. `land` no longer waits, so the
 * PR a lane just produced is usually still open when the report is printed.
 */
function branchPr(branch: string, io: LaneIo): number | null {
  const listed = io.sh(["gh", "pr", "list", "--head", branch, "--state", "all", "--limit", "1", "--json", "number"], false);
  if (listed.status !== 0) return null;
  const parsed = parseJson<{ number: number }[]>(listed.stdout);
  if (!("value" in parsed)) return null;
  const found = parsed.value[0];
  return found === undefined ? null : found.number;
}

function filesChanged(io: LaneIo): string {
  const diff = io.sh(["git", "diff", "--shortstat", "origin/beta...HEAD"], false);
  const text = diff.stdout.trim();
  return text.length > 0 ? text : "none against origin/beta";
}

function main(argv: readonly string[]): void {
  const parsed = parseOrRefuse(argv);
  if ("problem" in parsed) {
    console.error(`lane:close: ${parsed.problem}`);
    process.exit(EXIT_CANNOT_ANSWER);
  } else {
    process.exit(closeLane(parsed.args, realIo()));
  }
}

function parseOrRefuse(argv: readonly string[]): { args: LaneCloseArgs } | { problem: string } {
  try {
    return { args: parseArgs(argv) };
  } catch (error) {
    return { problem: (error as Error).message };
  }
}

function realIo(): LaneIo {
  return {
    sh: (shArgs, inherit) => {
      const [command, ...rest] = shArgs;
      const exe = command === "run" ? process.execPath : command!;
      const run = spawnSync(exe, rest, {
        cwd: root,
        encoding: "utf8",
        stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
      });
      return { status: run.status ?? 1, stdout: run.stdout ?? "", stderr: run.stderr ?? "" };
    },
    /** The checkout this lane runs in, which is the worktree the audit must find. */
    cwd: root,
    env: process.env,
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  };
}

if (import.meta.main) main(process.argv.slice(2));
