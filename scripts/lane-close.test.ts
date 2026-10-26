import { describe, expect, test } from "bun:test";

import {
  EXIT_CANNOT_ANSWER,
  EXIT_CLOSED,
  EXIT_VERIFY_FAILED,
  closeLane,
  landingMode,
  parseArgs,
  reportSkeleton,
  type LaneIo,
} from "./lane-close";

const CI_OK = JSON.stringify({
  ok: true,
  pr: 2278,
  url: "https://github.com/o/r/pull/2278",
  state: "MERGED",
  verdict: "pass",
  counts: { pass: 21, fail: 0, pending: 0 },
  runIds: [40034099879],
});

interface Script {
  verify?: number;
  land?: number;
  ci?: string;
  ciStatus?: number;
  branch?: string;
  shortstat?: string;
  pr?: number | null;
}

function io(script: Script = {}): LaneIo & { lines: { out: string[]; err: string[] } } {
  const lines = { out: [] as string[], err: [] as string[] };
  const run = () => ({ status: 0, stdout: "", stderr: "" });
  return {
    lines,
    cwd: "/repo",
    env: {},
    out: (line) => lines.out.push(line),
    err: (line) => lines.err.push(line),
    sh: (argv) => {
      const key = argv.join(" ");
      if (key === "git rev-parse --abbrev-ref HEAD") return { ...run(), stdout: `${script.branch ?? "agent/x"}\n` };
      if (key === "run verify:fast --skill-api") return { ...run(), status: script.verify ?? 0 };
      if (key === "run scripts/land.ts --commit") return { ...run(), status: script.land ?? 0 };
      if (key.startsWith("run ci:status")) {
        return { ...run(), stdout: script.ci ?? CI_OK, status: script.ciStatus ?? 0 };
      }
      if (key.startsWith("gh pr list")) {
        return { ...run(), stdout: JSON.stringify(script.pr === null ? [] : [{ number: script.pr ?? 2278 }]) };
      }
      if (key.startsWith("git diff --shortstat")) {
        return { ...run(), stdout: script.shortstat ?? " 3 files changed, 120 insertions(+), 4 deletions(-)\n" };
      }
      return run();
    },
  };
}

describe("lane:close end to end", () => {
  test("a clean lane verifies, lands with --commit and prints the numbers", () => {
    const calls: string[] = [];
    const fake = io();
    const sh = fake.sh;
    fake.sh = (argv, inherit) => {
      calls.push(argv.join(" "));
      return sh(argv, inherit);
    };
    expect(closeLane({}, fake)).toBe(EXIT_CLOSED);
    const printed = fake.lines.out.join("\n");
    expect(printed).toContain("Lane report");
    expect(printed).toContain("- PR: #2278");
    expect(printed).toContain("- checks: 21 pass, 0 fail, 0 pending — pass (run 40034099879)");
    expect(printed).toContain("- files changed: 3 files changed, 120 insertions(+), 4 deletions(-)");
    expect(fake.lines.err).toEqual([]);
    expect(calls).toContain("run scripts/land.ts --commit");
    expect(calls.some((call) => call.startsWith("run lane:audit"))).toBe(false);
  });

  test("a PR that is still open and armed is named, not refused", () => {
    const pending = JSON.stringify({
      ok: true,
      pr: 2278,
      url: "https://github.com/o/r/pull/2278",
      state: "OPEN",
      verdict: "pending",
      counts: { pass: 3, fail: 0, pending: 8 },
      runIds: [40034099879],
    });
    const fake = io({ ci: pending });
    expect(closeLane({}, fake)).toBe(EXIT_CLOSED);
    const printed = fake.lines.out.join("\n");
    expect(printed).toContain("- PR: #2278 open https://github.com/o/r/pull/2278");
    expect(printed).toContain("- checks: 3 pass, 0 fail, 8 pending — pending");
  });

  test("a landing with no PR to name cannot answer", () => {
    const fake = io({ pr: null });
    expect(closeLane({}, fake)).toBe(EXIT_CANNOT_ANSWER);
    expect(fake.lines.err.join("\n")).toContain("cannot name its PR");
  });

  test("verify:fast failing stops before land", () => {
    const landed: string[] = [];
    const fake = io({ verify: 1 });
    const sh = fake.sh;
    fake.sh = (argv, inherit) => {
      landed.push(argv.join(" "));
      return sh(argv, inherit);
    };
    expect(closeLane({}, fake)).toBe(EXIT_VERIFY_FAILED);
    expect(landed).not.toContain("run scripts/land.ts --commit");
  });

  test("closing pays the generated-file check, so a stale manifest or api.md never lands", () => {
    const calls: string[] = [];
    const fake = io();
    const sh = fake.sh;
    fake.sh = (argv, inherit) => {
      calls.push(argv.join(" "));
      return sh(argv, inherit);
    };
    closeLane({}, fake);
    expect(calls).toContain("run verify:fast --skill-api");
  });

  test("a verification failure names the command that regenerates a stale file", () => {
    const fake = io({ verify: 1 });
    expect(closeLane({}, fake)).toBe(EXIT_VERIFY_FAILED);
    expect(fake.lines.err.join("\n")).toContain("bun run gen");
  });

  test("land failing returns its exit code and does not close", () => {
    const fake = io({ land: 4 });
    expect(closeLane({}, fake)).toBe(4);
    expect(fake.lines.err.join("\n")).toContain("the lane is not closed");
  });

  test("--allow paths reach land --commit", () => {
    const calls: string[] = [];
    const fake = io();
    const sh = fake.sh;
    fake.sh = (argv, inherit) => {
      calls.push(argv.join(" "));
      return sh(argv, inherit);
    };
    closeLane({ allow: ["bun.lock"] }, fake);
    expect(calls).toContain("run scripts/land.ts --commit --allow bun.lock");
  });

  test("checks that have not registered yet are a hand-off, and the lane still closes", () => {
    const fake = io({
      ci: JSON.stringify({ ok: false, reason: "no-checks", message: "PR #2278 has no checks yet" }),
      ciStatus: 3,
    });
    expect(closeLane({}, fake)).toBe(EXIT_CLOSED);
    const printed = fake.lines.out.join("\n");
    expect(printed).toContain("checks: unavailable — PR #2278 has no checks yet");
    expect(printed).toContain("ask again for the checks: bun run ci:status --pr 2278");
    expect(fake.lines.err).toEqual([]);
  });

  test("a ci:status that answers nothing at all leaves the lane unable to report", () => {
    const fake = io({ ci: "not json" });
    expect(closeLane({}, fake)).toBe(EXIT_CANNOT_ANSWER);
    expect(fake.lines.err.join("\n")).toContain("cannot report the checks");
  });

  test("the base branch is refused before anything runs", () => {
    const fake = io({ branch: "beta" });
    expect(closeLane({}, fake)).toBe(EXIT_CANNOT_ANSWER);
    expect(fake.lines.err.join("\n")).toContain("refusing to close beta");
  });
});

describe("arguments", () => {
  test("--pr and --allow", () => {
    expect(parseArgs(["--pr", "12"])).toEqual({ pr: 12, allow: [] });
    expect(parseArgs(["--allow", "bun.lock"])).toEqual({ allow: ["bun.lock"] });
    expect(() => parseArgs(["--pr", "x"])).toThrow("--pr needs a PR number");
    expect(() => parseArgs(["--waive", "slow CI"])).toThrow("unknown argument");
    expect(() => parseArgs(["--branch", "x"])).toThrow("unknown argument");
  });

  test("--batch and --queue hand the rest to the batch and the queue", () => {
    expect(landingMode(["--batch", "agent/a", "agent/b", "--dry-run"])).toEqual({ script: "scripts/land-batch.ts", rest: ["agent/a", "agent/b", "--dry-run"] });
    expect(landingMode(["--queue"])).toEqual({ script: "scripts/land-queue.ts", rest: [] });
    expect(landingMode(["--pr", "12"])).toBeNull();
  });
});

describe("the report skeleton", () => {
  test("missing checks say so and name the command that answers later", () => {
    const text = reportSkeleton({ branch: "b", pr: 1, filesChanged: "none" });
    expect(text).toContain("checks: unavailable");
    expect(text).toContain("bun run ci:status --pr 1");
    expect(text).not.toContain("waiting");
  });
});
