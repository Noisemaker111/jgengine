/**
 * Per-lane accounting of time spent waiting instead of working.
 *
 * Every child (subagent) session that ran in the window becomes one row: how long it lived, how long
 * its tool calls held it, how much of that was a sleep/poll or a CI watch, and its three slowest
 * commands. Waiting is invisible in a transcript unless someone counts it, so the number is the point.
 *
 * There is no waiting budget here on purpose: a sleep or a CI watch is never necessary, so the gate
 * mode (`--fail-on-waiting`) allows none. Where a number would otherwise be invented, the script
 * reports the lane's position in the measured population instead.
 *
 * `--json` prints the same numbers for another script to consume, `--cwd` scopes the table to one lane
 * and `--fail-on-waiting` turns it into a gate that exits 2.
 *
 * Child sessions are `session_v2.parent_id is not null`; their turns and tool calls are
 * `session_message.type = 'assistant'`, one item per call under `data.content[]` with `type: "tool"`.
 */
import { Database } from "bun:sqlite";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** A call this long is where a lane's wall time went, so it is counted on its own. */
export const OVER_MINUTE_MS = 60_000;

const LONGEST_KEPT = 3;

export type WaitKind = "ci-watch" | "sleep";

/**
 * Three shapes that never need a human or a model to finish: the first two watch CI in the foreground,
 * the rest sleep or poll a status endpoint. `gh pr checks` without `--watch` is a single question and
 * stays ordinary work.
 */
const CI_WATCH_COMMAND = /\bgh\s+run\s+watch\b|\bgh\s+pr\s+checks\b[^\n]*--watch\b|\bgh\s+pr\s+checks\b[^\n]*--interval\b/i;
const LOOP = /\bwhile\s*[($:]|\bfor\s*[($]|\bfor\s+\w+\s+in\b|\bdo\s*\{|\buntil\s+/i;
const STATUS_ENDPOINT =
  /\bgh\s+pr\s+(?:view|checks|status)\b|\bgh\s+api\b[^\n]*actions\/runs|statusCheckRollup|\bgh\s+run\s+(?:list|view)\b|artifacts\/[^\n]*\/check-runs/i;
// wait-ok: matches command text for the audit, it never runs a wait
const SLEEP_COMMAND = /\bStart-Sleep\b|\btimeout\s+\/t\s+\d|\bsleep\s+\d/i;

/**
 * What a single tool call was doing: a foreground CI watch, a sleep or status poll, or ordinary work.
 * CI watch wins when a command both sleeps and asks GitHub, because that is the wait it was serving.
 */
export function classifyCommand(command: string): WaitKind | null {
  if (command.trim() === "") return null;
  if (CI_WATCH_COMMAND.test(command)) return "ci-watch";
  if (/\bgh\s+pr\s+checks\b/i.test(command) && LOOP.test(command)) return "ci-watch";
  if (SLEEP_COMMAND.test(command)) return "sleep";
  if (LOOP.test(command) && STATUS_ENDPOINT.test(command)) return "sleep";
  return null;
}

export interface ToolCall {
  readonly name: string;
  readonly command: string;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly ms: number;
}

export interface SessionIdentity {
  readonly id: string;
  readonly title: string;
  readonly directory: string;
  readonly timeCreated: number;
  readonly timeUpdated: number;
}

export interface WaitCall {
  readonly kind: WaitKind;
  readonly ms: number;
  readonly command: string;
}

export interface SessionAudit {
  readonly id: string;
  readonly title: string;
  readonly directory: string;
  readonly spanMs: number;
  readonly toolMs: number;
  readonly sleepMs: number;
  readonly ciWatchMs: number;
  readonly over60Ms: number;
  readonly waitingShare: number;
  readonly calls: number;
  readonly longest: readonly { readonly ms: number; readonly command: string }[];
  /** Every call that was a sleep/poll or a CI watch, oldest first: what the gate mode names. */
  readonly waits: readonly WaitCall[];
}

export interface RankedAudit extends SessionAudit {
  /** Share of the window's sessions whose waiting minutes are lower; 100 means the worst lane. */
  readonly percentile: number;
}

/** Tool calls in the order they ran, read out of the stored assistant message bodies. */
export function toolCallsFromMessages(messages: readonly { readonly data: string }[]): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const message of messages) {
    let body: unknown;
    try {
      body = JSON.parse(message.data);
    } catch {
      continue;
    }
    const content = (body as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if ((item as { type?: unknown }).type !== "tool") continue;
      const entry = item as {
        name?: string;
        time?: { created?: number; ran?: number; completed?: number };
        state?: { input?: { command?: unknown; cmd?: unknown } };
      };
      const startedAt = entry.time?.created ?? entry.time?.ran;
      const endedAt = entry.time?.completed;
      if (typeof startedAt !== "number" || typeof endedAt !== "number" || endedAt < startedAt) continue;
      const raw = entry.state?.input?.command ?? entry.state?.input?.cmd ?? "";
      calls.push({
        name: entry.name ?? "tool",
        command: typeof raw === "string" ? raw : JSON.stringify(raw),
        startedAt,
        endedAt,
        ms: endedAt - startedAt,
      });
    }
  }
  calls.sort((a, b) => a.startedAt - b.startedAt);
  return calls;
}

export function auditSession(session: SessionIdentity, calls: readonly ToolCall[]): SessionAudit {
  let toolMs = 0;
  let sleepMs = 0;
  let ciWatchMs = 0;
  let over60Ms = 0;
  let lastSeen = session.timeUpdated;
  const waits: WaitCall[] = [];
  for (const call of calls) {
    toolMs += call.ms;
    if (call.ms >= OVER_MINUTE_MS) over60Ms += call.ms;
    const kind = classifyCommand(call.command);
    if (kind === "sleep") sleepMs += call.ms;
    else if (kind === "ci-watch") ciWatchMs += call.ms;
    if (kind !== null) waits.push({ kind, ms: call.ms, command: call.command.trim().split("\n")[0] ?? "" });
    if (call.endedAt > lastSeen) lastSeen = call.endedAt;
  }
  const spanMs = Math.max(0, lastSeen - session.timeCreated);
  const longest = [...calls]
    .filter((call) => call.ms > 0)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, LONGEST_KEPT)
    .map((call) => ({ ms: call.ms, command: call.command.trim().split("\n")[0] ?? "" }));
  return {
    id: session.id,
    title: session.title,
    directory: session.directory,
    spanMs,
    toolMs,
    sleepMs,
    ciWatchMs,
    over60Ms,
    waitingShare: spanMs > 0 ? (sleepMs + ciWatchMs) / spanMs : 0,
    calls: calls.length,
    longest,
    waits,
  };
}

export function waitingMs(audit: SessionAudit): number {
  return audit.sleepMs + audit.ciWatchMs;
}

export interface AuditTotals {
  readonly spanMs: number;
  readonly sleepMs: number;
  readonly ciWatchMs: number;
}

export interface AuditReport {
  readonly sessions: readonly RankedAudit[];
  readonly totals: AuditTotals;
  /** Every child session in the window, before `--cwd` narrowed the rows. */
  readonly population: number;
}

/** Waiting minutes first: the lane that waits most is the one to fix first. */
export function rankSessions(sessions: readonly SessionAudit[]): RankedAudit[] {
  const ranked = [...sessions].sort((a, b) => waitingMs(b) - waitingMs(a) || b.spanMs - a.spanMs);
  const count = ranked.length;
  return ranked.map((audit) => {
    const lower = ranked.filter((other) => waitingMs(other) < waitingMs(audit)).length;
    return { ...audit, percentile: count <= 1 ? 100 : Math.round((lower / (count - 1)) * 100) };
  });
}

export function totals(sessions: readonly SessionAudit[]): AuditTotals {
  const total = (pick: (audit: SessionAudit) => number) => sessions.reduce((sum, audit) => sum + pick(audit), 0);
  return {
    spanMs: total((audit) => audit.spanMs),
    sleepMs: total((audit) => audit.sleepMs),
    ciWatchMs: total((audit) => audit.ciWatchMs),
  };
}

export function buildReport(sessions: readonly SessionAudit[]): AuditReport {
  const ranked = rankSessions(sessions);
  return { sessions: ranked, totals: totals(ranked), population: ranked.length };
}

function minutes(ms: number): string {
  return (ms / 60_000).toFixed(1);
}

function shorten(text: string, width: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= width ? flat : `${flat.slice(0, width - 1)}…`;
}

function normalizeDirectory(path: string): string {
  const trimmed = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return process.platform === "win32" ? trimmed.toLowerCase() : trimmed;
}

/** True when the session ran in `cwd` or under it, so a lane finds itself from its own worktree. */
export function directoryMatches(sessionDirectory: string, cwd: string): boolean {
  const session = normalizeDirectory(sessionDirectory);
  const wanted = normalizeDirectory(cwd);
  if (wanted === "") return true;
  return session === wanted || session.startsWith(`${wanted}/`);
}

export function formatTable(report: AuditReport, window: { readonly hours: number; readonly database: string }): string {
  const rows = report.sessions.map((audit) => [
    audit.waits.length > 0 ? "*" : " ",
    shorten(audit.title, 34),
    minutes(audit.spanMs),
    minutes(audit.toolMs),
    minutes(audit.sleepMs),
    minutes(audit.ciWatchMs),
    minutes(audit.over60Ms),
    String(audit.calls),
    minutes(waitingMs(audit)),
    `${audit.percentile}th`,
    shorten(audit.longest.map((entry) => `${minutes(entry.ms)}m ${entry.command}`).join(" · "), 78),
  ]);
  const headers = ["", "title", "span", "tool", "sleep", "ci", ">1m", "calls", "wait", "pct", "longest calls (min)"];
  const widths = headers.map((header, column) => Math.max(header.length, ...rows.map((row) => row[column]!.length)));
  const line = (cells: readonly string[]) => cells.map((cell, column) => cell.padEnd(widths[column]!)).join("  ").trimEnd();
  const out = [
    `lane wait audit - last ${window.hours}h, ${report.sessions.length} child session(s)`,
    `database ${window.database}`,
    "",
    line(headers),
    line(widths.map((width) => "-".repeat(width))),
    ...rows.map(line),
    "",
    `total span ${minutes(report.totals.spanMs)}m, sleep/poll ${minutes(report.totals.sleepMs)}m,` +
      ` CI watch ${minutes(report.totals.ciWatchMs)}m, waiting ${minutes(report.totals.sleepMs + report.totals.ciWatchMs)}m`,
    `"*" marks a session with a foreground wait; "pct" is its waiting rank among the ${report.population} lanes in the window`,
  ];
  if (report.sessions.length === 1) {
    const only = report.sessions[0]!;
    out.splice(4, 0, `waiting ${minutes(waitingMs(only))} min - ${only.percentile}th percentile of ${report.population} recent lanes`);
  }
  return out.join("\n");
}

export interface AuditOptions {
  readonly hours: number;
  readonly database: string;
  readonly cwd?: string;
  readonly now: number;
}

interface SessionRecord extends SessionIdentity {
  readonly parentId: string | null;
}

/** Child sessions that were still alive in the window, newest first. */
export function loadSessions(database: Database, options: AuditOptions): SessionRecord[] {
  const since = options.now - options.hours * 3_600_000;
  const rows = database
    .query(
      "select id, parent_id, title, directory, time_created, time_updated from session_v2 " +
        "where parent_id is not null and time_updated >= ? order by time_updated desc",
    )
    .all(since) as {
    id: string;
    parent_id: string | null;
    title: string | null;
    directory: string | null;
    time_created: number;
    time_updated: number;
  }[];
  return rows.map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    title: row.title ?? "(untitled)",
    directory: row.directory ?? "",
    timeCreated: row.time_created,
    timeUpdated: row.time_updated,
  }));
}

export function readSessionCalls(database: Database, sessionIds: readonly string[]): Map<string, ToolCall[]> {
  const bySession = new Map<string, ToolCall[]>();
  if (sessionIds.length === 0) return bySession;
  const placeholders = sessionIds.map(() => "?").join(", ");
  const rows = database
    .query(
      `select session_id, data from session_message where type = 'assistant' and session_id in (${placeholders}) order by session_id, seq`,
    )
    .all(...sessionIds) as { session_id: string; data: string }[];
  const grouped = new Map<string, { data: string }[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.session_id);
    if (bucket === undefined) grouped.set(row.session_id, [{ data: row.data }]);
    else bucket.push({ data: row.data });
  }
  for (const [sessionId, messages] of grouped) bySession.set(sessionId, toolCallsFromMessages(messages));
  return bySession;
}

export function auditDatabase(database: Database, options: AuditOptions): AuditReport {
  const sessions = loadSessions(database, options);
  const calls = readSessionCalls(database, sessions.map((session) => session.id));
  const report = buildReport(sessions.map((session) => auditSession(session, calls.get(session.id) ?? [])));
  if (options.cwd === undefined) return report;
  const selected = report.sessions.filter((session) => directoryMatches(session.directory, options.cwd!));
  return { sessions: selected, totals: totals(selected), population: report.population };
}

export function toJson(report: AuditReport): string {
  return JSON.stringify(
    {
      sessions: report.sessions.map((audit) => ({
        id: audit.id,
        title: audit.title,
        directory: audit.directory,
        spanMs: audit.spanMs,
        toolMs: audit.toolMs,
        sleepMs: audit.sleepMs,
        ciWatchMs: audit.ciWatchMs,
        over60Ms: audit.over60Ms,
        waitingShare: Number(audit.waitingShare.toFixed(4)),
        percentile: audit.percentile,
        calls: audit.calls,
        longest: audit.longest.map((entry) => ({ ms: entry.ms, command: entry.command })),
      })),
      totals: report.totals,
      population: report.population,
    },
    null,
    2,
  );
}

/** The OpenCode user-data database, most specific first. `OPENCODE_DB` overrides every guess. */
export function candidateDatabases(env: NodeJS.ProcessEnv = process.env): string[] {
  const home = homedir();
  const candidates = [
    env.OPENCODE_DB,
    env.XDG_DATA_HOME === undefined ? undefined : join(env.XDG_DATA_HOME, "opencode/opencode.db"),
  ];
  if (env.APPDATA !== undefined) candidates.push(join(env.APPDATA, "opencode/opencode.db"));
  if (env.LOCALAPPDATA !== undefined) candidates.push(join(env.LOCALAPPDATA, "opencode/opencode.db"));
  candidates.push(join(home, ".local/share/opencode/opencode.db"), join(home, ".config/opencode/opencode.db"));
  return [...new Set(candidates.filter((candidate): candidate is string => typeof candidate === "string" && candidate !== ""))];
}

/** The first candidate that exists and holds session rows, plus why every candidate was skipped. */
export function resolveDatabase(env: NodeJS.ProcessEnv = process.env): { path?: string; tried: string[] } {
  const tried: string[] = [];
  for (const candidate of candidateDatabases(env)) {
    if (!existsSync(candidate) || !statSync(candidate).isFile()) {
      tried.push(`${candidate} (missing)`);
      continue;
    }
    try {
      const database = new Database(candidate, { readonly: true });
      const rows = database.query("select count(*) as n from session_message").get() as { n: number } | undefined;
      database.close();
      if ((rows?.n ?? 0) > 0) return { path: candidate, tried };
      tried.push(`${candidate} (no session rows)`);
    } catch (error) {
      tried.push(`${candidate} (${(error as Error).message})`);
    }
  }
  return { tried };
}

/**
 * One line per offending call for the gate mode, with its duration and command: the lane cannot act on
 * "you waited" without knowing which command to replace.
 */
export function describeWaits(sessions: readonly RankedAudit[]): string[] {
  const lines: string[] = [];
  for (const audit of sessions) {
    for (const wait of audit.waits) {
      lines.push(`${audit.title} (${audit.id}) ${wait.kind} ${(wait.ms / 60_000).toFixed(1)}m  ${shorten(wait.command, 120)}`);
    }
  }
  return lines;
}

interface Args {
  hours: number;
  database?: string;
  cwd?: string;
  json: boolean;
  failOnWaiting: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { hours: 40, json: false, failOnWaiting: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined) throw new Error(`${flag} needs a value`);
      index += 1;
      return next;
    };
    if (flag === "--hours") args.hours = Number(value());
    else if (flag === "--db") args.database = value();
    else if (flag === "--cwd") args.cwd = value();
    else if (flag === "--json") args.json = true;
    else if (flag === "--fail-on-waiting") args.failOnWaiting = true;
    else if (flag === "--help" || flag === "-h") {
      console.log(
        "usage: bun run lane:audit [--hours N] [--db <path>] [--cwd <dir>] [--json] [--fail-on-waiting]\n" +
          "  --hours N          window, default 40\n" +
          "  --db <path>        OpenCode database, else OPENCODE_DB, else the user-data default\n" +
          "  --cwd <dir>        only sessions whose directory is this path or under it\n" +
          "  --json             machine-readable document on stdout\n" +
          "  --fail-on-waiting  exit 2 when any selected session has a sleep/poll or CI watch call",
      );
      process.exit(0);
    } else throw new Error(`unknown flag ${flag}`);
  }
  if (!Number.isFinite(args.hours) || args.hours <= 0) throw new Error("--hours must be a positive number");
  return args;
}

function main(argv: readonly string[]): number {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(`lane:audit: ${(error as Error).message}`);
    return 1;
  }
  const resolved = args.database ?? resolveDatabase().path;
  if (resolved === undefined) {
    const tried = resolveDatabase().tried;
    console.error(
      "lane:audit: no OpenCode database found.\n" +
        `tried:\n${tried.map((entry) => `  ${entry}`).join("\n")}\n` +
        "pass --db <path> or set OPENCODE_DB to a database with session_v2 and session_message rows.",
    );
    return 1;
  }
  if (!existsSync(resolve(resolved))) {
    const tried = [`${resolve(resolved)} (missing)`, ...resolveDatabase().tried];
    console.error(
      `lane:audit: no database at ${resolve(resolved)}.\n` +
        `tried:\n${tried.map((entry) => `  ${entry}`).join("\n")}\n` +
        "pass --db <path> or set OPENCODE_DB to a database with session_v2 and session_message rows.",
    );
    return 1;
  }
  const database = new Database(resolve(resolved), { readonly: true });
  try {
    const report = auditDatabase(database, {
      hours: args.hours,
      database: resolved,
      cwd: args.cwd === undefined ? undefined : resolve(args.cwd),
      now: Date.now(),
    });
    if (report.sessions.length === 0) {
      console.error(
        `lane:audit: no child sessions in the last ${args.hours}h${args.cwd === undefined ? "" : ` under ${args.cwd}`} (database ${resolved}).` +
          (args.cwd === undefined
            ? ""
            : "\nA child session records the directory its parent ran in, which is often the repo root rather than the worktree."),
      );
      return 1;
    }
    console.log(args.json ? toJson(report) : formatTable(report, { hours: args.hours, database: resolved }));
    if (!args.failOnWaiting) return 0;
    const offending = report.sessions.filter((audit) => audit.waits.length > 0);
    if (offending.length === 0) return 0;
    for (const offline of describeWaits(offending)) console.error(`waiting call: ${offline}`);
    console.error(
      `lane:audit: ${offending.length} of ${report.sessions.length} session(s) waited on a clock.` +
        "\nA sleep or a CI watch is never necessary: start the work and ask once later with" +
        "\n`gh run list`, or check `gh pr checks <n>` without the watch flag.",
    );
    return 2;
  } finally {
    database.close();
  }
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
