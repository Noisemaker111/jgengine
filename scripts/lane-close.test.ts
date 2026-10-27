import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";

import {
  EXIT_ANOTHER_RUN,
  EXIT_CANNOT_ANSWER,
  EXIT_CLOSED,
  EXIT_VERIFY_FAILED,
  LANE_LOCK_FILE,
  closeLane,
  landingMode,
  parseArgs,
  reportSkeleton,
  type LaneIo,
  type LaneLockFs,
} from "./lane-close";
import { LOCK_STALE_MS } from "./land";

/** The worktree's git directory, as `git rev-parse --absolute-git-dir` would print it. */
const GIT_DIR = resolve("repo", ".git", "worktrees", "x");
const LOCK_PATH = join(GIT_DIR, LANE_LOCK_FILE);
const NOW = 1_800_000_000_000;

/** A lock directory in memory: the files present, with the time each was written. */
function memoryLock(files: Map<string, { text: string; mtimeMs: number }>, now: () => number): LaneLockFs {
  return {
    create: (path, text) => {
      if (files.has(path)) return false;
      files.set(path, { text, mtimeMs: now() });
      return true;
    },
    read: (path) => files.get(path)?.text ?? null,
    remove: (path) => void files.delete(path),
    mtimeMs: (path) => files.get(path)?.mtimeMs ?? null,
  };
}

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
  gen?: number;
  verify?: number;
  land?: number;
  ci?: string;
  ciStatus?: number;
  branch?: string;
  shortstat?: string;
  pr?: number | null;
  /** Lock files already present when the run starts. */
  locks?: Map<string, { text: string; mtimeMs: number }>;
  /** Which pids answer; default: only this run's. */
  alive?: (pid: number) => boolean;
}

const RUN_PID = 4242;

function io(script: Script = {}): LaneIo & { lines: { out: string[]; err: string[] }; locks: Map<string, { text: string; mtimeMs: number }> } {
  const lines = { out: [] as string[], err: [] as string[] };
  const locks = script.locks ?? new Map();
  const now = () => NOW;
  const run = () => ({ status: 0, stdout: "", stderr: "" });
  return {
    lines,
    locks,
    cwd: "/repo",
    env: {},
    out: (line) => lines.out.push(line),
    err: (line) => lines.err.push(line),
    lock: memoryLock(locks, now),
    pid: RUN_PID,
    now,
    alive: script.alive ?? ((pid) => pid === RUN_PID),
    sh: (argv) => {
      const key = argv.join(" ");
      if (key === "git rev-parse --abbrev-ref HEAD") return { ...run(), stdout: `${script.branch ?? "agent/x"}\n` };
      if (key === "git rev-parse --absolute-git-dir") return { ...run(), stdout: `${GIT_DIR}\n` };
      if (key === "run gen") return { ...run(), status: script.gen ?? 0 };
      if (key === "run verify:fast") return { ...run(), status: script.verify ?? 0 };
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

  test("closing regenerates derived files before verifying, so a stale manifest or api.md never lands", () => {
    const calls: string[] = [];
    const fake = io();
    const sh = fake.sh;
    fake.sh = (argv, inherit) => {
      calls.push(argv.join(" "));
      return sh(argv, inherit);
    };
    closeLane({}, fake);
    expect(calls.indexOf("run gen")).toBeLessThan(calls.indexOf("run verify:fast"));
  });

  test("a gen failure stops before verify and land", () => {
    const calls: string[] = [];
    const fake = io({ gen: 1 });
    const sh = fake.sh;
    fake.sh = (argv, inherit) => {
      calls.push(argv.join(" "));
      return sh(argv, inherit);
    };
    expect(closeLane({}, fake)).toBe(EXIT_VERIFY_FAILED);
    expect(calls).not.toContain("run verify:fast");
    expect(fake.lines.err.join("\n")).toContain("gen failed");
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

describe("one lane:close per worktree", () => {
  const liveLock = (pid: number, startedAt = NOW - 90_000) => ({
    text: `${JSON.stringify({ branch: "agent/first", pid, startedAt })}\n`,
    mtimeMs: startedAt,
  });

  test("a second run is refused while the first holds the worktree, and runs nothing", () => {
    const calls: string[] = [];
    const fake = io({ locks: new Map([[LOCK_PATH, liveLock(777)]]), alive: (pid) => pid === 777 || pid === RUN_PID });
    const sh = fake.sh;
    fake.sh = (argv, inherit) => {
      calls.push(argv.join(" "));
      return sh(argv, inherit);
    };
    expect(closeLane({}, fake)).toBe(EXIT_ANOTHER_RUN);
    const refusal = fake.lines.err.join("\n");
    expect(refusal).toContain("another lane:close is still running in this worktree");
    expect(refusal).toContain("agent/first (pid 777");
    expect(refusal).toContain("90s ago");
    expect(refusal).toContain(LOCK_PATH);
    expect(calls).not.toContain("run gen");
    expect(calls).not.toContain("run verify:fast");
    expect(calls).not.toContain("run scripts/land.ts --commit");
    // The first run's lock is left exactly as it was.
    expect(fake.locks.get(LOCK_PATH)).toEqual(liveLock(777));
  });

  test("a lock whose run died is broken and the lane closes", () => {
    const fake = io({ locks: new Map([[LOCK_PATH, liveLock(777)]]) });
    expect(closeLane({}, fake)).toBe(EXIT_CLOSED);
    expect(fake.lines.out.join("\n")).toContain("breaking a stale lock from agent/first (pid 777): pid 777 is gone");
    expect(fake.locks.has(LOCK_PATH)).toBe(false);
  });

  test("a lock older than land's limit is broken even when its pid still answers", () => {
    const fake = io({
      locks: new Map([[LOCK_PATH, liveLock(777, NOW - LOCK_STALE_MS - 1)]]),
      alive: () => true,
    });
    expect(closeLane({}, fake)).toBe(EXIT_CLOSED);
    expect(fake.lines.out.join("\n")).toContain("breaking a stale lock from agent/first (pid 777): older than 30 minutes");
  });

  test("the lock names this run while it holds the worktree and is gone when the lane closes", () => {
    const fake = io();
    const sh = fake.sh;
    let seen: unknown = null;
    fake.sh = (argv, inherit) => {
      if (argv.join(" ") === "run verify:fast") seen = JSON.parse(fake.locks.get(LOCK_PATH)?.text ?? "null");
      return sh(argv, inherit);
    };
    expect(closeLane({}, fake)).toBe(EXIT_CLOSED);
    expect(seen).toEqual({ branch: "agent/x", pid: RUN_PID, startedAt: NOW });
    expect(fake.locks.has(LOCK_PATH)).toBe(false);
  });

  test("the lock is released when verify fails, when land fails and when a step throws", () => {
    for (const script of [{ verify: 1 }, { land: 4 }, { ci: "not json" }] as const) {
      const fake = io(script);
      closeLane({}, fake);
      expect(fake.locks.has(LOCK_PATH)).toBe(false);
    }
    const thrown = io();
    const sh = thrown.sh;
    thrown.sh = (argv, inherit) => {
      if (argv.join(" ") === "run gen") throw new Error("spawn failed");
      return sh(argv, inherit);
    };
    expect(() => closeLane({}, thrown)).toThrow("spawn failed");
    expect(thrown.locks.has(LOCK_PATH)).toBe(false);
  });

  test("a lock another run took over is left to that run", () => {
    const fake = io();
    const sh = fake.sh;
    fake.sh = (argv, inherit) => {
      // Someone replaced our lock mid-run (a stale-break race); release must not delete theirs.
      if (argv.join(" ") === "run verify:fast") fake.locks.set(LOCK_PATH, liveLock(999, NOW));
      return sh(argv, inherit);
    };
    closeLane({}, fake);
    expect(fake.locks.get(LOCK_PATH)).toEqual(liveLock(999, NOW));
  });
});

describe("arguments", () => {
  test("--pr and --allow", () => {
    expect(parseArgs(["--pr", "12"])).toEqual({ pr: 12, allow: [], messages: [] });
    expect(parseArgs(["--allow", "bun.lock"])).toEqual({ allow: ["bun.lock"], messages: [] });
    expect(parseArgs(["-m", "Wolves hunt", "--message", "Fixed: dens"]).messages).toEqual(["Wolves hunt", "Fixed: dens"]);
    expect(() => parseArgs(["-m", " "])).toThrow("-m needs the words for the change note");
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
