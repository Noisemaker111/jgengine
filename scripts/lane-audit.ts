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
 * `--cwd` resolves the lane by evidence: a child session records the directory of the agent that
 * spawned it, which is often the repo root rather than the worktree, so the lane is the session whose
 * own commands name that path. The pick and its reason are printed, never assumed.
 *
 * Child sessions are `session_v2.parent_id is not null`; their turns and tool calls are
 * `session_message.type = 'assistant'`, one item per call under `data.content[]` with `type: "tool"`.
 */
import { Database } from "bun:sqlite";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { printHelpIfAsked } from "./script-help";

const LANE_AUDIT_USAGE = {
  summary: "account every child session in a time window: work, waiting, and the slowest commands",
  usage: "bun run lane:audit [--hours <n>] [--db <path>] [--cwd <dir>] [--json] [--fail-on-waiting]",
  flags: [
    { flag: "--hours <n>", detail: "window to account, in hours (default: 40)" },
    { flag: "--db <path>", detail: "OpenCode database, else OPENCODE_DB, else the user-data default" },
    { flag: "--cwd <dir>", detail: "the one lane whose own commands name this path, and why it was picked" },
    { flag: "--json", detail: "the same numbers as one document on stdout" },
    { flag: "--fail-on-waiting", detail: "exit 2 when any selected session slept, polled or watched CI" },
  ],
  example: "bun run lane:audit --hours 40 --cwd .claude/worktrees/lane-x",
  exits: ["0 reported", "1 nothing to report (no database, no session)", "2 --fail-on-waiting found a sleep or CI watch"],
} as const;

/** A call this long is where a lane's wall time went, so it is counted on its own. */
export const OVER_MINUTE_MS = 60_000;

const LONGEST_KEPT = 3;

export type WaitKind = "ci-watch" | "sleep";

/**
 * Shapes that never need a human or a model to finish: a foreground CI watch, a sleep, or a status
 * endpoint asked over and over. `gh pr checks` without `--watch` is a single question and stays
 * ordinary work.
 *
 * Matched against what a call *runs*, never against the text of its arguments: a lane that greps for
 * `Start-Sleep` or writes a commit message about `gh run watch` did not wait, and counting its search
 * as 26 minutes of CI watching makes every quoted total wrong.
 */
const CI_WATCH_COMMAND = /\bgh\s+run\s+watch\b|\bgh\s+pr\s+checks\b[^\n]*--watch\b|\bgh\s+pr\s+checks\b[^\n]*--interval\b/i;
const LOOP = /\bwhile\s*[($:]|\bfor\s*[($]|\bfor\s+\w+\s+in\b|\bdo\s*\{|\buntil\s+/i;
const GH_CHECKS = /\bgh\s+pr\s+checks\b/i;
const STATUS_ENDPOINT =
  /\bgh\s+pr\s+(?:view|checks|status)\b|\bgh\s+api\b[^\n]*actions\/runs|statusCheckRollup|\bgh\s+run\s+(?:list|view)\b|artifacts\/[^\n]*\/check-runs/i;
// wait-ok: matches command text for the audit, it never runs a wait
const SLEEP_COMMAND =
  /\bstart-sleep\b|\btimeout\s+\/t\s*\d|\bsleep\s+\d|\bthread\.sleep\b|\batomics\.wait\b|\bwait-event\b|\bbun\.sleep\b/i;

/**
 * Commands that only read, print or inspect: run one and nothing waits, whatever its arguments say.
 * `git` is here whole because no git subcommand waits on a clock.
 */
const READ_ONLY = new Set([
  "rg",
  "grep",
  "egrep",
  "select-string",
  "sls",
  "findstr",
  "get-content",
  "gc",
  "cat",
  "type",
  "echo",
  "write-output",
  "write-host",
  "git",
  "head",
  "tail",
  "less",
  "more",
  "ls",
  "dir",
  "get-childitem",
  "where",
  "which",
  "out-string",
  "format-table",
  "select-object",
  "sort-object",
  "measure-object",
  "set-content",
  "add-content",
  "test-path",
]);

/** A wrapper anywhere in a segment whose quoted argument is the command that actually runs. */
const SHELL_BODY =
  /\b(?:powershell|pwsh|cmd|bash|sh|zsh)(?:\.exe)?\s+(?:[-/]\w+\s+)*?(?:-command|-c|-lc|\/c|\/k)\s*(?:"([^"]*)"|'([^']*)')/gi;
/** A runtime anywhere in a segment whose quoted argument after `-e` is code that runs. */
const EVAL_BODY =
  /\b(?:node|bun|deno|tsx)(?:\.exe)?\s+(?:[-/]\w+\s+)*?(?:-e|--eval|-p|--print)\s*(?:"([^"]*)"|'([^']*)')/gi;

/** One pass over the text, so a `;` or a quote inside a string is not a separator. */
function scan(command: string): { segments: string[]; quoteSpans: { start: number; end: number }[] } {
  const segments: string[] = [];
  const quoteSpans: { start: number; end: number }[] = [];
  let current = "";
  let quote: string | null = null;
  let openedAt = 0;
  let escaped = false;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]!;
    if (quote !== null) {
      current += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\" || character === "`") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
        quoteSpans.push({ start: openedAt, end: index });
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      openedAt = index + 1;
      current += character;
      continue;
    }
    if (character === ";") {
      segments.push(current);
      current = "";
      continue;
    }
    if (character === "&" && command[index + 1] === "&") {
      segments.push(current);
      current = "";
      index += 1;
      continue;
    }
    if (character === "|") {
      segments.push(current);
      current = "";
      if (command[index + 1] === "|") index += 1;
      continue;
    }
    if (character === "\n") {
      segments.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  segments.push(current);
  return { segments, quoteSpans };
}

/** The same text with every balanced quoted argument dropped: a pattern is not a command. */
export function stripQuoted(command: string): string {
  const { segments } = scan(command);
  return segments
    .map((segment) => {
      let out = "";
      let quote: string | null = null;
      let escaped = false;
      for (const character of segment) {
        if (quote !== null) {
          if (escaped) escaped = false;
          else if (character === "\\" || character === "`") escaped = true;
          else if (character === quote) quote = null;
          continue;
        }
        if (character === '"' || character === "'") {
          quote = character;
          continue;
        }
        out += character;
      }
      return out;
    })
    .join(" ");
}

function executableOf(segment: string): string | null {
  const tokens = segment
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/^[(&${@"']+/, ""))
    .filter((token) => token.length > 0 && !/^(?:&|\$|sudo|\d+>|\d*>&\d)$/.test(token));
  const first = tokens[0];
  if (first === undefined) return null;
  return (first.split(/[\\/]/).pop() ?? first).toLowerCase().replace(/\.exe$/, "");
}

function bodiesFrom(pattern: RegExp, segment: string): string[] {
  const bodies: string[] = [];
  for (const match of segment.matchAll(pattern)) {
    const body = match[1] ?? match[2];
    if (body !== undefined && body.trim().length > 0) bodies.push(body);
  }
  return bodies;
}

function executedText(segment: string, depth = 0): string {
  const name = executableOf(segment);
  if (name === null || READ_ONLY.has(name)) return "";
  if (depth >= 4) return stripQuoted(segment);
  // The wrapper's own text stays too: a `while` loop sits around the wrapper, not inside it.
  const code = bodiesFrom(EVAL_BODY, segment);
  const nested = bodiesFrom(SHELL_BODY, segment).map((body) => executedText(body, depth + 1));
  return [stripQuoted(segment), ...code, ...nested].join("\n");
}

/**
 * The parts of a command that actually run: each segment whose executable is not a read-only tool,
 * its quoted arguments removed, with a shell wrapper or an `-e` body followed into.
 */
export function runnableText(command: string): string {
  return scan(command)
    .segments.map((segment) => executedText(segment))
    .filter((text) => text.trim().length > 0)
    .join("\n");
}

/**
 * What a single tool call was doing: a foreground CI watch, a sleep or status poll, or ordinary work.
 * CI watch wins when a command both sleeps and asks GitHub, because that is the wait it was serving.
 */
export function classifyCommand(command: string): WaitKind | null {
  if (command.trim() === "") return null;
  const runnable = runnableText(command);
  if (runnable.trim() === "") return null;
  if (CI_WATCH_COMMAND.test(runnable)) return "ci-watch";
  if (GH_CHECKS.test(runnable) && LOOP.test(runnable)) return "ci-watch";
  if (SLEEP_COMMAND.test(runnable)) return "sleep";
  if (LOOP.test(runnable) && STATUS_ENDPOINT.test(runnable)) return "sleep";
  return null;
}

export interface ToolCall {
  readonly name: string;
  readonly command: string;
  /** The whole call input, so a file path in a read or edit counts as evidence about which lane ran it. */
  readonly input?: string;
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

/** One candidate lane and the evidence for and against calling it this worktree's lane. */
export interface LaneCandidate {
  readonly id: string;
  readonly title: string;
  readonly directory: string;
  /** How many times this session's own calls name the target path. */
  readonly references: number;
  readonly waitingMs: number;
  readonly timeUpdated: number;
}

export interface LaneAttribution {
  /** The session this path belongs to, or null when nothing in the window is evidence for one. */
  readonly session: string | null;
  readonly target: string;
  /** What the pick rests on: the lane's own commands, or only the directory it recorded. */
  readonly basis: "commands" | "directory" | null;
  readonly references: number;
  /** True when several lanes named the path equally often, so the pick is the worst-waiting of them. */
  readonly ambiguous: boolean;
  /** One line naming the session and the evidence, printed wherever the resolution is used. */
  readonly reason: string;
  readonly candidates: readonly LaneCandidate[];
}

export interface LaneSession {
  readonly id: string;
  readonly title: string;
  readonly directory: string;
  readonly timeUpdated: number;
  readonly waitingMs: number;
  /** Everything this session's own calls said: commands, paths, patterns. */
  readonly texts: readonly string[];
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
        state?: { input?: unknown };
      };
      const startedAt = entry.time?.created ?? entry.time?.ran;
      const endedAt = entry.time?.completed;
      if (typeof startedAt !== "number" || typeof endedAt !== "number" || endedAt < startedAt) continue;
      const input = entry.state?.input;
      const raw = (input as { command?: unknown; cmd?: unknown } | undefined)?.command ?? (input as { cmd?: unknown } | undefined)?.cmd ?? "";
      // The command is counted once; the rest of the input (a file path, a pattern) is extra evidence
      // about which lane made the call, without repeating the command that is already in `command`.
      const rest =
        input === undefined || typeof input !== "object"
          ? ""
          : JSON.stringify(
              Object.fromEntries(
                Object.entries(input as Record<string, unknown>).filter(([key]) => key !== "command" && key !== "cmd"),
              ),
            );
      calls.push({
        name: entry.name ?? "tool",
        command: typeof raw === "string" ? raw : JSON.stringify(raw),
        input: rest === "{}" ? "" : rest,
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
  /** How `--cwd` found its lane; absent when the window was not narrowed. */
  readonly attribution?: LaneAttribution;
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

function lowerPath(path: string): string {
  return path.replace(/\\\\/g, "/").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/**
 * The target and its distinctive tails, longest first. A command says a worktree either by its whole
 * path or by the part of it a person types (`worktrees/lane-attribution`), so both count, once each.
 */
export function pathForms(target: string): string[] {
  const full = lowerPath(target);
  if (full === "") return [];
  const segments = full.split("/").filter((segment) => segment.length > 0);
  const forms = new Set<string>([full]);
  if (segments.length > 2) forms.add(segments.slice(-2).join("/"));
  if (segments.length > 3) forms.add(segments.slice(-3).join("/"));
  return [...forms].sort((a, b) => b.length - a.length);
}

/**
 * How many times these texts name the target path. A mention is counted once however many tails of
 * the same path it matches, and a longer sibling name (`lane-attribution-2`) is not this lane.
 */
export function countReferences(texts: readonly string[], target: string): number {
  const forms = pathForms(target);
  if (forms.length === 0) return 0;
  let count = 0;
  for (const raw of texts) {
    const text = lowerPath(raw);
    let index = 0;
    while (index < text.length) {
      const form = forms.find((candidate) => text.startsWith(candidate, index));
      if (form === undefined) {
        index += 1;
        continue;
      }
      const after = text.slice(index + form.length, index + form.length + 1);
      if (after !== "" && /[a-z0-9_-]/.test(after)) {
        index += 1;
        continue;
      }
      count += 1;
      index += form.length;
    }
  }
  return count;
}

function candidateOf(session: LaneSession, references: number): LaneCandidate {
  return {
    id: session.id,
    title: session.title,
    directory: session.directory,
    references,
    waitingMs: session.waitingMs,
    timeUpdated: session.timeUpdated,
  };
}

function waitingMinutes(ms: number): string {
  return (ms / 60_000).toFixed(1);
}

/**
 * The lane a worktree path belongs to. A child session records the directory of the agent that spawned
 * it, not the one it works in, so the recorded directory is not evidence; the session's own calls are.
 * The most-referencing lane wins, an equal strongest tie goes to the worst-waiting one and says so.
 */
export function attributeLane(target: string, sessions: readonly LaneSession[]): LaneAttribution {
  const scored = sessions.map((session) => ({ session, references: countReferences(session.texts, target) }));
  const named = scored
    .filter((entry) => entry.references > 0)
    .sort((a, b) => b.references - a.references || b.session.timeUpdated - a.session.timeUpdated);

  if (named.length === 0) {
    const recorded = sessions
      .filter((session) => directoryMatches(session.directory, target))
      .sort((a, b) => b.timeUpdated - a.timeUpdated);
    const first = recorded[0];
    if (first === undefined) {
      return {
        session: null,
        target,
        basis: null,
        references: 0,
        ambiguous: false,
        reason: `no session in the window names ${target} in its own calls, and none recorded that directory`,
        candidates: [],
      };
    }
    const shared = recorded.length > 1 ? `; ${recorded.length} sessions recorded it` : "";
    return {
      session: first.id,
      target,
      basis: "directory",
      references: 0,
      ambiguous: recorded.length > 1,
      reason: `attributed ${first.id} (no command names ${target}; it records that directory itself${shared})`,
      candidates: recorded.map((session) => candidateOf(session, 0)),
    };
  }

  const top = named[0]!;
  const tied = named.filter((entry) => entry.references === top.references);
  if (tied.length > 1) {
    const worst = tied.reduce(
      (best, entry) =>
        entry.session.waitingMs > best.session.waitingMs ||
        (entry.session.waitingMs === best.session.waitingMs && entry.session.timeUpdated > best.session.timeUpdated)
          ? entry
          : best,
      tied[0]!,
    );
    const list = tied.map((entry) => `${entry.session.id} ${waitingMinutes(entry.session.waitingMs)}m waiting`).join("; ");
    return {
      session: worst.session.id,
      target,
      basis: "commands",
      references: worst.references,
      ambiguous: true,
      reason: `ambiguous: ${tied.length} sessions each name ${target} ${worst.references} time(s) (${list}) - picked ${worst.session.id}, the worst-waiting`,
      candidates: tied.map((entry) => candidateOf(entry.session, entry.references)),
    };
  }

  return {
    session: top.session.id,
    target,
    basis: "commands",
    references: top.references,
    ambiguous: false,
    reason: `attributed ${top.session.id} (${top.references} reference${top.references === 1 ? "" : "s"} to ${target})`,
    candidates: named.map((entry) => candidateOf(entry.session, entry.references)),
  };
}

/** The path a lane hands in, which may be a Windows path recorded on another machine. */

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
  const audits = sessions.map((session) => auditSession(session, calls.get(session.id) ?? []));
  const report = buildReport(audits);
  if (options.cwd === undefined) return report;
  const lane = (audit: SessionAudit): LaneSession => ({
    id: audit.id,
    title: audit.title,
    directory: audit.directory,
    timeUpdated: sessions.find((session) => session.id === audit.id)?.timeUpdated ?? 0,
    waitingMs: waitingMs(audit),
    texts: (calls.get(audit.id) ?? []).map((call) => `${call.command}\n${call.input ?? ""}`),
  });
  const attribution = attributeLane(options.cwd, audits.map(lane));
  const selected = report.sessions.filter((session) => session.id === attribution.session);
  return { sessions: selected, totals: totals(selected), population: report.population, attribution };
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
        waits: audit.waits.map((wait) => ({ kind: wait.kind, ms: wait.ms, command: wait.command })),
      })),
      totals: report.totals,
      population: report.population,
      ...(report.attribution === undefined
        ? {}
        : {
            attribution: {
              session: report.attribution.session,
              target: report.attribution.target,
              basis: report.attribution.basis,
              references: report.attribution.references,
              ambiguous: report.attribution.ambiguous,
              reason: report.attribution.reason,
            },
          }),
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

/**
 * A lane passes the directory it runs in, which may be a Windows path recorded on another machine, so
 * only a relative value is resolved against the current directory.
 */
export function cwdFilter(value: string): string {
  const absolute = /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("/") || value.startsWith("\\\\");
  return absolute ? value : resolve(value);
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
    else throw new Error(`unknown flag ${flag}`);
  }
  if (!Number.isFinite(args.hours) || args.hours <= 0) throw new Error("--hours must be a positive number");
  return args;
}

function main(argv: readonly string[]): number {
  if (printHelpIfAsked("lane-audit", LANE_AUDIT_USAGE, argv)) return 0;
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
      cwd: args.cwd === undefined ? undefined : cwdFilter(args.cwd),
      now: Date.now(),
    });
    if (report.attribution !== undefined) console.error(`lane:audit: ${report.attribution.reason}`);
    if (report.sessions.length === 0) {
      const searched =
        report.attribution === undefined
          ? ""
          : `\nsearched ${report.population} child session(s) alive in the last ${args.hours}h of ${resolved}.` +
            "\nA child session records the directory of the agent that spawned it, so the worktree it worked in" +
            "\nis only visible in its own commands; pass --cwd <worktree> and make sure its calls name that path.";
      console.error(
        `lane:audit: no child sessions ${report.attribution === undefined ? `in the last ${args.hours}h` : `found for ${args.cwd} in the last ${args.hours}h`} (database ${resolved}).${searched}`,
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

