import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  EXIT_CHECKS_FAILED,
  EXIT_LANDED,
  EXIT_VERIFY_FAILED,
  LOCK_STALE_MS,
  MERGE_ATTEMPTS,
  QUEUE_LABEL,
  acquireLock,
  baseMoved,
  checkVerdict,
  chooseBody,
  duration,
  ensurePr,
  forcePushArgs,
  formatFailures,
  formatTiming,
  handOffLines,
  landBody,
  landBranch,
  landLocked,
  landRefusal,
  lockPath,
  parseArgs,
  parseLock,
  pickFragment,
  staleReason,
  ownFragments,
  subjectsBody,
  syncOntoBase,
} from "./land";
import type { FragmentFile, Gh, GhCheck, LandIo, LockWait, Run } from "./land";
import { attemptsOf, judgeChecks } from "./ci-status";
import type { RollupEntry } from "./ci-status";

test("parses flags with values and defaults the base to beta", () => {
  expect(parseArgs([])).toEqual({ base: "beta", commit: false, allow: [], watch: false });
  expect(parseArgs(["--verify", "bun run ship:preflight"])).toEqual({
    base: "beta",
    verify: "bun run ship:preflight",
    commit: false,
    allow: [],
    watch: false,
  });
  expect(parseArgs(["--title", "Menus", "--body-file", ".scratch/body.md", "--base", "beta"])).toEqual({
    base: "beta",
    title: "Menus",
    bodyFile: ".scratch/body.md",
    commit: false,
    allow: [],
    watch: false,
  });
  expect(parseArgs(["--watch"]).watch).toBe(true);
  expect(parseArgs(["--commit"]).commit).toBe(true);
});

test("rejects a flag without a value and an unknown flag instead of guessing", () => {
  expect(() => parseArgs(["--verify"])).toThrow("--verify needs a value");
  expect(() => parseArgs(["--verify", "--title"])).toThrow("--verify needs a value");
  expect(() => parseArgs(["--bogus"])).toThrow("unknown argument --bogus");
});

test("takes the fragment named after the branch even when another fragment is newer", () => {
  const files = [
    { path: "changes/other-work.md", text: "### Added\n\n- Other.\n", mtimeMs: 900 },
    { path: "changes/agent-lane-a-a1-12-land-and-shard.md", text: "### Changed\n\n- Mine.\n", mtimeMs: 100 },
  ];
  expect(pickFragment(files, "agent/lane-a-a1-12-land-and-shard")?.text).toContain("Mine.");
});

test("falls back to the newest fragment when no fragment matches the branch", () => {
  const files = [
    { path: "changes/old.md", text: "old", mtimeMs: 100 },
    { path: "changes/new.md", text: "new", mtimeMs: 900 },
  ];
  expect(pickFragment(files, "agent/somewhere-else")?.text).toBe("new");
  expect(pickFragment([], "agent/somewhere-else")).toBeNull();
});

test("builds the PR body from an explicit body file, then the fragment, then the summary", () => {
  expect(chooseBody({ fragment: "### Added\n\n- Note.\n", bodyFile: "file body", summary: "summary" })).toBe("file body");
  expect(chooseBody({ fragment: "### Added\n\n- Note.\n", bodyFile: "  \n", summary: "summary" })).toBe(
    "### Added\n\n- Note.",
  );
  expect(chooseBody({ bodyFile: null, summary: " summary " })).toBe("summary");
});

test("an explicit body file is used as written and no fragment is even read for it", () => {
  const read: string[] = [];
  const body = landBody({
    args: { base: "beta", bodyFile: ".scratch/body.md" },
    branch: "agent/lane-x",
    summary: "the last commit",
    read: (path) => {
      read.push(path);
      return "the body I wrote\n";
    },
    files: () => {
      throw new Error("no fragment must be read when a body file is given");
    },
  });
  expect(body).toEqual({ text: "the body I wrote", explicit: true });
  expect(read).toEqual([".scratch/body.md"]);
});

const FOREIGN: FragmentFile = {
  path: "/repo/changes/agent-lane-someone-else.md",
  text: "### Added\n\n- A stranger's note.\n",
  mtimeMs: 900,
};
const OWN: FragmentFile = {
  path: "/repo/changes/agent-lane-x.md",
  text: "### Changed\n\n- The fragment.\n",
  mtimeMs: 100,
};

test("a fragment another lane left in changes/ never reaches this PR's body", () => {
  const logged: string[] = [];
  const body = landBody({
    args: { base: "beta" },
    branch: "agent/lane-x",
    summary: "the last commit",
    files: () => [FOREIGN, OWN],
    added: () => ["scripts/land.ts", "changes/agent-lane-x.md"],
    log: (line) => logged.push(line),
  });
  expect(body).toEqual({ text: "### Changed\n\n- The fragment.", explicit: false });
  expect(body.text).not.toContain("stranger");
  expect(logged).toEqual([
    "ignoring changes/agent-lane-someone-else.md: this branch's diff against origin/beta does not add it",
  ]);
});

test("with no fragment of its own the body lists the branch's commit subjects, never a stranger's note", () => {
  const logged: string[] = [];
  const body = landBody({
    args: { base: "beta" },
    branch: "agent/lane-x",
    summary: "the last commit",
    files: () => [FOREIGN],
    added: () => ["scripts/land.ts"],
    subjects: () => ["Add the resolver", "Test it"],
    log: (line) => logged.push(line),
  });
  expect(body.text).toBe("Changed on this branch:\n- Add the resolver\n- Test it");
  expect(body.text).not.toContain("stranger");
  expect(logged).toContain("ignoring changes/agent-lane-someone-else.md: this branch's diff against origin/beta does not add it");
  expect(logged).toContain("no changes/ fragment in this branch's diff; body lists its 2 commit subject(s)");
});

test("a blank body file falls back to the branch's own fragment and does not claim to be explicit", () => {
  const body = landBody({
    args: { base: "beta", bodyFile: ".scratch/empty.md" },
    branch: "agent/lane-x",
    summary: "the last commit",
    read: () => "  \n",
    files: () => [OWN],
    added: () => ["changes/agent-lane-x.md"],
  });
  expect(body).toEqual({ text: "### Changed\n\n- The fragment.", explicit: false });
});

test("with no fragment and no commits the one-line summary is the body", () => {
  const body = landBody({
    args: { base: "beta" },
    branch: "agent/lane-x",
    summary: " the last commit ",
    files: () => [],
    added: () => [],
    subjects: () => [],
  });
  expect(body).toEqual({ text: "the last commit", explicit: false });
});

/** A gh that answers from a script and records every call, so a landing can be replayed without GitHub. */
function scriptedGh(answers: { open?: { number: number; url: string }[]; body?: string; fail?: string }): {
  gh: Gh;
  calls: string[][];
} {
  const calls: string[][] = [];
  const gh: Gh = (args) => {
    calls.push(args);
    const joined = args.join(" ");
    if (answers.fail !== undefined && joined.startsWith(answers.fail)) {
      return { status: 1, stdout: "", stderr: `scripted ${answers.fail} failure` };
    }
    if (joined.startsWith("pr list")) {
      return { status: 0, stdout: JSON.stringify(answers.open ?? []), stderr: "" };
    }
    if (joined.startsWith("pr view")) {
      return { status: 0, stdout: JSON.stringify({ body: answers.body ?? "" }), stderr: "" };
    }
    if (joined.startsWith("pr create")) {
      return { status: 0, stdout: "https://github.com/Noisemaker111/JGengine/pull/4242\n", stderr: "" };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  return { gh, calls };
}

const noLog = (): void => {};

test("a reused PR has its stale body replaced with the explicit one", () => {
  const { gh, calls } = scriptedGh({ open: [{ number: 12, url: "https://example.test/12" }], body: "a stale body" });
  const pr = ensurePr({
    args: { base: "beta", bodyFile: ".scratch/body.md" },
    branch: "agent/lane-x",
    summary: "the last commit",
    body: { text: "the body I wrote", explicit: true },
    gh,
    log: noLog,
  });
  expect(pr).toEqual({ number: 12, url: "https://example.test/12" });
  expect(calls).toContainEqual(["pr", "view", "12", "--json", "body"]);
  expect(calls).toContainEqual(["pr", "edit", "12", "--body", "the body I wrote"]);
});

test("fragments are split by what the diff adds, not by which one is newest", () => {
  const split = ownFragments([FOREIGN, OWN], ["changes/agent-lane-x.md", "scripts/land.ts"]);
  expect(split.own.map((file) => file.path)).toEqual([OWN.path]);
  expect(split.ignored.map((file) => file.path)).toEqual([FOREIGN.path]);
  expect(ownFragments([FOREIGN], ["changes/README.md"])).toEqual({ own: [], ignored: [FOREIGN] });
  expect(subjectsBody([" one ", "", "two"])).toBe("Changed on this branch:\n- one\n- two");
  expect(subjectsBody([])).toBe("");
});

test("a reused PR keeps a body land was not given, and one that already matches is not rewritten", () => {
  const kept = scriptedGh({ open: [{ number: 13, url: "https://example.test/13" }], body: "a body someone wrote" });
  ensurePr({
    args: { base: "beta" },
    branch: "agent/lane-x",
    summary: "the last commit",
    body: { text: "### Changed\n\n- The fragment.\n", explicit: false },
    gh: kept.gh,
    log: noLog,
  });
  expect(kept.calls.some((call) => call[1] === "edit")).toBe(false);

  const same = scriptedGh({ open: [{ number: 14, url: "https://example.test/14" }], body: "the body I wrote\n" });
  ensurePr({
    args: { base: "beta", bodyFile: ".scratch/body.md" },
    branch: "agent/lane-x",
    summary: "the last commit",
    body: { text: "the body I wrote", explicit: true },
    gh: same.gh,
    log: noLog,
  });
  expect(same.calls.some((call) => call[1] === "edit")).toBe(false);
});

test("a body that cannot be written over the reused PR stops the landing", () => {
  const { gh } = scriptedGh({ open: [{ number: 15, url: "https://example.test/15" }], body: "stale", fail: "pr edit" });
  const pr = ensurePr({
    args: { base: "beta", bodyFile: ".scratch/body.md" },
    branch: "agent/lane-x",
    summary: "the last commit",
    body: { text: "the body I wrote", explicit: true },
    gh,
    log: noLog,
  });
  expect(pr).toBeNull();
});

test("opening a PR sends the explicit body rather than the fragment", () => {
  const { gh, calls } = scriptedGh({ open: [] });
  const pr = ensurePr({
    args: { base: "beta", title: "Menus", bodyFile: ".scratch/body.md" },
    branch: "agent/lane-x",
    summary: "the last commit",
    body: { text: "the body I wrote", explicit: true },
    gh,
    log: noLog,
  });
  expect(pr).toEqual({ number: 4242, url: "https://github.com/Noisemaker111/JGengine/pull/4242" });
  const create = calls.find((call) => call[1] === "create");
  expect(create).toEqual([
    "pr",
    "create",
    "--base",
    "beta",
    "--head",
    "agent/lane-x",
    "--title",
    "Menus",
    "--body",
    "the body I wrote",
  ]);
});

test("maps a green check list to no failures", () => {
  expect(
    checkVerdict([
      { name: "ci", state: "SUCCESS", bucket: "pass" },
      { name: "perf", state: "SKIPPED", bucket: "skipping" },
      { name: "smoke", state: "SUCCESS" },
    ]),
  ).toEqual({ failures: [], pending: [] });
});

test("names every failing check with its url and lists pending separately", () => {
  const verdict = checkVerdict([
    { name: "ci", state: "SUCCESS", bucket: "pass" },
    { name: "test (core-rest)", state: "FAILURE", bucket: "fail", link: "https://example.test/job/1" },
    { name: "quick", state: "CANCELLED" },
    { name: "perf", state: "PENDING", bucket: "pending" },
  ]);
  expect(verdict.failures).toEqual([
    { name: "test (core-rest)", url: "https://example.test/job/1" },
    { name: "quick", url: "" },
  ]);
  expect(verdict.pending).toEqual(["perf"]);
  expect(formatFailures(verdict.failures)).toEqual([
    "  test (core-rest) https://example.test/job/1",
    "  quick",
  ]);
});

test("a watch timeout with only pending checks blocks the merge", () => {
  const verdict = checkVerdict([{ name: "test (ui)", state: "IN_PROGRESS", bucket: "pending" }]);
  expect(verdict.failures).toEqual([]);
  expect(verdict.pending).toEqual(["test (ui)"]);
});

test("a cancelled check blocks the merge like a failure", () => {
  const verdict = checkVerdict([{ name: "test (sdk)", state: "CANCELLED", bucket: "cancel", link: "u" }]);
  expect(verdict.failures).toEqual([{ name: "test (sdk)", url: "u" }]);
  expect(verdict.pending).toEqual([]);
});

test("refuses main, the base branch and a dirty tree", () => {
  expect(landRefusal("main", "", "beta")).toContain("refusing to land main");
  expect(landRefusal("beta", "", "beta")).toContain("refusing to land beta");
  expect(landRefusal("agent/x", " M scripts/land.ts\n", "beta")).toContain("dirty tree");
  expect(landRefusal("agent/x", "  \n", "beta")).toBeNull();
});

const SCRATCH = join(import.meta.dir, "..", ".scratch");
const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function gitIn(cwd: string, args: string[]): Run {
  const result = Bun.spawnSync({
    cmd: ["git", "-c", "user.email=land@example.test", "-c", "user.name=Land", ...args],
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

/**
 * A bare origin, a work clone on `beta`, a partner clone that moves `beta` forward, and one
 * task branch. Everything lives in `.scratch`, so the fixture gate's own rule holds here too.
 */
function originWithBeta(): { bare: string; work: string; partner: string; base: string } {
  const root = join(SCRATCH, `land-${crypto.randomUUID()}`);
  made.push(root);
  mkdirSync(root, { recursive: true });
  const bare = join(root, "origin.git");
  const work = join(root, "work");
  const partner = join(root, "partner");
  gitOk(root, ["init", "-q", "--bare", "-b", "beta", bare]);
  gitOk(root, ["init", "-q", "-b", "beta", work]);
  commit(work, "shared.txt", "one\n", "base");
  gitOk(work, ["remote", "add", "origin", bare]);
  gitOk(work, ["push", "-q", "-u", "origin", "beta"]);
  gitOk(root, ["clone", "-q", bare, partner]);
  const base = gitOk(work, ["rev-parse", "HEAD"]);
  return { bare, work, partner, base };
}

test("a task branch pushed before beta moved is rebased and force-pushed instead of rejected", () => {
  const { bare, work, partner, base } = originWithBeta();

  gitOk(work, ["checkout", "-q", "-b", "agent/behind"]);
  commit(work, "task.txt", "task\n", "task work");
  gitOk(work, ["push", "-q", "-u", "origin", "agent/behind"]);

  commit(partner, "upstream.txt", "moved\n", "beta moves on");
  gitOk(partner, ["push", "-q", "origin", "beta"]);
  const movedBeta = gitOk(partner, ["rev-parse", "HEAD"]);
  expect(movedBeta).not.toBe(base);
  expect(gitOk(work, ["rev-list", "--count", "HEAD..origin/beta"])).toBe("0");

  const sync = syncOntoBase({ branch: "agent/behind", base: "beta", git: (args) => gitIn(work, args) });
  expect(sync).toEqual({ rebased: true, refusal: null });

  const remoteTip = gitOk(bare, ["rev-parse", "refs/heads/agent/behind"]);
  expect(remoteTip).toBe(gitOk(work, ["rev-parse", "HEAD"]));
  expect(gitIn(bare, ["merge-base", "--is-ancestor", movedBeta, remoteTip]).status).toBe(0);
  expect(gitIn(work, ["rev-list", "--count", "HEAD..origin/beta"]).stdout.trim()).toBe("0");
});

test("a branch land did not push is refused, and the remote copy is left alone", () => {
  const { bare, work, partner, base } = originWithBeta();

  gitOk(partner, ["checkout", "-q", "-b", "agent/foreign", "beta"]);
  commit(partner, "theirs.txt", "theirs\n", "someone else's commit");
  gitOk(partner, ["push", "-q", "-u", "origin", "agent/foreign"]);
  const untouched = gitOk(bare, ["rev-parse", "refs/heads/agent/foreign"]);

  gitOk(work, ["checkout", "-q", "-b", "agent/foreign", base]);
  commit(work, "mine.txt", "mine\n", "my commit on the same name");

  const sync = syncOntoBase({ branch: "agent/foreign", base: "beta", git: (args) => gitIn(work, args) });
  expect(sync.rebased).toBe(false);
  expect(sync.refusal).toContain("refuses to force-push a branch it did not push");
  expect(gitOk(bare, ["rev-parse", "refs/heads/agent/foreign"])).toBe(untouched);
});

test("the only force land uses is a lease on the branch it pushed", () => {
  expect(forcePushArgs("agent/lane-x")).toEqual(["push", "--force-with-lease=agent/lane-x", "origin", "HEAD:agent/lane-x"]);
});

function lockPathForTest(): string {
  const dir = join(SCRATCH, `lock-${crypto.randomUUID()}`);
  made.push(dir);
  mkdirSync(dir, { recursive: true });
  return join(dir, "land.lock");
}

/** A holder in its own OS process, the way a second landing is; it logs what it did to a file. */
function spawnHolder(options: { lock: string; branch: string; holdMs: number; crash?: boolean; delayMs?: number }) {
  const logFile = `${options.lock}.${options.branch.replace(/\W/g, "-")}.log`;
  const script = `
import { appendFileSync } from "node:fs";
const { acquireLock } = await import("./scripts/land.ts");
const at = (label) => appendFileSync(${JSON.stringify(logFile)}, label + " " + Date.now() + "\\n");
if (${options.delayMs ?? 0} > 0) await Bun.sleep(${options.delayMs ?? 0});
const release = acquireLock({ path: ${JSON.stringify(options.lock)}, branch: ${JSON.stringify(options.branch)}, log: (line) => at("LOG " + line) }).release;
at("HELD");
if (${options.crash === true}) process.exit(9);
await Bun.sleep(${options.holdMs});
release();
at("RELEASED");
`;
  const child = Bun.spawn({
    cmd: ["bun", "-e", script],
    cwd: join(import.meta.dir, ".."),
    stdout: "pipe",
    stderr: "pipe",
  });
  const events = (): string[] => {
    try {
      return readFileSync(logFile, "utf8").trim().split("\n").filter((line) => line.length > 0);
    } catch {
      return [];
    }
  };
  return {
    child,
    events,
    async waitFor(label: string): Promise<void> {
      for (let tries = 0; tries < 600 && !events().some((line) => line.startsWith(label)); tries += 1) {
        await Bun.sleep(25);
      }
      expect(events().some((line) => line.startsWith(label))).toBe(true);
    },
  };
}

test("a second landing waits on the first one's branch, then takes the lock", async () => {
  const lock = lockPathForTest();
  const first = spawnHolder({ lock, branch: "agent/first", holdMs: 1200 });
  await first.waitFor("HELD");

  const logged: string[] = [];
  const startedAt = Date.now();
  const held = acquireLock({ path: lock, branch: "agent/second", log: (line) => logged.push(line) });
  const waited = Date.now() - startedAt;
  held.release();

  expect(logged[0]).toContain("waiting on agent/first");
  expect(logged[0]).toContain(`pid ${first.child.pid}`);
  expect(waited).toBeGreaterThan(300);
  expect(held.wait?.holder).toBe("agent/first");
  expect(logged.at(-1)).toBe(`waited ${duration(held.wait?.waitedMs ?? 0)} for the lock (held by agent/first)`);

  await first.child.exited;
  expect(first.events()[0]).toStartWith("HELD");
  expect(first.events().at(-1)).toStartWith("RELEASED");
});

test("two landings launched together hold the lock one at a time, in start order", async () => {
  const lock = lockPathForTest();
  const first = spawnHolder({ lock, branch: "agent/one", holdMs: 700 });
  const second = spawnHolder({ lock, branch: "agent/two", holdMs: 0, delayMs: 300 });
  await first.child.exited;
  await second.child.exited;

  const labels = (events: string[]) => events.map((line) => line.split(" ")[0]);
  const heldAt = (events: string[]) => Number(events.find((line) => line.startsWith("HELD"))!.split(" ")[1]);
  const releasedAt = (events: string[]) => Number(events.find((line) => line.startsWith("RELEASED"))!.split(" ")[1]);

  expect(labels(first.events())).toEqual(["HELD", "RELEASED"]);
  expect(labels(second.events())).toEqual(["LOG", "LOG", "HELD", "RELEASED"]);
  expect(second.events()[0]).toContain("waiting on agent/one");
  expect(second.events()[1]).toContain("waited ");
  expect(second.events()[1]).toContain("for the lock (held by agent/one)");
  expect(heldAt(second.events())).toBeGreaterThanOrEqual(releasedAt(first.events()));
});

test("a landing killed while holding the lock does not wedge the next one", async () => {
  const lock = lockPathForTest();
  const crashed = spawnHolder({ lock, branch: "agent/crashed", holdMs: 0, crash: true });
  await crashed.child.exited;
  expect(crashed.events()[0]).toStartWith("HELD");
  expect(existsSync(lock)).toBe(true);

  const logged: string[] = [];
  acquireLock({ path: lock, branch: "agent/next", log: (line) => logged.push(line) }).release();

  expect(logged[0]).toContain("breaking a stale lock from agent/crashed");
  expect(logged[0]).toContain(`pid ${crashed.child.pid} is gone`);
  expect(existsSync(lock)).toBe(false);
});

test("a lock older than half an hour is broken even though its process still answers", () => {
  const lock = lockPathForTest();
  writeFileSync(
    lock,
    JSON.stringify({ branch: "agent/slow", pid: process.pid, startedAt: Date.now() - LOCK_STALE_MS - 1_000 }),
  );

  const logged: string[] = [];
  acquireLock({ path: lock, branch: "agent/fresh", log: (line) => logged.push(line) }).release();

  expect(logged[0]).toContain("breaking a stale lock from agent/slow");
  expect(logged[0]).toContain("older than 30 minutes");
  expect(existsSync(lock)).toBe(false);
});

test("a lock whose holder is alive and recent is left alone", () => {
  const now = Date.now();
  const held = { branch: "agent/live", pid: 42, startedAt: now - 1_000 };
  expect(staleReason(held, now, now, () => true)).toBeNull();
  expect(staleReason(held, now, now, () => false)).toBe("pid 42 is gone");
  expect(staleReason({ ...held, startedAt: now - LOCK_STALE_MS }, now, now, () => true)).toContain("older than");
  expect(staleReason(null, now - 10, now, () => true)).toBeNull();
  expect(staleReason(null, now - 60_000, now, () => true)).toBe("unreadable lock file");
  expect(parseLock('{"branch":"agent/x","pid":7,"startedAt":1}')).toEqual({ branch: "agent/x", pid: 7, startedAt: 1 });
  expect(parseLock("")).toBeNull();
  expect(parseLock('{"branch":"agent/x"}')).toBeNull();
});

test("the lock is released when the landing throws, and a lock land does not own is left alone", () => {
  const lock = lockPathForTest();
  expect(() =>
    landLocked({ path: lock, branch: "agent/boom" }, () => {
      throw new Error("landing exploded");
    }),
  ).toThrow("landing exploded");
  expect(existsSync(lock)).toBe(false);

  const logged: string[] = [];
  const held = acquireLock({ path: lock, branch: "agent/ours", log: (line) => logged.push(line) });
  writeFileSync(lock, JSON.stringify({ branch: "agent/other", pid: process.ppid, startedAt: Date.now() }));
  held.release();
  expect(logged.at(-1)).toContain("leaving it alone");
  expect(existsSync(lock)).toBe(true);
  expect(lockPath(join("repo", ".git"))).toBe(join("repo", ".git", "land.lock"));
});

test("the summary splits what a landing worked from what it lost queueing", () => {
  expect(duration(0)).toBe("0s");
  expect(duration(999)).toBe("<1s");
  expect(duration(42_000)).toBe("42s");
  expect(duration(150_000)).toBe("2m30s");
  expect(duration(3_900_000)).toBe("1h05m");

  expect(formatTiming(180_000, [])).toBe("worked 3m00s, waited 0s for the lock");
  expect(formatTiming(180_000, [{ holder: "agent/x", waitedMs: 42_000 }])).toBe(
    "worked 2m18s, waited 42s for the lock (held by agent/x)",
  );
  expect(
    formatTiming(180_000, [
      { holder: "agent/x", waitedMs: 30_000 },
      { holder: "agent/y", waitedMs: 12_000 },
    ]),
  ).toBe("worked 2m18s, waited 42s for the lock (2 waits, longest 30s held by agent/x)");
});

test("only a moved base, not a failing check, sends a merge back to rebase", () => {
  expect(baseMoved("the base branch was modified. Review and try the merge again.")).toBe(true);
  expect(baseMoved("Pull request #12 is not mergeable: the base branch requires that the pull request is up to date")).toBe(
    true,
  );
  expect(baseMoved("Pull request #12 is not mergeable: the merge commit cannot be cleanly created.")).toBe(true);
  expect(baseMoved("GraphQL: Pull request is not mergeable (mergePullRequest)")).toBe(false);
  expect(baseMoved("checks are still pending")).toBe(false);
});

/**
 * A landing driven end to end by `scripts/land.ts` itself, in its own process so two of them really
 * run at once: the fake GitHub answers PR calls, enforces "up to date" like branch protection, and
 * performs a real merge into the throwaway remote.
 */
const HARNESS = `
import { appendFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const cfg = JSON.parse(process.env.LAND_TEST_CONFIG);
const land = await import("./scripts/land.ts");
const at = (label) => appendFileSync(cfg.events, label + " " + Date.now() + "\\n");
const gitAt = (cwd) => (args) => {
  const r = spawnSync("git", ["-c", "user.email=land@example.test", "-c", "user.name=Land", ...args], { cwd, encoding: "utf8", timeout: 60_000 });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};
const lane = gitAt(cfg.clone);
const bare = gitAt(cfg.bare);
const server = gitAt(cfg.server);
const partner = cfg.moveBase === null ? null : gitAt(cfg.moveBase);
const ok = { status: 0, stdout: "", stderr: "" };
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
let created = false;
let moved = false;
const url = "https://example.test/" + cfg.number;
const gh = (args) => {
  const joined = args.join(" ");
  if (joined.startsWith("pr list")) return { status: 0, stdout: created ? JSON.stringify([{ number: cfg.number, url }]) : "[]", stderr: "" };
  if (joined.startsWith("pr create")) { created = true; return { status: 0, stdout: url + "\\n", stderr: "" }; }
  if (joined.startsWith("pr view") && joined.includes("body")) return { status: 0, stdout: JSON.stringify({ body: "" }), stderr: "" };
  if (joined.startsWith("pr view") && joined.includes("statusCheckRollup")) {
    return {
      status: 0,
      stdout: JSON.stringify({
        headRefOid: "head1",
        statusCheckRollup: [{ name: "ci", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: "https://example.test/actions/runs/1/job/2" }],
      }),
      stderr: "",
    };
  }
  if (joined.startsWith("pr view")) return { status: 0, stdout: JSON.stringify({ state: "MERGED", url }), stderr: "" };
  if (joined.startsWith("pr edit")) return ok;
  if (joined.startsWith("pr checks") && joined.includes("--watch")) return ok;
  if (joined.startsWith("pr checks")) return { status: 0, stdout: JSON.stringify([{ name: "ci", state: "SUCCESS", bucket: "pass" }]), stderr: "" };
  if (joined.startsWith("pr merge")) {
    at("MERGE-START");
    pause(cfg.mergeMs);
    const tip = bare(["rev-parse", "refs/heads/" + cfg.branch]).stdout.trim();
    const beta = bare(["rev-parse", "refs/heads/beta"]).stdout.trim();
    const upToDate = bare(["merge-base", "--is-ancestor", beta, tip]).status === 0;
    if (cfg.strictBase && !upToDate) {
      at("MERGE-END");
      return { status: 1, stdout: "", stderr: "the base branch was modified. Review and try the merge again." };
    }
    server(["fetch", "-q", "origin", cfg.branch, "beta"]);
    server(["checkout", "-q", "-B", "beta", "origin/beta"]);
    const merged = server(["merge", "-q", "--no-ff", "-m", "Merge " + cfg.branch, "origin/" + cfg.branch]);
    const pushed = merged.status === 0 ? server(["push", "-q", "origin", "beta"]) : merged;
    at("MERGE-END");
    return pushed;
  }
  return ok;
};
const waits = [];
at("SPAWNED");
if (cfg.startAt !== null) {
  const waitMs = cfg.startAt - Date.now();
  if (waitMs > 0) pause(waitMs);
}
at("START");
const code = land.landBranch({
  args: { base: "beta", commit: false, allow: [], verify: cfg.verify, watch: true },
  branch: cfg.branch,
  lock: cfg.lock,
  waits,
  io: {
    git: lane,
    gh,
    verify: () => cfg.verifyOk,
    watch: () => {
      at("WATCH-START");
      pause(cfg.watchMs);
      at("WATCH-END");
      if (partner !== null && !moved) {
        moved = true;
        partner(["pull", "-q", "--rebase", "origin", "beta"]);
        writeFileSync(cfg.moveBase + "/moved.txt", "moved\\n");
        partner(["add", "-A"]);
        partner(["commit", "-q", "-m", "beta moves on"]);
        partner(["push", "-q", "origin", "beta"]);
        at("BASE-MOVED");
      }
    },
    sleep: pause,
    log: (line) => at("LOG " + line),
    error: (line) => at("ERR " + line),
  },
});
at("END");
writeFileSync(cfg.out, JSON.stringify({ code, waits }));
`;

interface Lane {
  clone: string;
  branch: string;
}

interface TimelineEvent {
  label: string;
  at: number;
}

interface Landing {
  code: number;
  waits: LockWait[];
  events: TimelineEvent[];
  logs: string[];
  errors: string[];
  span: { start: number; end: number };
}

/** A bare origin, a clone that plays GitHub's merge, and one branch per lane. */
function landingRepo(names: readonly string[]): { bare: string; server: string; lanes: Lane[]; partner: string } {
  const { bare, work, partner } = originWithBeta();
  const home = dirname(work);
  const server = join(home, "server");
  gitOk(home, ["clone", "-q", bare, server]);
  const lanes = names.map((name) => {
    const clone = join(home, `lane-${name}`);
    gitOk(home, ["clone", "-q", "-b", "beta", bare, clone]);
    const branch = `agent/${name}`;
    gitOk(clone, ["checkout", "-q", "-b", branch]);
    commit(clone, `${name}.txt`, `${name}\n`, `${name} work`);
    return { clone, branch };
  });
  return { bare, server, lanes, partner };
}

function startLanding(options: {
  lane: Lane;
  bare: string;
  server: string;
  lock: string;
  number: number;
  watchMs: number;
  mergeMs?: number;
  strictBase?: boolean;
  moveBase?: string;
  verify?: string;
  verifyOk?: boolean;
  startAt?: number;
}): Promise<Landing> {
  const dir = join(SCRATCH, `run-${crypto.randomUUID()}`);
  made.push(dir);
  mkdirSync(dir, { recursive: true });
  const events = join(dir, "events.log");
  const out = join(dir, "out.json");
  const config = {
    clone: options.lane.clone,
    branch: options.lane.branch,
    bare: options.bare,
    server: options.server,
    lock: options.lock,
    number: options.number,
    watchMs: options.watchMs,
    mergeMs: options.mergeMs ?? 150,
    strictBase: options.strictBase ?? true,
    moveBase: options.moveBase ?? null,
    verify: options.verify ?? undefined,
    verifyOk: options.verifyOk ?? true,
    startAt: options.startAt ?? null,
    events,
    out,
  };
  const child = Bun.spawn({
    cmd: ["bun", "-e", HARNESS],
    cwd: join(import.meta.dir, ".."),
    env: { ...process.env, LAND_TEST_CONFIG: JSON.stringify(config) },
    stdout: "pipe",
    stderr: "pipe",
  });
  return (async () => {
    const status = await child.exited;
    const stderr = await new Response(child.stderr).text();
    const timeline = readFileSync(events, "utf8")
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        const space = line.lastIndexOf(" ");
        return { label: line.slice(0, space), at: Number(line.slice(space + 1)) };
      });
    if (!existsSync(out)) throw new Error(`landing ${options.lane.branch} exited ${status} without a result: ${stderr}`);
    const result = JSON.parse(readFileSync(out, "utf8")) as { code: number; waits: LockWait[] };
    const start = timeline.find((event) => event.label === "START")?.at ?? 0;
    const end = timeline.find((event) => event.label === "END")?.at ?? start;
    return {
      code: result.code,
      waits: result.waits,
      events: timeline,
      logs: timeline.filter((event) => event.label.startsWith("LOG ")).map((event) => event.label.slice(4)),
      errors: timeline.filter((event) => event.label.startsWith("ERR ")).map((event) => event.label.slice(4)),
      span: { start, end },
    };
  })();
}

function windows(timeline: readonly TimelineEvent[], start: string, end: string): { start: number; end: number }[] {
  const found: { start: number; end: number }[] = [];
  let open: number | null = null;
  for (const event of timeline) {
    if (event.label === start) open = event.at;
    else if (event.label === end && open !== null) {
      found.push({ start: open, end: event.at });
      open = null;
    }
  }
  return found;
}

function overlap(a: { start: number; end: number }, b: { start: number; end: number }): number {
  return Math.min(a.end, b.end) - Math.max(a.start, b.start);
}

function printLanding(label: string, landing: Landing): void {
  console.log(`${label} (exit ${landing.code}, ${landing.span.end - landing.span.start}ms):`);
  for (const line of landing.logs) console.log(`  land: ${line}`);
}

test("two landings watch their checks at once and only queue for the lock", async () => {
  const WATCH_MS = 3000;

  const soloRepo = landingRepo(["solo"]);
  const solo = await startLanding({
    lane: soloRepo.lanes[0]!,
    bare: soloRepo.bare,
    server: soloRepo.server,
    lock: join(dirname(soloRepo.lanes[0]!.clone), "land.lock"),
    number: 1,
    watchMs: WATCH_MS,
  });
  expect(solo.code).toBe(0);
  const soloWall = solo.span.end - solo.span.start;

  const pair = landingRepo(["a", "b"]);
  const lock = join(dirname(pair.lanes[0]!.clone), "land.lock");
  const startAt = Date.now() + 1500;
  const [a, b] = await Promise.all([
    startLanding({ lane: pair.lanes[0]!, bare: pair.bare, server: pair.server, lock, number: 2, watchMs: WATCH_MS, strictBase: false, startAt }),
    startLanding({ lane: pair.lanes[1]!, bare: pair.bare, server: pair.server, lock, number: 3, watchMs: WATCH_MS, strictBase: false, startAt }),
  ]);
  printLanding("landing a", a);
  printLanding("landing b", b);

  expect(a.code).toBe(0);
  expect(b.code).toBe(0);

  const [aWatch, bWatch] = [windows(a.events, "WATCH-START", "WATCH-END")[0]!, windows(b.events, "WATCH-START", "WATCH-END")[0]!];
  expect(overlap(aWatch, bWatch)).toBeGreaterThan(WATCH_MS / 3);

  const [aMerge, bMerge] = [windows(a.events, "MERGE-START", "MERGE-END")[0]!, windows(b.events, "MERGE-START", "MERGE-END")[0]!];
  expect(overlap(aMerge, bMerge)).toBeLessThanOrEqual(0);

  const [aWall, bWall] = [a.span.end - a.span.start, b.span.end - b.span.start];
  const together = Math.max(a.span.end, b.span.end) - Math.min(a.span.start, b.span.start);
  const serialised = aWall + bWall;
  console.log(
    `one landing ${soloWall}ms; landing a ${aWall}ms, landing b ${bWall}ms, together ${together}ms ` +
      `(end to end would be ${serialised}ms); watches overlapped ${overlap(aWatch, bWatch)}ms; ` +
      `merge windows overlapped ${overlap(aMerge, bMerge)}ms`,
  );
  expect(serialised - together).toBeGreaterThan(WATCH_MS / 2);
  expect(together).toBeLessThan(serialised * 0.8);

  expect(a.logs.some((line) => /^worked .+, waited .+ for the lock/.test(line))).toBe(true);
  expect(b.logs.some((line) => /^worked .+, waited .+ for the lock/.test(line))).toBe(true);
}, 120_000);

test("a landing that queues prints what it waited for, and its summary splits waited from worked", async () => {
  const repo = landingRepo(["queued"]);
  const lock = join(dirname(repo.lanes[0]!.clone), "land.lock");
  const holder = spawnHolder({ lock, branch: "agent/holder", holdMs: 1600 });
  await holder.waitFor("HELD");

  const landing = await startLanding({
    lane: repo.lanes[0]!,
    bare: repo.bare,
    server: repo.server,
    lock,
    number: 4,
    watchMs: 200,
  });
  printLanding("landing behind a holder", landing);

  expect(landing.code).toBe(0);
  expect(landing.logs).toContainEqual(expect.stringMatching(/^waited (\d+s|<1s) for the lock \(held by agent\/holder\)$/));
  expect(landing.waits.length).toBeGreaterThan(0);
  expect(landing.waits[0]!.holder).toBe("agent/holder");
  expect(landing.logs.at(-1)).toMatch(/^worked (\d+s|<1s), waited (\d+s|<1s) for the lock \(held by agent\/holder\)$/);
  await holder.child.exited;
}, 120_000);

test("a base that moves between the push and the merge is rebased, and the landing is not lost", async () => {
  const repo = landingRepo(["mover"]);
  const lock = join(dirname(repo.lanes[0]!.clone), "land.lock");
  const landing = await startLanding({
    lane: repo.lanes[0]!,
    bare: repo.bare,
    server: repo.server,
    lock,
    number: 5,
    watchMs: 200,
    moveBase: repo.partner,
  });
  printLanding("landing on a base that moved", landing);

  expect(landing.code).toBe(0);
  expect(landing.logs).toContainEqual(
    expect.stringMatching(new RegExp(`^merge refused because origin/beta moved .*attempt 2 of ${MERGE_ATTEMPTS}\\)$`)),
  );
  expect(windows(landing.events, "WATCH-START", "WATCH-END").length).toBe(2);
  expect(windows(landing.events, "MERGE-START", "MERGE-END").length).toBe(2);

  const beta = gitOk(repo.bare, ["rev-parse", "refs/heads/beta"]);
  const branchTip = gitOk(repo.bare, ["rev-parse", "refs/heads/agent/mover"]);
  const movedCommit = gitOk(repo.partner, ["rev-parse", "HEAD"]);
  expect(gitIn(repo.bare, ["merge-base", "--is-ancestor", branchTip, beta]).status).toBe(0);
  expect(gitIn(repo.bare, ["merge-base", "--is-ancestor", movedCommit, beta]).status).toBe(0);
  expect(gitOk(repo.bare, ["rev-parse", "refs/heads/agent/mover^"])).toBe(movedCommit);
}, 120_000);

test("a failed verify stops the landing before it merges", async () => {
  const repo = landingRepo(["unverified"]);
  const landing = await startLanding({
    lane: repo.lanes[0]!,
    bare: repo.bare,
    server: repo.server,
    lock: join(dirname(repo.lanes[0]!.clone), "land.lock"),
    number: 6,
    watchMs: 200,
    verify: "the-command",
    verifyOk: false,
  });

  expect(landing.code).toBe(EXIT_VERIFY_FAILED);
  expect(landing.logs).toContain("verify the-command");
  expect(landing.logs[0]).toContain("--watch is deprecated");
  expect(landing.errors).toContain("verify failed: the-command");
  expect(windows(landing.events, "MERGE-START", "MERGE-END").length).toBe(0);
}, 120_000);

/** Git for a hand-off: the push, the fetch and a branch already on top of the base. */
function scriptedGit(answers: { behind?: string } = {}): { git: (args: string[]) => Run; calls: string[][] } {
  const calls: string[][] = [];
  const git = (args: string[]): Run => {
    calls.push(args);
    const joined = args.join(" ");
    if (joined.startsWith("rev-list")) return { status: 0, stdout: `${answers.behind ?? "0"}\n`, stderr: "" };
    if (joined.startsWith("log")) return { status: 0, stdout: "the commit subject\n", stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  return { git, calls };
}

const GREEN: RollupEntry[] = [{ name: "ci", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: "https://example.test/job/1" }];
const URL_4242 = "https://github.com/Noisemaker111/JGengine/pull/4242";

/** A rollup as GitHub sends it: one row per attempt, `startedAt` ordering the attempts. */
function rollupOf(
  entries: readonly { name: string; conclusion?: string; status?: string; startedAt?: string; url?: string }[],
): RollupEntry[] {
  return entries.map((entry) => ({
    name: entry.name,
    conclusion: entry.conclusion ?? null,
    status: entry.status ?? "COMPLETED",
    startedAt: entry.startedAt ?? null,
    detailsUrl: entry.url ?? "",
  }));
}

function handOffGh(options: { autoMerge?: Run; label?: Run; rollup?: RollupEntry[] } = {}): { gh: Gh; calls: string[][] } {
  const calls: string[][] = [];
  const gh: Gh = (args) => {
    calls.push(args);
    const joined = args.join(" ");
    if (joined.startsWith("pr list")) return { status: 0, stdout: "[]", stderr: "" };
    if (joined.startsWith("pr create")) return { status: 0, stdout: `${URL_4242}\n`, stderr: "" };
    if (joined.startsWith("pr view")) {
      return { status: 0, stdout: JSON.stringify({ headRefOid: "head1", statusCheckRollup: options.rollup ?? GREEN }), stderr: "" };
    }
    if (joined.startsWith("pr merge")) return options.autoMerge ?? { status: 0, stdout: "", stderr: "" };
    if (joined.startsWith("pr edit")) return options.label ?? { status: 0, stdout: "", stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  return { gh, calls };
}

/** An io whose watch and sleep ignite, so any polling on the default path fails the test loudly. */
function handOffIo(parts: { git: (args: string[]) => Run; gh: Gh; verifyOk?: boolean }): {
  io: LandIo;
  logs: string[];
  errors: string[];
} {
  const logs: string[] = [];
  const errors: string[] = [];
  const ignite = (what: string) => () => {
    throw new Error(`land must not ${what} before handing the PR over`);
  };
  return {
    io: {
      git: parts.git,
      gh: parts.gh,
      verify: () => parts.verifyOk ?? true,
      watch: ignite("watch checks"),
      sleep: ignite("sleep"),
      log: (line) => logs.push(line),
      error: (line) => errors.push(line),
    },
    logs,
    errors,
  };
}

test("land hands the PR over in one pass: no watch, no sleep, the URL and the status command", () => {
  const { git } = scriptedGit();
  const { gh, calls } = handOffGh();
  const { io, logs } = handOffIo({ git, gh });

  const code = landBranch({ args: { base: "beta", commit: false, allow: [], watch: false }, branch: "agent/lane-x", lock: lockPathForTest(), io });

  expect(code).toBe(EXIT_LANDED);
  expect(calls).toContainEqual(["pr", "merge", "4242", "--auto", "--merge"]);
  expect(logs).toContain(URL_4242);
  expect(logs).toContain("status: bun run ci:status --pr 4242");
  expect(logs).toContainEqual(expect.stringContaining("waiting: bun run land:queue"));
  expect(logs.at(-1)).toMatch(/^worked (\d+s|<1s), waited 0s for the lock$/);
  expect(handOffLines({ number: 7, url: "u" })[1]).toBe("status: bun run ci:status --pr 7");
});

test("an auto-merge the repo refuses labels the PR for the queue instead of failing the hand-off", () => {
  const { git } = scriptedGit();
  const { gh, calls } = handOffGh({ autoMerge: { status: 1, stdout: "", stderr: "auto-merge is not allowed here" } });
  const { io, logs } = handOffIo({ git, gh });

  const code = landBranch({ args: { base: "beta", commit: false, allow: [], watch: false }, branch: "agent/lane-x", lock: lockPathForTest(), io });

  expect(code).toBe(EXIT_LANDED);
  expect(calls).toContainEqual(["pr", "edit", "4242", "--add-label", QUEUE_LABEL]);
  expect(logs).toContain(`auto-merge unavailable (auto-merge is not allowed here); labelled the PR ${QUEUE_LABEL}`);
  expect(logs).toContain("status: bun run ci:status --pr 4242");
});

test("a base that moved before the hand-off is rebased and armed again, without watching", () => {
  const { git, calls } = scriptedGit();
  const { gh } = handOffGh();
  let attempts = 0;
  const arming: Gh = (args) => {
    const joined = args.join(" ");
    if (joined.startsWith("pr merge") && (attempts += 1) === 1) {
      return { status: 1, stdout: "", stderr: "the base branch was modified. Review and try the merge again." };
    }
    return gh(args);
  };
  const { io, logs } = handOffIo({ git, gh: arming });

  const code = landBranch({ args: { base: "beta", commit: false, allow: [], watch: false }, branch: "agent/lane-x", lock: lockPathForTest(), io });

  expect(code).toBe(EXIT_LANDED);
  expect(attempts).toBe(2);
  expect(logs).toContainEqual(expect.stringMatching(/^origin\/beta moved before the hand-off/));
  expect(calls.filter((call) => call.join(" ").startsWith("push -u origin HEAD")).length).toBe(2);
  expect(logs).toContain("status: bun run ci:status --pr 4242");
});

test("a cancelled attempt from a superseded run is not a failure: the pass on this commit stands", () => {
  // Two pulls of the same branch: the first suite passed, the second was cancelled when it was
  // superseded. Every name has a green attempt on this commit, so the PR is ready to hand over.
  const superseded = rollupOf([
    { name: "ci", conclusion: "SUCCESS", startedAt: "2026-10-24T04:12:44Z" },
    { name: "ci", conclusion: "CANCELLED", startedAt: "2026-10-24T04:17:03Z" },
    { name: "types", conclusion: "SUCCESS", startedAt: "2026-10-24T04:10:17Z" },
    { name: "types", conclusion: "CANCELLED", startedAt: "2026-10-24T04:15:15Z" },
  ]);
  const { gh, calls } = handOffGh({ rollup: superseded });
  const { io, logs, errors } = handOffIo({ git: scriptedGit().git, gh });

  const code = landBranch({ args: { base: "beta", commit: false, allow: [], watch: false }, branch: "agent/lane-x", lock: lockPathForTest(), io });

  expect(code).toBe(EXIT_LANDED);
  expect(errors).toEqual([]);
  expect(calls).toContainEqual(["pr", "merge", "4242", "--auto", "--merge"]);
  expect(logs).toContain(URL_4242);
});

test("an attempt on an older commit contributes nothing to this commit's verdict", () => {
  const stale = rollupOf([
    { name: "ci", conclusion: "CANCELLED", startedAt: "2026-10-24T04:00:00Z" },
    { name: "ci", conclusion: "SUCCESS", startedAt: "2026-10-24T04:12:44Z" },
  ]);
  const judged = judgeChecks(attemptsOf(stale), "head1");
  expect(judged).toEqual([
    { name: "ci", state: "SUCCESS", bucket: "pass", url: "", runId: null },
  ]);
  const older = judgeChecks(
    attemptsOf([
      { name: "ci", conclusion: "CANCELLED", headSha: "older1" },
      { name: "ci", conclusion: "SUCCESS", headSha: "head1" },
    ]),
    "head1",
  );
  expect(older.map((check) => check.bucket)).toEqual(["pass"]);
});

test("checks still running are reported as running, with how many and the run, never as failed", () => {
  const running = rollupOf([
    { name: "ci", conclusion: "SUCCESS", url: "https://example.test/actions/runs/700/job/1" },
    { name: "test (ui)", status: "IN_PROGRESS", url: "https://example.test/actions/runs/701/job/2" },
    { name: "types", status: "QUEUED", url: "https://example.test/actions/runs/701/job/3" },
  ]);
  const { gh, calls } = handOffGh({ rollup: running });
  const { io, logs, errors } = handOffIo({ git: scriptedGit().git, gh });

  const code = landBranch({ args: { base: "beta", commit: false, allow: [], watch: false }, branch: "agent/lane-x", lock: lockPathForTest(), io });

  expect(code).toBe(EXIT_LANDED);
  expect(errors).toEqual([]);
  expect(logs).toContain("checks still running: 2 of 3 (run 701); auto-merge waits for them");
  expect(calls.filter((call) => call[1] === "merge")).toContainEqual(["pr", "merge", "4242", "--auto", "--merge"]);
});

test("checks that already failed stop the hand-off, and a failed verify never arms anything", () => {
  const failing = rollupOf([{ name: "test (ui)", conclusion: "FAILURE", url: "https://example.test/job/9" }]);
  const failedChecks = handOffGh({ rollup: failing });
  const first = handOffIo({ git: scriptedGit().git, gh: failedChecks.gh });
  expect(
    landBranch({ args: { base: "beta", commit: false, allow: [], watch: false }, branch: "agent/lane-x", lock: lockPathForTest(), io: first.io }),
  ).toBe(EXIT_CHECKS_FAILED);
  expect(failedChecks.calls.some((call) => call[1] === "merge")).toBe(false);
  expect(first.errors).toContain("checks failed: test (ui)");
  expect(first.errors).toContain("  test (ui) https://example.test/job/9");

  const unverified = handOffGh();
  const second = handOffIo({ git: scriptedGit().git, gh: unverified.gh, verifyOk: false });
  expect(
    landBranch({
      args: { base: "beta", commit: false, allow: [], watch: false, verify: "bun run ship:preflight" },
      branch: "agent/lane-x",
      lock: lockPathForTest(),
      io: second.io,
    }),
  ).toBe(EXIT_VERIFY_FAILED);
  expect(unverified.calls.some((call) => call[1] === "merge")).toBe(false);
  expect(second.logs).toContain("verify bun run ship:preflight");
});
