import { afterEach, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";


import {
  EXIT_DRAINED,
  EXIT_SOMETHING_FAILED,
  POLL_MS,
  READ_ATTEMPTS,
  RERUN_GRACE_MS,
  WAIT_TIMEOUT_MS,
  drain,
  formatOutcome,
  parseArgs,
  readyPrs,
  rebaseOntoBase,
  waitForGreen,
} from "./land-queue";
import type { QueueIo, PrRow, ReadyPr } from "./land-queue";
import type { Run } from "./land";
import type { GitHub } from "./github";
import { fakeGitHub, type FakeCheck, type FakeGitHub, type FakePull } from "./github.fixture";

const SCRATCH = join(import.meta.dir, "..", ".scratch");
const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function ok(stdout = ""): Run {
  return { status: 0, stdout, stderr: "" };
}

const HEAD = "head1";

/** One open PR, #`number` on agent/<number>, whose head commit carries `checks`. */
function onePr(number: number, checks: FakeCheck[], extra: Partial<FakePull> = {}): FakeGitHub {
  return fakeGitHub({ pulls: [{ number, head: `agent/${number}`, sha: HEAD, ...extra }], checks: { [HEAD]: checks } });
}

const merges = (api: FakeGitHub): number[] =>
  api.calls.filter((call) => call.method === "PUT" && call.path.endsWith("/merge")).map((call) => Number(call.path.split("/").at(-2)));

function io(overrides: Partial<QueueIo> & { github: GitHub }): QueueIo & { lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  return {
    git: () => ok(),
    pause: () => {},
    now: () => 0,
    log: (line) => lines.push(line),
    error: (line) => errors.push(line),
    lines,
    errors,
    ...overrides,
  };
}

function row(overrides: Partial<PrRow> & { number: number }): PrRow {
  return {
    url: `https://example.test/${overrides.number}`,
    headRefName: `agent/${overrides.number}`,
    isDraft: false,
    isCrossRepository: false,
    updatedAt: null,
    labels: [],
    ...overrides,
  };
}

test("parses the base and the readiness label, and rejects typos", () => {
  expect(parseArgs([])).toEqual({ base: "beta", label: "land:queue" });
  expect(parseArgs(["--base", "beta", "--label", "ready"])).toEqual({ base: "beta", label: "ready" });
  expect(() => parseArgs(["--label"])).toThrow("--label needs a value");
  expect(() => parseArgs(["--wait"])).toThrow("unknown argument --wait");
});

test("ready is the label alone, and drafts and forks are not ready", () => {
  const ready = readyPrs(
    [
      row({ number: 3, labels: ["land:queue"], updatedAt: "2026-10-24T01:00:00Z" }),
      row({ number: 4, labels: ["land:queue"], updatedAt: "2026-10-24T00:30:00Z" }),
      row({ number: 5, labels: ["bug"] }),
      row({ number: 6, labels: ["land:queue"], isDraft: true }),
      row({ number: 7, labels: ["land:queue"], isCrossRepository: true }),
    ],
    "land:queue",
  );
  expect(ready.map((pr) => pr.number)).toEqual([4, 3]);
});

test("the drain is ordered by when each PR became ready, not by branch name or number", () => {
  const ready = readyPrs(
    [
      row({ number: 10, headRefName: "agent/aaa-first-alphabetically", labels: ["land:queue"], updatedAt: "2026-10-24T02:00:00Z" }),
      row({ number: 11, headRefName: "agent/zzz-last-alphabetically", labels: ["land:queue"], updatedAt: "2026-10-24T00:00:00Z" }),
      row({ number: 9, headRefName: "agent/mmm", labels: ["land:queue"], updatedAt: "2026-10-24T01:00:00Z" }),
    ],
    "land:queue",
  );
  expect(ready.map((pr) => pr.branch)).toEqual([
    "agent/zzz-last-alphabetically",
    "agent/mmm",
    "agent/aaa-first-alphabetically",
  ]);
});

test("waits once per PR, reports the run it waited on, and stops at the first green", () => {
  let clock = 0;
  const pauses: number[] = [];
  const running: FakeCheck = { name: "ci", status: "in_progress", conclusion: null, url: "https://example.test/actions/runs/901/job/1" };
  const answers: FakeCheck[][] = [[running], [running], [{ name: "ci", url: "https://example.test/actions/runs/901/job/1" }]];
  let step = 0;
  const api = onePr(21, answers[0] ?? []);
  const result = waitForGreen(21, io({
    github: api.github,
    now: () => clock,
    pause: (ms) => {
      pauses.push(ms);
      step += 1;
      clock += ms;
      api.checks[HEAD] = answers[Math.min(step, answers.length - 1)] ?? [];
    },
  }));

  expect(result.verdict).toBe("green");
  expect(result.runIds).toEqual([901]);
  expect(pauses).toEqual([POLL_MS, POLL_MS]);
  expect(result.waitedMs).toBe(POLL_MS * 2);
});

test("a superseded cancelled attempt does not stop the queue, and a running check is never a pass", () => {
  // Same shape as PR #2330 on 2026-10-24: a second workflow run on the head commit was cancelled
  // after the first passed. The old row-by-row verdict called 9 of these checks failures.
  const superseded = onePr(24, [
    { name: "ci", conclusion: "success", startedAt: "2026-10-24T04:12:44Z", url: "https://example.test/actions/runs/601/job/1" },
    { name: "ci", conclusion: "cancelled", startedAt: "2026-10-24T04:17:03Z", url: "https://example.test/actions/runs/602/job/2" },
    { name: "types", conclusion: "success", startedAt: "2026-10-24T04:10:17Z" },
    { name: "types", conclusion: "cancelled", startedAt: "2026-10-24T04:15:15Z" },
  ]);
  const green = waitForGreen(24, io({ github: superseded.github }));
  expect(green.verdict).toBe("green");
  expect(green.detail).toBe("");

  const failed = waitForGreen(
    25,
    io({
      github: onePr(25, [
        { name: "test (ui)", conclusion: "success", startedAt: "2026-10-24T04:10:00Z" },
        { name: "test (ui)", conclusion: "failure", startedAt: "2026-10-24T04:20:00Z", url: "https://example.test/job/7" },
      ]).github,
    }),
  );
  expect(failed.verdict).toBe("failed");
  expect(failed.detail).toContain("test (ui)");

  let clock = 0;
  const running = waitForGreen(
    26,
    io({
      github: onePr(26, [
        { name: "ci", conclusion: "success", startedAt: "2026-10-24T04:10:00Z" },
        { name: "perf", status: "in_progress", conclusion: null, startedAt: "2026-10-24T04:20:00Z", url: "https://example.test/actions/runs/603/job/3" },
      ]).github,
      now: () => clock,
      pause: (ms) => {
        clock += ms;
      },
    }),
  );
  expect(running.verdict).toBe("timedout");
  expect(running.detail).toContain("still running after 25 minutes: 1 of 2 (run 603): perf");
});

test("a run cancelled by its replacement on the same commit keeps the queue waiting for the replacement", () => {
  // PR #2496 on 25 Oct: two pull_request runs on one commit; the newer cancelled the older's jobs
  // before it had any of its own, and the queue called the cancellations failures in under a second.
  let step = 0;
  const answers: FakeCheck[][] = [
    [
      { name: "games", conclusion: "cancelled", startedAt: "2026-10-26T00:54:10Z" },
      { name: "types", status: "in_progress", conclusion: null, startedAt: "2026-10-26T00:54:10Z" },
    ],
    [
      { name: "games", conclusion: "cancelled", startedAt: "2026-10-26T00:54:10Z" },
      { name: "games", conclusion: "success", startedAt: "2026-10-26T00:55:00Z" },
      { name: "types", conclusion: "success", startedAt: "2026-10-26T00:55:00Z" },
    ],
  ];
  const api = onePr(27, answers[0] ?? []);
  const result = waitForGreen(27, io({
    github: api.github,
    pause: () => {
      step += 1;
      api.checks[HEAD] = answers[Math.min(step, answers.length - 1)] ?? [];
    },
  }));
  expect(result.verdict).toBe("green");
  expect(step).toBe(1);

  const settled = waitForGreen(28, io({ github: onePr(28, [{ name: "games", conclusion: "cancelled" }, { name: "types" }]).github }));
  expect(settled.verdict).toBe("failed");
});

test("a run cancelled with nothing replacing it is run again once, never read as a failure", () => {
  // A PR body edit started a second run on the same commit that cancelled the first; the status
  // scripts read the cancelled checks as failures although no check had failed.
  let step = 0;
  const answers: FakeCheck[][] = [
    [
      { name: "test (h)", conclusion: "cancelled", startedAt: "2026-10-28T10:00:00Z", url: "https://example.test/actions/runs/700/job/1" },
      { name: "types", conclusion: "success", startedAt: "2026-10-28T10:00:00Z", url: "https://example.test/actions/runs/700/job/2" },
    ],
    [
      { name: "test (h)", conclusion: "cancelled", startedAt: "2026-10-28T10:00:00Z", url: "https://example.test/actions/runs/700/job/1" },
      { name: "test (h)", conclusion: "success", startedAt: "2026-10-28T10:05:00Z", url: "https://example.test/actions/runs/700/job/3" },
      { name: "types", conclusion: "success", startedAt: "2026-10-28T10:00:00Z", url: "https://example.test/actions/runs/700/job/2" },
    ],
  ];
  const api = onePr(29, answers[0] ?? []);
  const result = waitForGreen(29, io({
    github: api.github,
    pause: () => {
      step += 1;
      api.checks[HEAD] = answers[Math.min(step, answers.length - 1)] ?? [];
    },
  }));
  expect(api.reruns).toEqual([700]);
  expect(result.verdict).toBe("green");

  // Still cancelled once the rerun has had its grace: then it is reported, with the check named.
  let clock = 0;
  const again = waitForGreen(30, io({
    github: onePr(30, answers[0] ?? []).github,
    now: () => clock,
    pause: (ms) => {
      clock += ms;
    },
  }));
  expect(again.verdict).toBe("failed");
  expect(again.detail).toContain("test (h)");
  expect(again.waitedMs).toBeGreaterThanOrEqual(RERUN_GRACE_MS);
});

test("a failing check ends the wait at once, and a wait that never settles gives up at the ceiling", () => {
  let paused = 0;
  const failed = waitForGreen(22, io({
    github: onePr(22, [{ name: "test (ui)", conclusion: "failure", url: "https://example.test/job/7" }]).github,
    pause: () => {
      paused += 1;
    },
  }));
  expect(failed.verdict).toBe("failed");
  expect(failed.detail).toContain("test (ui)");
  expect(failed.runIds).toEqual([]);
  expect(paused).toBe(0);

  let clock = 0;
  const stuck = waitForGreen(23, io({
    github: onePr(23, [{ name: "ci", status: "queued", conclusion: null }]).github,
    now: () => clock,
    pause: (ms) => {
      clock += ms;
    },
  }));
  expect(stuck.verdict).toBe("timedout");
  expect(stuck.waitedMs).toBe(WAIT_TIMEOUT_MS);
  expect(stuck.detail).toContain("still running after 25 minutes");
});

const pr = (number: number, branch = `agent/${number}`): ReadyPr => ({
  number,
  url: `https://example.test/${number}`,
  branch,
  readyAt: 0,
});

test("landing prints one line per PR with that PR's wait and run, in readiness order", () => {
  let clock = 0;
  const greenAt = (number: number): FakeCheck[] => [{ name: "ci", url: `https://example.test/actions/runs/${number}0/job/1` }];
  const api = fakeGitHub({
    pulls: [
      { number: 31, head: "agent/aaa", sha: "h31", labels: ["land:queue"], updatedAt: "2026-10-24T03:00:00Z", mergeableState: "clean" },
      { number: 32, head: "agent/zzz", sha: "h32", labels: ["land:queue"], updatedAt: "2026-10-24T02:00:00Z", mergeableState: "clean" },
    ],
    checks: { h31: greenAt(31), h32: greenAt(32) },
  });
  const out = io({
    github: api.github,
    now: () => clock,
    pause: (ms) => {
      clock += ms;
    },
  });
  const result = drain({ base: "beta", label: "land:queue" }, out);

  expect(result.code).toBe(EXIT_DRAINED);
  expect(merges(api)).toEqual([32, 31]);
  expect(result.drained.map((entry) => entry.pr.number)).toEqual([32, 31]);
  expect(out.lines).toContainEqual("#32 agent/zzz landed without waiting, run 320");
  expect(out.lines.at(-1)).toMatch(/^drained 2 of 2 in /);
});

test("nothing ready prints one line and exits 0, and a failed PR reports and exits 1", () => {
  const empty = io({ github: onePr(40, []).github });
  const nothing = drain({ base: "beta", label: "land:queue" }, empty);
  expect(nothing.code).toBe(EXIT_DRAINED);
  expect(empty.lines).toEqual(["nothing ready: no open PR into beta has the land:queue label"]);

  const conflicted = io({ github: onePr(41, [], { labels: ["land:queue"], mergeableState: "dirty" }).github });
  const failed = drain({ base: "beta", label: "land:queue" }, conflicted);
  expect(failed.code).toBe(EXIT_SOMETHING_FAILED);
  expect(conflicted.errors[0]).toContain("#41 agent/41 not landed: waited 0s");
  expect(conflicted.errors[0]).toContain("conflicts with the base");
});

test("a PR merged before the queue reached it is reported as landed, and not merged again", () => {
  const api = onePr(50, [], { state: "closed", merged: true });
  const out = io({ github: api.github });
  const result = drain({ base: "beta", label: "land:queue", pr: 50 }, out);
  expect(result.code).toBe(EXIT_DRAINED);
  expect(out.lines).toContain("#50 agent/50 landed without waiting");
  expect(merges(api)).toEqual([]);
});

test("--pr lands only that PR, labelled or not, and prints one line", () => {
  expect(parseArgs(["--pr", "61"])).toEqual({ base: "beta", label: "land:queue", pr: 61 });
  expect(() => parseArgs(["--pr", "x"])).toThrow("--pr needs a PR number");
  const api = fakeGitHub({
    pulls: [
      { number: 60, head: "agent/60", sha: "h60", labels: ["land:queue"] },
      { number: 61, head: "agent/61", sha: "h61", mergeableState: "clean" },
    ],
    checks: { h60: [{ name: "test" }], h61: [{ name: "test" }] },
  });
  const out = io({ github: api.github });
  const result = drain({ base: "beta", label: "land:queue", pr: 61 }, out);
  expect(result.code).toBe(EXIT_DRAINED);
  expect(out.lines).toEqual(["#61 agent/61 landed without waiting"]);
  expect(api.calls.some((call) => call.path.includes("/pulls?"))).toBe(false);
  expect(merges(api)).toEqual([61]);
});

test("a merge GitHub refuses for a moved base is rebased and tried again; any other refusal is named", () => {
  let refusals = 0;
  const moved = fakeGitHub({
    pulls: [{ number: 70, head: "agent/70", sha: HEAD, mergeableState: "clean" }],
    checks: { [HEAD]: [{ name: "ci" }] },
    fail: (call) => (call.method === "PUT" && (refusals += 1) === 1 ? "HTTP 405: Base branch was modified. Review and try the merge again." : undefined),
  });
  const out = io({ github: moved.github });
  expect(drain({ base: "beta", label: "land:queue", pr: 70 }, out).code).toBe(EXIT_DRAINED);
  expect(refusals).toBe(2);
  expect(out.lines).toContainEqual(expect.stringContaining("#70 agent/70 merge refused because origin/beta moved"));

  const refused = fakeGitHub({
    pulls: [{ number: 71, head: "agent/71", sha: HEAD, mergeableState: "clean" }],
    checks: { [HEAD]: [{ name: "ci" }] },
    fail: (call) => (call.method === "PUT" ? "HTTP 405: Required status check \"ci\" is expected." : undefined),
  });
  const named = io({ github: refused.github });
  expect(drain({ base: "beta", label: "land:queue", pr: 71 }, named).code).toBe(EXIT_SOMETHING_FAILED);
  expect(named.errors[0]).toContain("Required status check");
});

test("formatOutcome names the wait and the run, and never leaves a failed PR looking landed", () => {
  expect(formatOutcome({ pr: pr(1), outcome: "landed", waitedMs: 161_000, runIds: [901], detail: "" })).toBe(
    "#1 agent/1 landed: waited 2m41s, run 901",
  );
  expect(formatOutcome({ pr: pr(2), outcome: "failed", waitedMs: 0, runIds: [], detail: "conflicts" })).toBe(
    "#2 agent/2 not landed: waited 0s: conflicts",
  );
});

function gitIn(cwd: string, args: string[]): Run {
  const result = Bun.spawnSync({
    cmd: ["git", "-c", "user.email=queue@example.test", "-c", "user.name=Queue", ...args],
    cwd,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { status: result.exitCode ?? 1, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

function gitOk(cwd: string, args: string[]): string {
  const result = gitIn(cwd, args);
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

function commit(cwd: string, file: string, text: string, message: string): void {
  writeFileSync(join(cwd, file), text);
  gitOk(cwd, ["add", "-A"]);
  gitOk(cwd, ["commit", "-q", "-m", message]);
}

test("a branch the base moved under is rebased in a scratch checkout, and one already current is untouched", () => {
  const home = join(SCRATCH, `queue-${crypto.randomUUID()}`);
  made.push(home);
  mkdirSync(home, { recursive: true });
  const bare = join(home, "origin.git");
  gitOk(home, ["init", "-q", "--bare", "-b", "beta", bare]);
  const work = join(home, "work");
  gitOk(home, ["init", "-q", "-b", "beta", work]);
  commit(work, "shared.txt", "one\n", "base");
  gitOk(work, ["remote", "add", "origin", bare]);
  gitOk(work, ["push", "-q", "-u", "origin", "beta"]);

  gitOk(work, ["checkout", "-q", "-b", "agent/behind"]);
  commit(work, "task.txt", "task\n", "task work");
  gitOk(work, ["push", "-q", "-u", "origin", "agent/behind"]);

  const mover = join(home, "mover");
  gitOk(home, ["clone", "-q", bare, mover]);
  commit(mover, "upstream.txt", "moved\n", "beta moves on");
  gitOk(mover, ["push", "-q", "origin", "beta"]);
  const movedTip = gitOk(mover, ["rev-parse", "HEAD"]);

  const checkoutDir = join(home, "checkout");
  const calls: string[][] = [];
  const git: QueueIo["git"] = (dir, args) => {
    calls.push([dir, ...args]);
    return gitIn(dir === checkoutDir ? checkoutDir : work, args);
  };

  const ioFor = (branch: string): QueueIo => ({
    github: fakeGitHub().github,
    git,
    pause: () => {},
    now: () => 0,
    log: () => {},
    error: () => {},
    checkout: () => {
      gitOk(work, ["worktree", "add", "--detach", "--force", checkoutDir, `origin/${branch}`]);
      return { dir: checkoutDir, release: () => gitOk(work, ["worktree", "remove", "--force", checkoutDir]) };
    },
  });

  const behindTip = gitOk(bare, ["rev-parse", "refs/heads/agent/behind"]);
  // The lane's tree has moved on to other work, so the queue must not rebase in it.
  gitOk(work, ["checkout", "-q", "beta"]);
  const rebased = rebaseOntoBase({ branch: "agent/behind", base: "beta", io: ioFor("agent/behind") });
  expect(rebased).toEqual({ rebased: true, refusal: null });
  const pushedTip = gitOk(bare, ["rev-parse", "refs/heads/agent/behind"]);
  expect(pushedTip).not.toBe(behindTip);
  expect(gitIn(bare, ["merge-base", "--is-ancestor", movedTip, pushedTip]).status).toBe(0);
  expect(calls.some((call) => call.includes(`--force-with-lease=agent/behind:${behindTip}`))).toBe(true);

  let checkouts = 0;
  const current = rebaseOntoBase({
    branch: "beta",
    base: "beta",
    io: {
      ...ioFor("beta"),
      checkout: () => {
        checkouts += 1;
        return null;
      },
    },
  });
  expect(current).toEqual({ rebased: false, refusal: null });
  expect(checkouts).toBe(0);
}, 60_000);

test("a generated file both sides changed never stops the queue: it takes the base's copy and regenerates in the lane's tree", () => {
  // The queue's own rebase was a plain `git rebase`, so two lanes that each added an export stopped
  // there on export-manifest.json and api.md, and the lane resolved generated text by hand.
  const home = join(SCRATCH, `queue-gen-${crypto.randomUUID()}`);
  made.push(home);
  mkdirSync(join(home, "work", "scripts"), { recursive: true });
  const bare = join(home, "origin.git");
  const work = join(home, "work");
  gitOk(home, ["init", "-q", "--bare", "-b", "beta", bare]);
  gitOk(work, ["init", "-q", "-b", "beta"]);
  commit(work, "scripts/export-manifest.json", "[\"a\"]\n", "base");
  gitOk(work, ["remote", "add", "origin", bare]);
  gitOk(work, ["push", "-q", "-u", "origin", "beta"]);
  gitOk(work, ["checkout", "-q", "-b", "agent/gen"]);
  commit(work, "scripts/export-manifest.json", "[\"a\", \"lane\"]\n", "lane export");
  gitOk(work, ["push", "-q", "-u", "origin", "agent/gen"]);

  const mover = join(home, "mover");
  gitOk(home, ["clone", "-q", bare, mover]);
  commit(mover, "scripts/export-manifest.json", "[\"a\", \"other\"]\n", "another lane's export");
  gitOk(mover, ["push", "-q", "origin", "beta"]);
  const movedTip = gitOk(mover, ["rev-parse", "HEAD"]);

  const generated: string[][] = [];
  const result = rebaseOntoBase({
    branch: "agent/gen",
    base: "beta",
    io: {
      github: fakeGitHub().github,
      git: (_dir, args) => gitIn(work, args),
      pause: () => {},
      now: () => 0,
      log: () => {},
      error: () => {},
      checkout: () => {
        throw new Error("the lane's own clean tree at the pushed tip is where the queue rebases");
      },
      exec: (command) => {
        generated.push([...command]);
        writeFileSync(join(work, "scripts", "export-manifest.json"), "[\"a\", \"lane\", \"other\"]\n");
        return ok();
      },
    },
  });
  expect(result).toEqual({ rebased: true, refusal: null });
  expect(generated).toEqual([["bun", "run", "gen"]]);
  const pushedTip = gitOk(bare, ["rev-parse", "refs/heads/agent/gen"]);
  expect(gitIn(bare, ["merge-base", "--is-ancestor", movedTip, pushedTip]).status).toBe(0);
  expect(gitOk(bare, ["show", `${pushedTip}:scripts/export-manifest.json`])).toBe("[\"a\", \"lane\", \"other\"]");
}, 60_000);

test("a failed read while waiting is tried again, and only reads failing in a row give up, naming GitHub's answer", () => {
  const flaky = (failures: number): { github: GitHub; reads: () => number } => {
    const base = onePr(31, [{ name: "ci" }]).github;
    let reads = 0;
    return {
      reads: () => reads,
      github: {
        ...base,
        pull: (number) => {
          reads += 1;
          return reads <= failures ? { ok: false, error: "error connecting to api.github.com\ncheck your internet connection" } : base.pull(number);
        },
      },
    };
  };
  const blip = flaky(READ_ATTEMPTS - 1);
  const recovered = io({ github: blip.github });
  expect(waitForGreen(31, recovered).verdict).toBe("green");
  expect(blip.reads()).toBe(READ_ATTEMPTS);
  expect(recovered.lines[0]).toContain("error connecting to api.github.com");

  const down = flaky(READ_ATTEMPTS);
  const result = waitForGreen(31, io({ github: down.github }));
  expect(result.verdict).toBe("unreadable");
  expect(result.detail).toBe(`reading the PR failed ${READ_ATTEMPTS} times in a row: error connecting to api.github.com`);
});

test("--pr survives a GitHub 500 on every read it makes, the first one included", () => {
  const api = onePr(62, [{ name: "test" }], { mergeableState: "clean" });
  let reads = 0;
  const github: GitHub = {
    ...api.github,
    pull: (number) => {
      reads += 1;
      return reads % 2 === 1 ? { ok: false, error: "gh: HTTP 500" } : api.github.pull(number);
    },
  };
  const out = io({ github });
  const result = drain({ base: "beta", label: "land:queue", pr: 62 }, out);
  expect(result.code).toBe(EXIT_DRAINED);
  expect(merges(api)).toEqual([62]);
  expect(out.lines.filter((line) => line.includes("gh: HTTP 500")).length).toBeGreaterThanOrEqual(2);
});
