import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { auditSession, classifyCommand, directoryMatches, toolCallsFromMessages } from "./lane-audit";
import type { ToolCall } from "./lane-audit";

const SCRIPT = join(import.meta.dir, "lane-audit.ts");
const SCRATCH = join(import.meta.dir, "..", ".scratch");
const MINUTE = 60_000;
const T0 = Date.now() - 60 * MINUTE;

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function message(seq: number, calls: readonly { command: string; ms: number; startedAt: number }[]): string {
  return JSON.stringify({
    time: { created: calls[0]?.startedAt ?? T0, completed: (calls.at(-1)?.startedAt ?? T0) + (calls.at(-1)?.ms ?? 0) },
    content: calls.map((call, index) => ({
      type: "tool",
      id: `call_${seq}_${index}`,
      name: "shell",
      time: { created: call.startedAt, ran: call.startedAt, completed: call.startedAt + call.ms },
      state: { status: "completed", input: { command: call.command } },
    })),
  });
}

/** A database with one parent (excluded), one lane that only works and one lane that sleeps. */
function fixtureDatabase(): { path: string; workDirectory: string; waitDirectory: string } {
  const dir = join(SCRATCH, `lane-audit-${crypto.randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  made.push(dir);
  const path = join(dir, "opencode.db");
  const database = new Database(path, { create: true });
  database.run(
    "create table session_v2 (id text primary key, parent_id text, title text, directory text, time_created integer, time_updated integer)",
  );
  database.run("create table session_message (id text primary key, session_id text, type text, seq integer, data text)");
  const parent = "ses_parent";
  const workDirectory = "C:/repo/.claude/worktrees/lane-work";
  const waitDirectory = "C:/repo/.claude/worktrees/lane-wait";
  const sessions = [
    { id: parent, parent_id: null, title: "Coordinator", directory: "C:/repo", updated: T0 + 40 * MINUTE },
    { id: "ses_work", parent_id: parent, title: "Lane: pure work", directory: workDirectory, updated: T0 + 10 * MINUTE },
    { id: "ses_wait", parent_id: parent, title: "Lane: sleepy", directory: waitDirectory, updated: T0 + 10 * MINUTE },
  ];
  for (const session of sessions) {
    database.run(
      "insert into session_v2 (id, parent_id, title, directory, time_created, time_updated) values (?, ?, ?, ?, ?, ?)",
      [session.id, session.parent_id, session.title, session.directory, T0, session.updated],
    );
  }
  const work = [
    message(0, [{ command: "bun test packages/core", ms: 4 * MINUTE, startedAt: T0 + 1_000 }]),
    message(1, [{ command: "gh run list --limit 5", ms: 2 * MINUTE, startedAt: T0 + 5 * MINUTE }]),
  ];
  // 180 s of a 600 s span is a third of the lane spent on a clock.
  const wait = [
    message(0, [
      { command: "Start-Sleep -Seconds 150; gh pr view 12 --json state", ms: 180_000, startedAt: T0 + 1_000 },
      { command: "bun run check-types", ms: 4 * MINUTE, startedAt: T0 + 200_000 },
    ]),
  ];
  work.forEach((data, seq) =>
    database.run("insert into session_message (id, session_id, type, seq, data) values (?, ?, 'assistant', ?, ?)", [
      `msg_work_${seq}`,
      "ses_work",
      seq,
      data,
    ]),
  );
  wait.forEach((data, seq) =>
    database.run("insert into session_message (id, session_id, type, seq, data) values (?, ?, 'assistant', ?, ?)", [
      `msg_wait_${seq}`,
      "ses_wait",
      seq,
      data,
    ]),
  );
  database.run("insert into session_message (id, session_id, type, seq, data) values (?, ?, 'assistant', 0, ?)", [
    "msg_parent",
    parent,
    message(0, [{ command: "Start-Sleep -Seconds 60", ms: 60_000, startedAt: T0 }]),
  ]);
  database.close();
  return { path, workDirectory, waitDirectory };
}

function run(args: readonly string[]) {
  const result = Bun.spawnSync({
    cmd: [process.execPath, SCRIPT, ...args],
    cwd: join(import.meta.dir, ".."),
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

test("separates a sleep, a poll loop and a CI watch from ordinary work", () => {
  expect(classifyCommand("Start-Sleep -Seconds 30; gh pr view 1 --json state")).toBe("sleep");
  expect(classifyCommand("cd repo; sleep 45 && bun run gate")).toBe("sleep");
  expect(classifyCommand("timeout /t 30")).toBe("sleep");
  expect(classifyCommand("for ($i = 0; $i -lt 20; $i++) { gh api repos/o/r/actions/runs | Out-String }")).toBe("sleep");
  expect(classifyCommand("gh run watch 40034094969 --exit-status")).toBe("ci-watch");
  expect(classifyCommand("gh pr checks 160 --watch --interval 20")).toBe("ci-watch");
  expect(classifyCommand("while ($true) { gh pr checks 160 }")).toBe("ci-watch");
  expect(classifyCommand("gh pr checks 160")).toBeNull();
  expect(classifyCommand("bun run check-types && bun run test:all")).toBeNull();
});

test("measures one session from its stored tool calls", () => {
  const calls: ToolCall[] = [
    { name: "shell", command: "Start-Sleep -Seconds 90; gh run list", startedAt: T0 + 1_000, endedAt: T0 + 91_000, ms: 90_000 },
    { name: "shell", command: "gh run watch 123", startedAt: T0 + 100_000, endedAt: T0 + 130_000, ms: 30_000 },
    { name: "shell", command: "bun run test:all", startedAt: T0 + 200_000, endedAt: T0 + 290_000, ms: 90_000 },
  ];
  const audit = auditSession(
    { id: "ses_x", title: "Lane X", directory: "C:/repo", timeCreated: T0, timeUpdated: T0 + 600_000 },
    calls,
  );
  expect(audit.spanMs).toBe(600_000);
  expect(audit.toolMs).toBe(210_000);
  expect(audit.sleepMs).toBe(90_000);
  expect(audit.ciWatchMs).toBe(30_000);
  expect(audit.over60Ms).toBe(180_000);
  expect(audit.calls).toBe(3);
  expect(audit.waitingShare).toBeCloseTo(0.2, 6);
  expect(audit.waits.map((wait) => wait.kind)).toEqual(["sleep", "ci-watch"]);
  expect(audit.longest.map((entry) => entry.ms)).toEqual([90_000, 90_000, 30_000]);
});

test("reads calls out of stored message bodies and skips unfinished ones", () => {
  const calls = toolCallsFromMessages([
    { data: message(0, [{ command: "bun run gen", ms: 5_000, startedAt: T0 }]) },
    { data: JSON.stringify({ content: [{ type: "tool", name: "shell", state: { input: { command: "gh run watch 1" } } }] }) },
    { data: "not json" },
  ]);
  expect(calls).toHaveLength(1);
  expect(calls[0]!.command).toBe("bun run gen");
  expect(calls[0]!.ms).toBe(5_000);
});

test("a cwd selects the lanes under it", () => {
  expect(directoryMatches("C:/repo/.claude/worktrees/lane-work", "C:\\repo\\.claude\\worktrees\\lane-work")).toBe(true);
  expect(directoryMatches("C:/repo/.claude/worktrees/lane-work/src", "C:/repo/.claude/worktrees/lane-work")).toBe(true);
  expect(directoryMatches("C:/repo/.claude/worktrees/lane-wait", "C:/repo/.claude/worktrees/lane-work")).toBe(false);
});

test("--json carries the documented shape and percentile", () => {
  const fixture = fixtureDatabase();
  const result = run(["--db", fixture.path, "--hours", "40", "--json"]);
  expect(result.code).toBe(0);
  const document = JSON.parse(result.stdout) as {
    sessions: Record<string, unknown>[];
    totals: Record<string, number>;
    population: number;
  };
  expect(document.sessions.map((session) => session.id)).toEqual(["ses_wait", "ses_work"]);
  const [worst] = document.sessions;
  expect(Object.keys(worst!).sort()).toEqual(
    [
      "id",
      "title",
      "directory",
      "spanMs",
      "toolMs",
      "sleepMs",
      "ciWatchMs",
      "over60Ms",
      "waitingShare",
      "percentile",
      "calls",
      "longest",
    ].sort(),
  );
  expect(worst!.title).toBe("Lane: sleepy");
  expect(worst!.directory).toBe(fixture.waitDirectory);
  expect(worst!.spanMs).toBe(600_000);
  expect(worst!.sleepMs).toBe(180_000);
  expect(worst!.ciWatchMs).toBe(0);
  expect(worst!.waitingShare).toBeCloseTo(0.3, 4);
  expect(worst!.percentile).toBe(100);
  expect(worst!.calls).toBe(2);
  expect(worst!.longest).toEqual([
    { ms: 240_000, command: "bun run check-types" },
    { ms: 180_000, command: "Start-Sleep -Seconds 150; gh pr view 12 --json state" },
  ]);
  expect(document.sessions[1]!.percentile).toBe(0);
  expect(document.totals).toEqual({ spanMs: 1_200_000, sleepMs: 180_000, ciWatchMs: 0 });
  expect(document.population).toBe(2);
});

test("--cwd narrows the rows but keeps the window as the population", () => {
  const fixture = fixtureDatabase();
  const result = run(["--db", fixture.path, "--hours", "40", "--cwd", fixture.workDirectory, "--json"]);
  expect(result.code).toBe(0);
  const document = JSON.parse(result.stdout) as { sessions: { id: string; percentile: number }[] };
  expect(document.sessions.map((session) => session.id)).toEqual(["ses_work"]);
  expect(document.sessions[0]!.percentile).toBe(0);
});

test("--fail-on-waiting exits 2 on a sleep and 0 without one", () => {
  const fixture = fixtureDatabase();
  const clean = run(["--db", fixture.path, "--hours", "40", "--cwd", fixture.workDirectory, "--fail-on-waiting"]);
  expect(clean.code).toBe(0);

  const waiting = run(["--db", fixture.path, "--hours", "40", "--fail-on-waiting"]);
  expect(waiting.code).toBe(2);
  expect(waiting.stderr).toContain("Lane: sleepy");
  expect(waiting.stderr).toContain("sleep 3.0m");
  expect(waiting.stderr).toContain("Start-Sleep -Seconds 150");
});

test("an empty window says so instead of printing an empty table", () => {
  const fixture = fixtureDatabase();
  const result = run(["--db", fixture.path, "--hours", "0.5"]);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("no child sessions in the last 0.5h");
});

test("a missing database names every path it tried", () => {
  const result = run(["--db", join(SCRATCH, "absent", "opencode.db")]);
  expect(result.code).toBe(1);
  expect(result.stderr).toMatch(/no database at|no child sessions/);
});
