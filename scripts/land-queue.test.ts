import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { findBlockingWaits } from "./check-no-blocking-wait";

import {
  EXIT_DRAINED,
  EXIT_SOMETHING_FAILED,
  POLL_MS,
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

const SCRATCH = join(import.meta.dir, "..", ".scratch");
const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function ok(stdout = ""): Run {
  return { status: 0, stdout, stderr: "" };
}

function fail(stderr: string): Run {
  return { status: 1, stdout: "", stderr };
}

function rollup(entries: readonly { name: string; conclusion?: string; status?: string; startedAt?: string; url?: string }[]): string {
  return JSON.stringify(
    entries.map((entry) => ({
      name: entry.name,
      conclusion: entry.conclusion ?? null,
      status: entry.status ?? "COMPLETED",
      startedAt: entry.startedAt ?? null,
      detailsUrl: entry.url ?? "",
    })),
  );
}

/** A gh that answers PR views from a script, records every call, and merges when told to. */
function scriptedGh(options: {
  views: Record<number, () => Run>;
  merge?: (number: number) => Run;
  list?: PrRow[];
}): { gh: QueueIo["gh"]; calls: string[][] } {
  const calls: string[][] = [];
  const gh: QueueIo["gh"] = (args) => {
    calls.push(args);
    const joined = args.join(" ");
    if (joined.startsWith("pr list")) return ok(JSON.stringify(options.list ?? []));
    if (joined.startsWith("pr view")) return options.views[Number(args[2])]?.() ?? fail("no scripted view");
    if (joined.startsWith("pr merge")) {
      const number = Number(args[2]);
      return options.merge?.(number) ?? ok();
    }
    return ok();
  };
  return { gh, calls };
}

function io(overrides: Partial<QueueIo> & { gh: QueueIo["gh"] }): QueueIo & { lines: string[]; errors: string[] } {
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
  return { url: `https://example.test/${overrides.number}`, headRefName: `agent/${overrides.number}`, ...overrides };
}

test("parses the base and the readiness label, and rejects typos", () => {
  expect(parseArgs([])).toEqual({ base: "beta", label: "land:queue" });
  expect(parseArgs(["--base", "beta", "--label", "ready"])).toEqual({ base: "beta", label: "ready" });
  expect(() => parseArgs(["--label"])).toThrow("--label needs a value");
  expect(() => parseArgs(["--wait"])).toThrow("unknown argument --wait");
});

test("ready is auto-merge armed or the label, and drafts and forks are not ready", () => {
  const ready = readyPrs(
    [
      row({ number: 3, autoMergeRequest: { enabledAt: "2026-10-24T01:00:00Z" } }),
      row({ number: 4, labels: [{ name: "land:queue" }], updatedAt: "2026-10-24T00:30:00Z" }),
      row({ number: 5, labels: [{ name: "bug" }] }),
      row({ number: 6, autoMergeRequest: { enabledAt: "2026-10-24T00:10:00Z" }, isDraft: true }),
      row({ number: 7, autoMergeRequest: { enabledAt: "2026-10-24T00:10:00Z" }, isCrossRepository: true }),
    ],
    "land:queue",
  );
  expect(ready.map((pr) => [pr.number, pr.signal])).toEqual([
    [4, "label"],
    [3, "auto-merge"],
  ]);
});

test("the drain is ordered by when each PR became ready, not by branch name or number", () => {
  const ready = readyPrs(
    [
      row({ number: 10, headRefName: "agent/aaa-first-alphabetically", autoMergeRequest: { enabledAt: "2026-10-24T02:00:00Z" } }),
      row({ number: 11, headRefName: "agent/zzz-last-alphabetically", autoMergeRequest: { enabledAt: "2026-10-24T00:00:00Z" } }),
      row({ number: 9, headRefName: "agent/mmm", labels: [{ name: "land:queue" }], updatedAt: "2026-10-24T01:00:00Z" }),
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
  const answers = [
    rollup([{ name: "ci", status: "IN_PROGRESS", conclusion: "", url: "https://example.test/actions/runs/901/job/1" }]),
    rollup([{ name: "ci", status: "IN_PROGRESS", conclusion: "", url: "https://example.test/actions/runs/901/job/1" }]),
    rollup([{ name: "ci", conclusion: "SUCCESS", url: "https://example.test/actions/runs/901/job/1" }]),
  ];
  let step = 0;
  const gh: QueueIo["gh"] = (args) => {
    if (args.join(" ").startsWith("pr view")) {
      return ok(JSON.stringify({ number: 21, url: "u", state: "OPEN", headRefName: "agent/x", statusCheckRollup: JSON.parse(answers[Math.min(step, answers.length - 1)]!) }));
    }
    return ok();
  };
  const result = waitForGreen(21, io({
    gh,
    now: () => clock,
    pause: (ms) => {
      pauses.push(ms);
      step += 1;
      clock += ms;
    },
  }));

  expect(result.verdict).toBe("green");
  expect(result.runIds).toEqual([901]);
  expect(pauses).toEqual([POLL_MS, POLL_MS]);
  expect(result.waitedMs).toBe(POLL_MS * 2);
});

test("a superseded cancelled attempt does not stop the queue, and a running check is never a pass", () => {
  const view = (number: number, entries: Parameters<typeof rollup>[0]) => () =>
    ok(
      JSON.stringify({
        number,
        url: "u",
        state: "OPEN",
        headRefName: `agent/${number}`,
        headRefOid: "head1",
        statusCheckRollup: JSON.parse(rollup(entries)),
      }),
    );

  // Same shape as PR #2330 on 2026-10-24: a second workflow run on the head commit was cancelled
  // after the first passed. The old row-by-row verdict called 9 of these checks failures.
  const superseded = view(24, [
    { name: "ci", conclusion: "SUCCESS", startedAt: "2026-10-24T04:12:44Z", url: "https://example.test/actions/runs/601/job/1" },
    { name: "ci", conclusion: "CANCELLED", startedAt: "2026-10-24T04:17:03Z", url: "https://example.test/actions/runs/602/job/2" },
    { name: "types", conclusion: "SUCCESS", startedAt: "2026-10-24T04:10:17Z" },
    { name: "types", conclusion: "CANCELLED", startedAt: "2026-10-24T04:15:15Z" },
  ]);
  const green = waitForGreen(24, io({ gh: superseded }));
  expect(green.verdict).toBe("green");
  expect(green.detail).toBe("");

  const failed = waitForGreen(
    25,
    io({
      gh: view(25, [
        { name: "test (ui)", conclusion: "SUCCESS", startedAt: "2026-10-24T04:10:00Z" },
        { name: "test (ui)", conclusion: "FAILURE", startedAt: "2026-10-24T04:20:00Z", url: "https://example.test/job/7" },
      ]),
    }),
  );
  expect(failed.verdict).toBe("failed");
  expect(failed.detail).toContain("test (ui)");

  let clock = 0;
  const running = waitForGreen(
    26,
    io({
      gh: view(26, [
        { name: "ci", conclusion: "SUCCESS", startedAt: "2026-10-24T04:10:00Z" },
        { name: "perf", status: "IN_PROGRESS", conclusion: "", startedAt: "2026-10-24T04:20:00Z", url: "https://example.test/actions/runs/603/job/3" },
      ]),
      now: () => clock,
      pause: (ms) => {
        clock += ms;
      },
    }),
  );
  expect(running.verdict).toBe("timedout");
  expect(running.detail).toContain("still running after 25 minutes: 1 of 2 (run 603): perf");
});

test("a failing check ends the wait at once, and a wait that never settles gives up at the ceiling", () => {
  let paused = 0;
  const failed = waitForGreen(22, io({
    gh: (args) =>
      args.join(" ").startsWith("pr view")
        ? ok(JSON.stringify({ number: 22, url: "u", state: "OPEN", headRefName: "agent/y", statusCheckRollup: JSON.parse(rollup([{ name: "test (ui)", conclusion: "FAILURE", url: "https://example.test/job/7" }])) }))
        : ok(),
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
    gh: (args) =>
      args.join(" ").startsWith("pr view")
        ? ok(JSON.stringify({ number: 23, url: "u", state: "OPEN", headRefName: "agent/z", statusCheckRollup: JSON.parse(rollup([{ name: "ci", status: "QUEUED", conclusion: "" }])) }))
        : ok(),
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
  signal: "auto-merge",
});

test("landing prints one line per PR with that PR's wait and run, in readiness order", () => {
  let clock = 0;
  const merged: number[] = [];
  const greenFor = (number: number) => () =>
    ok(
      JSON.stringify({
        number,
        url: `https://example.test/${number}`,
        state: "OPEN",
        headRefName: `agent/${number}`,
        mergeStateStatus: "CLEAN",
        statusCheckRollup: JSON.parse(rollup([{ name: "ci", conclusion: "SUCCESS", url: `https://example.test/actions/runs/${number}0/job/1` }])),
      }),
    );
  const { gh } = scriptedGh({
    list: [
      row({ number: 31, headRefName: "agent/aaa", autoMergeRequest: { enabledAt: "2026-10-24T03:00:00Z" } }),
      row({ number: 32, headRefName: "agent/zzz", autoMergeRequest: { enabledAt: "2026-10-24T02:00:00Z" } }),
    ],
    views: { 31: greenFor(31), 32: greenFor(32) },
    merge: (number) => {
      merged.push(number);
      return ok();
    },
  });
  const out = io({
    gh,
    now: () => clock,
    pause: (ms) => {
      clock += ms;
    },
  });
  const result = drain({ base: "beta", label: "land:queue" }, out);

  expect(result.code).toBe(EXIT_DRAINED);
  expect(merged).toEqual([32, 31]);
  expect(result.drained.map((entry) => entry.pr.number)).toEqual([32, 31]);
  expect(out.lines).toContainEqual(expect.stringMatching(/^#32 agent\/zzz \(auto-merge\) landed without waiting, run 320$/));
  expect(out.lines.at(-1)).toMatch(/^drained 2 of 2 in /);
});

test("nothing ready prints one line and exits 0, and a failed PR reports and exits 1", () => {
  const empty = io({ gh: scriptedGh({ list: [row({ number: 40 })] }).gh });
  const nothing = drain({ base: "beta", label: "land:queue" }, empty);
  expect(nothing.code).toBe(EXIT_DRAINED);
  expect(empty.lines).toEqual([expect.stringMatching(/^nothing ready: no open PR into beta has auto-merge armed or the land:queue label$/)]);

  const { gh } = scriptedGh({
    list: [row({ number: 41, autoMergeRequest: { enabledAt: "2026-10-24T00:00:00Z" } })],
    views: {
      41: () =>
        ok(
          JSON.stringify({
            number: 41,
            url: "u",
            state: "OPEN",
            headRefName: "agent/41",
            mergeStateStatus: "DIRTY",
            statusCheckRollup: [],
          }),
        ),
    },
  });
  const conflicted = io({ gh });
  const failed = drain({ base: "beta", label: "land:queue" }, conflicted);
  expect(failed.code).toBe(EXIT_SOMETHING_FAILED);
  expect(conflicted.errors[0]).toContain("#41 agent/41 (auto-merge) not landed: waited 0s");
  expect(conflicted.errors[0]).toContain("conflicts with the base");
});

test("a PR auto-merge already landed is reported as landed without waiting", () => {
  const { gh, calls } = scriptedGh({
    list: [row({ number: 50, autoMergeRequest: { enabledAt: "2026-10-24T00:00:00Z" } })],
    views: { 50: () => ok(JSON.stringify({ number: 50, url: "u", state: "MERGED", headRefName: "agent/50", statusCheckRollup: [] })) },
  });
  const out = io({ gh });
  const result = drain({ base: "beta", label: "land:queue" }, out);
  expect(result.code).toBe(EXIT_DRAINED);
  expect(out.lines).toContain("#50 agent/50 (auto-merge) landed without waiting");
  expect(calls.some((call) => call[1] === "merge")).toBe(false);
});

test("formatOutcome names the wait and the run, and never leaves a failed PR looking landed", () => {
  expect(formatOutcome({ pr: pr(1), outcome: "landed", waitedMs: 161_000, runIds: [901], detail: "" })).toBe(
    "#1 agent/1 (auto-merge) landed: waited 2m41s, run 901",
  );
  expect(formatOutcome({ pr: pr(2), outcome: "failed", waitedMs: 0, runIds: [], detail: "conflicts" })).toBe(
    "#2 agent/2 (auto-merge) not landed: waited 0s: conflicts",
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
    gh: () => ok(),
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

test("the queue holds the repo's one sleep, and that sleep names its reason", () => {
  const source = readFileSync(join(import.meta.dir, "land-queue.ts"), "utf8");
  const calls = source.split("\n").filter((line) => /\.pause\(/.test(line));
  expect(calls.length).toBe(1);
  expect(calls[0]).toContain("wait-ok:");
  expect(calls[0]).toContain("land:queue is the one process that waits for CI");
});

test("the no-blocking-wait gate still fails a script that sleeps without the exemption", () => {
  expect(findBlockingWaits('await Bun.$`Start-Sleep -Seconds 90`;').map((wait) => wait.rule)).toEqual(["sleep"]);
  expect(findBlockingWaits('await Bun.$`Start-Sleep -Seconds 90`; // wait-ok: the child binds its port after boot')).toEqual([]);
  expect(findBlockingWaits("await Bun.$`sleep 4`;").map((wait) => wait.rule)).toEqual(["sleep"]);
});
