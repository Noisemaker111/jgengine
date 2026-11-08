import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";

import { fakeGitHub, type FakeGitHub } from "./github.fixture";
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
import { EXIT_BOAT_SPENT } from "./verify-boat";

/** The worktree's git directory, as `git rev-parse --absolute-git-dir` would print it. */
const GIT_DIR = resolve("repo", ".git", "worktrees", "x");
const LOCK_PATH = join(GIT_DIR, LANE_LOCK_FILE);
const NOW = 1_800_000_000_000;
const REPO = "Noisemaker111/jgengine";

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

interface Script {
  preflight?: number;
  /** verify:fast's exit, per run in order; the last one repeats. */
  verify?: number[];
  land?: number;
  /** land without --commit: the rebase lane:close asks for on a conflict. */
  rebase?: number;
  branch?: string;
  shortstat?: string;
  /** The PR GitHub lists for the branch; null for none. */
  pr?: number | null;
  /** The working tree id after each step that can change it. */
  trees?: { verified?: string; scored?: string; head?: string; rebasedHead?: string };
  /** What `git diff --name-only <a> <b>` prints between two tree ids, keyed `a..b`. */
  diffs?: Record<string, string[]>;
  /** A merge refusal GitHub answers, per merge attempt; undefined merges. */
  refusals?: (string | undefined)[];
  /** The head GitHub has for the PR, when someone pushed to it after this lane did. */
  remoteHead?: string;
  /** Trees a passing `verify:fast --landing` receipt already covers when the run starts. */
  passed?: string[];
  /** Lock files already present when the run starts. */
  locks?: Map<string, { text: string; mtimeMs: number }>;
  /** Which pids answer; default: only this run's. */
  alive?: (pid: number) => boolean;
  /** Why the lane's verify:fast writes receipts this landing code cannot read; default none. */
  receiptsBehind?: string;
}

const RUN_PID = 4242;

type Fake = LaneIo & {
  lines: { out: string[]; err: string[] };
  locks: Map<string, { text: string; mtimeMs: number }>;
  calls: string[];
  api: FakeGitHub;
};

/**
 * A lane in memory. verify:fast passing records the tree it ran on as passed; gen-game-suite moves the
 * working tree to `scored`; land --commit moves HEAD to `head`, and a rebase to `rebasedHead`.
 */
function io(script: Script = {}): Fake {
  const lines = { out: [] as string[], err: [] as string[] };
  const locks = script.locks ?? new Map();
  const now = () => NOW;
  const calls: string[] = [];
  const run = () => ({ status: 0, stdout: "", stderr: "" });
  const trees = { verified: "T-verified", scored: "T-verified", head: "T-verified", rebasedHead: "T-rebased", ...script.trees };
  let tree = trees.verified;
  let headTree = trees.head;
  let head = "head1";
  const passed = new Set<string>(script.passed ?? []);
  const verifies = script.verify ?? [0];
  let verifyRuns = 0;
  const pr = script.pr === undefined ? 2278 : script.pr;
  const api = fakeGitHub({
    repo: REPO,
    pulls: pr === null ? [] : [{ number: pr, head: script.branch ?? "agent/x", sha: script.remoteHead ?? "head1" }],
  });
  let mergeAttempt = 0;
  const merge = api.github.mergePull.bind(api.github);
  const github = {
    ...api.github,
    mergePull: (number: number, sha: string) => {
      const refusal = script.refusals?.[mergeAttempt];
      mergeAttempt += 1;
      return refusal === undefined ? merge(number, sha) : { ok: false as const, error: refusal };
    },
  };
  return {
    lines,
    locks,
    calls,
    api,
    cwd: "/repo",
    env: {},
    out: (line) => lines.out.push(line),
    err: (line) => lines.err.push(line),
    lock: memoryLock(locks, now),
    pid: RUN_PID,
    now,
    alive: script.alive ?? ((pid) => pid === RUN_PID),
    tree: () => tree,
    passedOn: (id) => (passed.has(id) ? `.scratch/verify-fast/runs/${id}/receipt.json` : null),
    receiptsBehind: () => script.receiptsBehind ?? null,
    github: () => github,
    pause: () => {},
    sh: (argv) => {
      const key = argv.join(" ");
      calls.push(key);
      if (key === "git rev-parse --abbrev-ref HEAD") return { ...run(), stdout: `${script.branch ?? "agent/x"}\n` };
      if (key === "git rev-parse --absolute-git-dir") return { ...run(), stdout: `${GIT_DIR}\n` };
      if (key === "git rev-parse HEAD") return { ...run(), stdout: `${head}\n` };
      if (key === "git rev-parse HEAD^{tree}") return { ...run(), stdout: `${headTree}\n` };
      if (key === "run preflight --no-verify") return { ...run(), status: script.preflight ?? 0 };
      if (key === "run verify:fast --landing") {
        const status = verifies[Math.min(verifyRuns, verifies.length - 1)] ?? 0;
        verifyRuns += 1;
        if (status === 0) passed.add(tree);
        return { ...run(), status };
      }
      if (key === "run scripts/gen-game-suite.ts") {
        tree = trees.scored;
        return run();
      }
      if (key.startsWith("run scripts/land.ts --commit")) {
        if ((script.land ?? 0) === 0) {
          headTree = trees.head;
          tree = trees.head;
        }
        return { ...run(), status: script.land ?? 0 };
      }
      if (key === "run scripts/land.ts") {
        if ((script.rebase ?? 0) === 0) {
          headTree = trees.rebasedHead;
          tree = trees.rebasedHead;
          head = "head2";
          const pull = api.pulls.get(pr ?? 0);
          if (pull !== undefined) pull.sha = "head2";
        }
        return { ...run(), status: script.rebase ?? 0 };
      }
      if (key.startsWith("git diff --name-only --no-renames ")) {
        const [from, to] = argv.slice(-2);
        return { ...run(), stdout: (script.diffs?.[`${from}..${to}`] ?? []).join("\n") };
      }
      if (key === "git remote get-url origin") return { ...run(), stdout: `git@github.com:${REPO}.git\n` };
      // The one way to GitHub: `gh api`, answered by the fake.
      if (argv[0] === "gh") {
        const answer = api.gh(argv.slice(1));
        return { status: answer.status, stdout: answer.stdout, stderr: answer.stderr };
      }
      if (key.startsWith("git diff --shortstat")) {
        return { ...run(), stdout: script.shortstat ?? " 3 files changed, 120 insertions(+), 4 deletions(-)\n" };
      }
      return run();
    },
  };
}

const merges = (fake: Fake) => fake.api.calls.filter((call) => call.path.endsWith("/merge"));

describe("lane:close end to end", () => {
  test("a clean lane verifies, lands with --commit, merges the verified head and names the merge commit last", () => {
    const fake = io();
    expect(closeLane({}, fake)).toBe(EXIT_CLOSED);
    const printed = fake.lines.out.join("\n");
    expect(printed).toContain("Lane report");
    expect(printed).toContain(`- PR: #2278 merged https://github.com/${REPO}/pull/2278`);
    expect(printed).toContain("- merge commit: merge-2278");
    expect(printed).toContain("- files changed: 3 files changed, 120 insertions(+), 4 deletions(-)");
    expect(fake.lines.out.at(-1)).toBe("lane:close: merged #2278 into beta as merge-2278");
    expect(fake.lines.err).toEqual([]);
    expect(fake.calls).toContain("run scripts/land.ts --commit");
    expect(merges(fake).map((call) => call.fields)).toEqual([{ merge_method: "merge", sha: "head1" }]);
  });

  test("a tree a hand-run verify:fast --landing already passed on skips preflight and verify, in one line", () => {
    const fake = io({ passed: ["T-verified"] });
    expect(closeLane({}, fake)).toBe(EXIT_CLOSED);
    expect(fake.calls).not.toContain("run preflight --no-verify");
    expect(fake.calls).not.toContain("run verify:fast --landing");
    expect(fake.lines.out).toContain(
      "lane:close: verify:fast --landing already passed on this exact tree (.scratch/verify-fast/runs/T-verified/receipt.json); preflight and verify not run again",
    );
    expect(merges(fake)).toHaveLength(1);
  });

  test("a receipt for another tree reuses nothing", () => {
    const fake = io({ passed: ["T-older"] });
    expect(closeLane({}, fake)).toBe(EXIT_CLOSED);
    expect(fake.calls).toContain("run preflight --no-verify");
    expect(fake.calls).toContain("run verify:fast --landing");
  });

  test("nothing asks GitHub for checks, labels a PR or starts a queue: the receipt is the gate", () => {
    const fake = io();
    closeLane({}, fake);
    expect(fake.api.calls.some((call) => call.path.includes("check-runs") || call.path.includes("/labels"))).toBe(false);
    expect(fake.calls.some((call) => call.startsWith("run ci:status") || call.startsWith("run background start"))).toBe(false);
  });

  test("the suite scores and the change note lane:close wrote after verify do not need verify again", () => {
    const fake = io({
      trees: { scored: "T-scored", head: "T-head" },
      diffs: { "T-verified..T-scored": ["games/a/README.md"], "T-verified..T-head": ["games/a/README.md", "changes/agent-x.md"] },
    });
    expect(closeLane({}, fake)).toBe(EXIT_CLOSED);
    expect(fake.calls.filter((call) => call === "run verify:fast --landing")).toHaveLength(1);
  });

  test("a pushed head with any other difference is verified again before it merges", () => {
    const fake = io({ trees: { head: "T-head" }, diffs: { "T-verified..T-head": ["packages/core/src/a.ts"] } });
    expect(closeLane({}, fake)).toBe(EXIT_CLOSED);
    expect(fake.calls.filter((call) => call === "run verify:fast --landing")).toHaveLength(2);
    expect(fake.lines.out.join("\n")).toContain("differs from the verified tree in 1 file(s) (packages/core/src/a.ts); verifying it");
    expect(merges(fake)).toHaveLength(1);
  });

  test("a broken change on the pushed head is refused before anything merges", () => {
    const fake = io({ verify: [0, 1], trees: { head: "T-head" }, diffs: { "T-verified..T-head": ["packages/core/src/a.ts"] } });
    expect(closeLane({}, fake)).toBe(EXIT_VERIFY_FAILED);
    expect(fake.lines.err.join("\n")).toContain("verify:fast failed on the pushed head");
    expect(merges(fake)).toEqual([]);
  });

  test("files edited while verify ran leave no receipt for the tree here, and nothing lands", () => {
    const fake = io();
    fake.passedOn = () => null;
    expect(closeLane({}, fake)).toBe(EXIT_VERIFY_FAILED);
    expect(fake.calls).not.toContain("run scripts/land.ts --commit");
    expect(fake.lines.err.join("\n")).toContain("the files changed while verify:fast ran");
  });

  test("a lane whose verify:fast writes receipts this landing code cannot read stops before anything runs and says to merge beta", () => {
    const fake = io({ receiptsBehind: "this lane's scripts/verify-receipt.ts is older than beta's" });
    expect(closeLane({}, fake)).toBe(EXIT_VERIFY_FAILED);
    expect(fake.calls).not.toContain("run preflight --no-verify");
    expect(fake.calls).not.toContain("run verify:fast --landing");
    expect(fake.calls.some((call) => call.includes("land.ts"))).toBe(false);
    expect(merges(fake)).toEqual([]);
    expect(fake.lines.err.join("\n")).toContain("this lane's scripts/verify-receipt.ts is older than beta's; nothing ran and nothing landed. Merge beta into this branch (git merge origin/beta) and close again.");
  });

  test("a base that moved without a conflict merges at once: no rebase, no second verify", () => {
    const fake = io({ refusals: ["HTTP 405: Base branch was modified. Review and try the merge again."] });
    expect(closeLane({}, fake)).toBe(EXIT_CLOSED);
    expect(fake.calls).not.toContain("run scripts/land.ts");
    expect(fake.calls.filter((call) => call === "run verify:fast --landing")).toHaveLength(1);
  });

  test("a base that conflicts is rebased, the rebased tree verified, and then merged", () => {
    const conflict = "HTTP 405: Pull request has merge conflicts";
    const fake = io({
      refusals: [conflict, conflict, conflict],
      diffs: { "T-verified..T-rebased": ["packages/core/src/b.ts"] },
    });
    expect(closeLane({}, fake)).toBe(EXIT_CLOSED);
    expect(fake.calls).toContain("run scripts/land.ts");
    expect(fake.calls.filter((call) => call === "run verify:fast --landing")).toHaveLength(2);
    expect(fake.lines.out.join("\n")).toContain("conflicts with beta now; rebasing");
    expect(merges(fake).at(-1)?.fields).toEqual({ merge_method: "merge", sha: "head2" });
    expect(fake.lines.out.at(-1)).toBe("lane:close: merged #2278 into beta as merge-2278");
  });

  test("a merge GitHub refuses for another reason leaves the PR open and says why", () => {
    const fake = io({ refusals: ["HTTP 403: Resource not accessible by integration"] });
    expect(closeLane({}, fake)).toBe(EXIT_VERIFY_FAILED);
    expect(fake.lines.err.join("\n")).toContain("GitHub refused to merge #2278: HTTP 403: Resource not accessible by integration; the PR stays open.");
  });

  test("a PR whose head moved past the verified commit is not merged: GitHub merges only the head lane:close verified", () => {
    const fake = io({ remoteHead: "pushed-by-someone-else" });
    expect(closeLane({}, fake)).toBe(EXIT_VERIFY_FAILED);
    expect(fake.api.pulls.get(2278)?.merged).not.toBe(true);
    expect(fake.lines.err.join("\n")).toContain("GitHub refused to merge #2278: HTTP 409: Head branch was modified");
  });

  test("a landing with no PR to name cannot answer", () => {
    const fake = io({ pr: null });
    expect(closeLane({}, fake)).toBe(EXIT_CANNOT_ANSWER);
    expect(fake.lines.err.join("\n")).toContain("cannot name its PR");
  });

  test("verify:fast failing stops before land", () => {
    const fake = io({ verify: [1] });
    expect(closeLane({}, fake)).toBe(EXIT_VERIFY_FAILED);
    expect(fake.calls).not.toContain("run scripts/land.ts --commit");
  });

  test("boat out of starts stops before land and says to close again later, never to run the suite here", () => {
    const fake = io({ verify: [EXIT_BOAT_SPENT] });
    expect(closeLane({}, fake)).toBe(EXIT_VERIFY_FAILED);
    expect(fake.calls).not.toContain("run scripts/land.ts --commit");
    const said = fake.lines.err.join("\n");
    expect(said).toContain("had no start for the Linux steps");
    expect(said).toContain("Do not set JG_VERIFY_BOAT=0");
  });

  test("closing runs preflight (gen, type-checks, gates) before the tests, so a stale manifest or a type error stops it first", () => {
    const fake = io();
    closeLane({}, fake);
    expect(fake.calls.indexOf("run preflight --no-verify")).toBeGreaterThan(-1);
    expect(fake.calls.indexOf("run preflight --no-verify")).toBeLessThan(fake.calls.indexOf("run verify:fast --landing"));
  });

  test("the suite scores the tests earned are written after them and before land commits", () => {
    const fake = io();
    closeLane({}, fake);
    expect(fake.calls.indexOf("run scripts/gen-game-suite.ts")).toBeGreaterThan(fake.calls.indexOf("run verify:fast --landing"));
    expect(fake.calls.indexOf("run scripts/gen-game-suite.ts")).toBeLessThan(fake.calls.indexOf("run scripts/land.ts --commit"));
  });

  test("by default the stage lines stay quiet and the report still prints; --verbose prints each stage", () => {
    const quiet = io();
    closeLane({}, quiet);
    expect(quiet.lines.out.some((line) => line.includes("— preflight"))).toBe(false);
    expect(quiet.lines.out.join("\n")).toContain("Lane report");

    const verbose = io();
    verbose.env = { JG_VERBOSE: "1" };
    closeLane({}, verbose);
    const printed = verbose.lines.out.join("\n");
    expect(printed).toContain("lane:close: agent/x — preflight (install, conflict markers, gen)");
    expect(printed).toContain("lane:close: agent/x — verify:fast --landing (type-checks, gates, tests, boots and the site build)");
    expect(printed).toContain("lane:close: land --commit");
  });

  test("a preflight failure stops before the tests and land", () => {
    const fake = io({ preflight: 1 });
    expect(closeLane({}, fake)).toBe(EXIT_VERIFY_FAILED);
    expect(fake.calls).not.toContain("run verify:fast --landing");
    expect(fake.calls).not.toContain("run scripts/land.ts --commit");
    expect(fake.lines.err.join("\n")).toContain("preflight failed");
  });

  test("land failing returns its exit code and does not close", () => {
    const fake = io({ land: 4 });
    expect(closeLane({}, fake)).toBe(4);
    expect(fake.lines.err.join("\n")).toContain("the lane is not closed");
    expect(merges(fake)).toEqual([]);
  });

  test("--allow paths reach land --commit", () => {
    const fake = io();
    closeLane({ allow: ["bun.lock"] }, fake);
    expect(fake.calls).toContain("run scripts/land.ts --commit --allow bun.lock");
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
    expect(calls).not.toContain("run preflight --no-verify");
    expect(calls).not.toContain("run verify:fast --landing");
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
      if (argv.join(" ") === "run verify:fast --landing") seen = JSON.parse(fake.locks.get(LOCK_PATH)?.text ?? "null");
      return sh(argv, inherit);
    };
    expect(closeLane({}, fake)).toBe(EXIT_CLOSED);
    expect(seen).toEqual({ branch: "agent/x", pid: RUN_PID, startedAt: NOW });
    expect(fake.locks.has(LOCK_PATH)).toBe(false);
  });

  test("the lock is released when verify fails, when land fails, when the merge is refused and when a step throws", () => {
    for (const script of [{ verify: [1] }, { land: 4 }, { refusals: ["HTTP 403: no"] }] as Script[]) {
      const fake = io(script);
      closeLane({}, fake);
      expect(fake.locks.has(LOCK_PATH)).toBe(false);
    }
    const thrown = io();
    const sh = thrown.sh;
    thrown.sh = (argv, inherit) => {
      if (argv.join(" ") === "run preflight --no-verify") throw new Error("spawn failed");
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
      if (argv.join(" ") === "run verify:fast --landing") fake.locks.set(LOCK_PATH, liveLock(999, NOW));
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

  test("--batch hands the rest to the batch, and there is no queue mode", () => {
    expect(landingMode(["--batch", "agent/a", "agent/b", "--dry-run"])).toEqual({ script: "scripts/land-batch.ts", rest: ["agent/a", "agent/b", "--dry-run"] });
    expect(landingMode(["--queue"])).toBeNull();
    expect(landingMode(["--pr", "12"])).toBeNull();
  });
});

describe("the report skeleton", () => {
  test("names the merge commit and the PR", () => {
    const text = reportSkeleton({ branch: "b", pr: 1, prUrl: "u", merged: "abc", filesChanged: "none" });
    expect(text).toContain("- PR: #1 merged u");
    expect(text).toContain("- merge commit: abc");
    expect(text).not.toContain("checks");
  });
});
