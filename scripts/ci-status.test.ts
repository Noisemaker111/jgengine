import { describe, expect, test } from "bun:test";

import {
  EXIT_CANNOT_ANSWER,
  EXIT_FAILED,
  EXIT_GREEN,
  EXIT_PENDING,
  ask,
  bucketOf,
  cli,
  exitCodeFor,
  formatText,
  jsonText,
  normalizeCheck,
  parseArgs,
  runIdFrom,
  summarize,
  verdictOf,
  type CiIo,
  type RollupEntry,
  type Run,
} from "./ci-status";

function run(status: number, stdout = "", stderr = ""): Run {
  return { status, stdout, stderr };
}

function io(gh: (args: string[]) => Run, branch = "agent/example"): CiIo {
  return { gh, git: () => run(0, `${branch}\n`) };
}

const ROLLUP: RollupEntry[] = [
  {
    __typename: "CheckRun",
    name: "quick",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    detailsUrl: "https://github.com/o/r/actions/runs/4100/job/9",
  },
  {
    __typename: "CheckRun",
    name: "gate",
    status: "IN_PROGRESS",
    conclusion: null,
    detailsUrl: "https://github.com/o/r/actions/runs/4100/job/10",
  },
];

describe("arguments", () => {
  test("--pr, --branch, --repo and --json", () => {
    expect(parseArgs(["--pr", "2274", "--json"])).toEqual({ pr: 2274, json: true });
    expect(parseArgs(["--branch", "agent/x", "--repo", "o/r"])).toEqual({ branch: "agent/x", repo: "o/r", json: false });
  });

  test("a number is required and two selectors are refused", () => {
    expect(() => parseArgs(["--pr", "latest"])).toThrow("--pr needs a PR number");
    expect(() => parseArgs(["--pr", "1", "--branch", "b"])).toThrow("not both");
    expect(() => parseArgs(["--nope"])).toThrow("unknown argument");
  });
});

describe("reading the rollup", () => {
  test("a concluded check run is its conclusion, a running one is in progress", () => {
    expect(normalizeCheck(ROLLUP[0]!)).toMatchObject({ name: "quick", state: "SUCCESS", bucket: "pass" });
    expect(normalizeCheck(ROLLUP[1]!)).toMatchObject({ name: "gate", state: "IN_PROGRESS", bucket: "pending" });
  });

  test("a legacy commit status reads its state, not a status", () => {
    const check = normalizeCheck({ context: "windows-tests", state: "FAILURE", targetUrl: "https://example.test/1" });
    expect(check).toMatchObject({ name: "windows-tests", state: "FAILURE", bucket: "fail" });
    expect(check.runId).toBeNull();
  });

  test("bucket covers the states GitHub actually sends", () => {
    for (const state of ["SUCCESS", "NEUTRAL", "SKIPPED"]) expect(bucketOf(state)).toBe("pass");
    for (const state of ["FAILURE", "CANCELLED", "TIMED_OUT", "STALE", "STARTUP_FAILURE"]) {
      expect(bucketOf(state)).toBe("fail");
    }
    expect(bucketOf("QUEUED")).toBe("pending");
  });

  test("the run id comes off a job URL and nothing else", () => {
    expect(runIdFrom("https://github.com/o/r/actions/runs/40034099879/job/120691162810")).toBe(40034099879);
    expect(runIdFrom("https://example.test/check")).toBeNull();
  });

  test("one failure outranks pending, and pending outranks green", () => {
    expect(verdictOf([normalizeCheck(ROLLUP[0]!)])).toBe("pass");
    expect(verdictOf(ROLLUP.map(normalizeCheck))).toBe("pending");
    expect(verdictOf([...ROLLUP, { state: "FAILURE" }].map(normalizeCheck))).toBe("fail");
  });
});

describe("one query, one answer", () => {
  test("--json carries the verdict, the counts, the run id and every check", () => {
    const status = summarize({
      pr: 2274,
      url: "https://github.com/o/r/pull/2274",
      branch: "agent/x",
      state: "MERGED",
      rollup: ROLLUP,
      wallMs: 640,
    });
    const parsed = JSON.parse(jsonText(status)) as Record<string, unknown>;
    expect(parsed.ok).toBe(true);
    expect(parsed.verdict).toBe("pending");
    expect(parsed.counts).toEqual({ pass: 1, fail: 0, pending: 1 });
    expect(parsed.runIds).toEqual([4100]);
    expect(parsed.wallMs).toBe(640);
    const checks = parsed.checks as Record<string, unknown>[];
    expect(checks[0]).toEqual({
      name: "quick",
      state: "SUCCESS",
      bucket: "pass",
      url: "https://github.com/o/r/actions/runs/4100/job/9",
      runId: 4100,
    });
  });

  test("the text names each check and the verdict", () => {
    const text = formatText(
      summarize({ pr: 1, url: "", branch: "agent/x", state: "OPEN", rollup: ROLLUP, wallMs: 1200 }),
    );
    expect(text).toContain("pass quick");
    expect(text).toContain("wait gate (IN_PROGRESS)");
    expect(text).toContain("1 pass, 0 fail, 1 pending — pending");
    expect(text).toContain("run 4100");
  });

  test("a PR number costs one gh call", () => {
    const calls: string[][] = [];
    const answer = ask({ pr: 7, json: false }, io((args) => {
      calls.push(args);
      return run(0, JSON.stringify({ number: 7, url: "u", state: "OPEN", headRefName: "b", statusCheckRollup: ROLLUP }));
    }));
    expect("reason" in answer).toBe(false);
    expect(calls).toHaveLength(1);
  });
});

describe("honest refusals", () => {
  test("a branch with no open PR says so instead of printing an empty table", () => {
    const answer = ask({ branch: "agent/x", json: false }, io(() => run(0, "[]")));
    expect(answer).toMatchObject({ reason: "no-pr" });
    expect((answer as { message: string }).message).toContain("no open PR for branch agent/x");
    expect(exitCodeFor(answer)).not.toBe(EXIT_GREEN);
    expect(exitCodeFor(answer)).toBe(EXIT_CANNOT_ANSWER);
  });

  test("a PR with no checks yet is pending, not green", () => {
    const answer = ask({ pr: 9, json: false }, io(() => run(0, JSON.stringify({
      number: 9,
      url: "u",
      state: "OPEN",
      headRefName: "b",
      statusCheckRollup: [],
    }))));
    expect(answer).toMatchObject({ reason: "no-checks" });
    expect((answer as { message: string }).message).toContain("no checks yet");
    expect(exitCodeFor(answer)).toBe(EXIT_CANNOT_ANSWER);
  });

  test("gh failing is a refusal with gh's own words", () => {
    const answer = ask({ pr: 9, json: false }, io(() => run(1, "", "no pull requests found for branch")));
    expect(answer).toMatchObject({ reason: "gh-failed" });
    expect((answer as { message: string }).message).toContain("no pull requests found");
  });

  test("verdicts map to distinct exit codes", () => {
    const base = { pr: 1, url: "", branch: "b", state: "OPEN", wallMs: 1 };
    expect(exitCodeFor(summarize({ ...base, rollup: [ROLLUP[0]!] }))).toBe(EXIT_GREEN);
    expect(exitCodeFor(summarize({ ...base, rollup: [{ state: "FAILURE" }] }))).toBe(EXIT_FAILED);
    expect(exitCodeFor(summarize({ ...base, rollup: ROLLUP }))).toBe(EXIT_PENDING);
  });

  test("the command prints the refusal and exits non-zero, json or not", () => {
    const noPr = cli(["--branch", "agent/x"], io(() => run(0, "[]")), () => 0);
    expect(noPr.code).toBe(EXIT_CANNOT_ANSWER);
    expect(noPr.stderr.join("\n")).toContain("no open PR for branch agent/x");
    expect(noPr.stdout).toEqual([]);

    const json = cli(["--branch", "agent/x", "--json"], io(() => run(0, "[]")), () => 0);
    expect(json.code).toBe(EXIT_CANNOT_ANSWER);
    expect(JSON.parse(json.stdout[0]!)).toMatchObject({ ok: false, reason: "no-pr" });
  });

  test("a green PR exits 0 and a pending one exits 2", () => {
    let clock = 0;
    const green = cli(["--pr", "3"], io(() => run(0, JSON.stringify({
      number: 3,
      url: "u",
      state: "OPEN",
      headRefName: "b",
      statusCheckRollup: [ROLLUP[0]],
    }))), () => (clock += 1000));
    expect(green.code).toBe(EXIT_GREEN);
    expect(green.stdout.join("\n")).toContain("answered in 1.0s");

    const pending = cli(["--pr", "3"], io(() => run(0, JSON.stringify({
      number: 3,
      url: "u",
      state: "OPEN",
      headRefName: "b",
      statusCheckRollup: ROLLUP,
    }))), () => 0);
    expect(pending.code).toBe(EXIT_PENDING);
  });

  test("a bad argument exits 3 with the reason", () => {
    const result = cli(["--pr", "x"], io(() => run(0, "[]")), () => 0);
    expect(result.code).toBe(EXIT_CANNOT_ANSWER);
    expect(result.stderr.join("\n")).toContain("--pr needs a PR number");
  });
});
