import { describe, expect, test } from "bun:test";

import type { RollupEntry } from "./ci-status";
import { armState, formatText, isArmed, sweep, type SweepPr } from "./pr-sweep";

function pr(overrides: Partial<SweepPr> = {}): SweepPr {
  return {
    number: 2289,
    title: "release: make shipping an unimportable version impossible",
    headRefName: "agent/lane-release-integrity",
    headRefOid: "head1",
    isDraft: false,
    mergeable: "MERGEABLE",
    autoMergeRequest: { enabledAt: "2026-10-23T23:55:43Z" },
    statusCheckRollup: [],
    ...overrides,
  };
}

function attempt(name: string, conclusion: string, startedAt: string, extra: Partial<RollupEntry> = {}): RollupEntry {
  return { __typename: "CheckRun", name, status: "COMPLETED", conclusion, startedAt, ...extra };
}

/** The 21 check names in PR #2330's rollup, in the order GitHub listed them. */
const NAMES_2330 = [
  "changes",
  "quick",
  "types",
  "test (a)",
  "test (b)",
  "test (c)",
  "test (d)",
  "test (e)",
  "test (f)",
  "test (g)",
  "test (h)",
  "test (i)",
  "web-build",
  "perf-cpu",
  "windows-tests",
  "smoke-game",
  "perf-game",
  "windows",
  "smoke",
  "perf",
  "ci",
];

/** The 9 names whose second attempt was cancelled when a queued run superseded it. */
const CANCELLED_2330 = new Set(["types", "test (a)", "test (c)", "test (d)", "test (e)", "test (f)", "test (g)", "test (i)", "ci"]);

/**
 * PR #2330's rollup as `gh pr list` reported it: 42 rows for 21 names, because a second workflow
 * run was cancelled after the first one passed. Every row is on the same commit.
 */
function rollup2330(): RollupEntry[] {
  const entries: RollupEntry[] = [];
  NAMES_2330.forEach((name, index) => {
    const second = String(index % 60).padStart(2, "0");
    entries.push(attempt(name, "SUCCESS", `2026-10-24T04:11:${second}Z`));
    entries.push(
      CANCELLED_2330.has(name)
        ? attempt(name, "CANCELLED", `2026-10-24T04:15:${second}Z`)
        : attempt(name, "SUCCESS", `2026-10-24T04:14:49Z`),
    );
  });
  return entries;
}

describe("armed PR sweep", () => {
  test("#2330's 42 rows for 21 names, cancelled attempt beside each pass, read clean", () => {
    const rollup = rollup2330();
    expect(rollup.length).toBe(42);
    expect(new Set(rollup.map((entry) => entry.name)).size).toBe(21);
    expect(armState(pr({ statusCheckRollup: rollup }))).toEqual({ red: [], waiting: [], verdict: "clean" });
  });

  test("a genuinely failing current check is RED and named", () => {
    const state = armState(
      pr({
        statusCheckRollup: [
          ...rollup2330(),
          attempt("test (d)", "FAILURE", "2026-10-24T04:20:00Z", { detailsUrl: "https://example.test/actions/runs/7/job/7" }),
        ],
      }),
    );
    expect(state.verdict).toBe("red");
    expect(state.red).toEqual(["test (d) failure https://example.test/actions/runs/7/job/7"]);
    expect(state.waiting).toEqual([]);
  });

  test("a failure from a superseded push says nothing about this commit", () => {
    const state = armState(
      pr({
        statusCheckRollup: [
          attempt("test (d)", "FAILURE", "2026-10-24T04:10:00Z", { headSha: "old1" }),
          attempt("test (d)", "SUCCESS", "2026-10-24T04:20:00Z", { headSha: "head1" }),
        ],
      }),
    );
    expect(state).toEqual({ red: [], waiting: [], verdict: "clean" });
  });

  test("a running check is wait, with how many of how many and the run", () => {
    const state = armState(
      pr({
        statusCheckRollup: [
          attempt("quick", "SUCCESS", "2026-10-24T04:10:00Z"),
          {
            __typename: "CheckRun",
            name: "types",
            status: "IN_PROGRESS",
            conclusion: "",
            startedAt: "2026-10-24T04:20:00Z",
            detailsUrl: "https://example.test/actions/runs/4100/job/1",
          },
        ],
      }),
    );
    expect(state).toEqual({ red: [], waiting: ["still running: 1 of 2 (run 4100)"], verdict: "wait" });
  });

  test("a timed-out check and a commit status failure both count as red", () => {
    const state = armState(
      pr({
        statusCheckRollup: [
          { __typename: "CheckRun", name: "test (b)", status: "COMPLETED", conclusion: "TIMED_OUT" },
          { __typename: "StatusContext", context: "ci/legacy", state: "ERROR" },
        ],
      }),
    );
    expect(state.red).toEqual(["test (b) timed_out", "ci/legacy error"]);
  });

  test("a name cancelled on every attempt asks for a re-run, and is not red", () => {
    const state = armState(
      pr({
        statusCheckRollup: [
          attempt("perf", "CANCELLED", "2026-10-24T04:10:00Z"),
          attempt("perf", "CANCELLED", "2026-10-24T04:20:00Z"),
          attempt("quick", "SUCCESS", "2026-10-24T04:10:00Z"),
        ],
      }),
    );
    expect(state).toEqual({
      red: [],
      waiting: ["cancelled with no result, so a re-run decides: 1 of 2: perf"],
      verdict: "wait",
    });
  });

  test("#2322's shape: a job cancelled before it concluded, skipped by the run that followed, is not red", () => {
    const state = armState(
      pr({
        statusCheckRollup: [
          attempt("quick", "SUCCESS", "2026-10-24T04:10:00Z"),
          attempt("smoke-game", "CANCELLED", "2026-10-24T03:19:14Z"),
          attempt("perf-game", "CANCELLED", "2026-10-24T03:19:14Z"),
        ],
      }),
    );
    expect(state.red).toEqual([]);
    expect(state.waiting).toEqual(["cancelled with no result, so a re-run decides: 2 of 3: smoke-game, perf-game"]);
  });

  test("a conflict or a draft blocks an armed PR even with every check green", () => {
    const green = [attempt("quick", "SUCCESS", "2026-10-24T04:10:00Z")];
    expect(armState(pr({ mergeable: "CONFLICTING", statusCheckRollup: green })).red).toEqual(["merge conflict with beta"]);
    expect(armState(pr({ isDraft: true, statusCheckRollup: green })).red).toEqual(["still a draft"]);
  });

  test("checks that have not been created yet are waiting, not red", () => {
    expect(armState(pr({ statusCheckRollup: [] }))).toEqual({ red: [], waiting: ["no checks reported yet"], verdict: "wait" });
  });

  test("only a PR with an auto-merge request counts as armed", () => {
    expect(isArmed(pr())).toBe(true);
    expect(isArmed(pr({ autoMergeRequest: null }))).toBe(false);
    expect(isArmed(pr({ autoMergeRequest: undefined }))).toBe(false);
  });
});

describe("the sweep report", () => {
  test("one line per armed PR, names the red check, and exits non-zero while any is red", () => {
    const report = sweep([
      pr({ number: 2330, statusCheckRollup: rollup2330() }),
      pr({ number: 2331 }),
      pr({
        number: 2332,
        statusCheckRollup: [attempt("test (f)", "FAILURE", "2026-10-24T04:20:00Z", { detailsUrl: "https://example.test/run" })],
      }),
      pr({ number: 2333, autoMergeRequest: null, statusCheckRollup: [attempt("quick", "FAILURE", "2026-10-24T04:20:00Z")] }),
    ]);
    expect(report.open).toBe(4);
    expect(report.rows.map((row) => row.pr.number)).toEqual([2330, 2331, 2332]);
    expect(report.exitCode).toBe(1);
    const lines = formatText(report);
    expect(lines[0]).toBe("pr:sweep: 4 open PR(s), 3 armed for auto-merge");
    expect(lines.filter((line) => line.startsWith("  RED "))).toEqual(["  RED  #2332 agent/lane-release-integrity - release: make shipping an unimportable version impossible"]);
    expect(lines).toContain("         armed and red: test (f) failure https://example.test/run");
    expect(lines.at(-1)).toBe("pr:sweep: 1 armed PR(s) will never merge until fixed: #2332");
  });

  test("an all-clean sweep exits zero", () => {
    const report = sweep([pr({ number: 2330, statusCheckRollup: rollup2330() })]);
    expect(report.exitCode).toBe(0);
    expect(formatText(report).at(-1)).toBe("pr:sweep: no armed PR is red");
  });
});
