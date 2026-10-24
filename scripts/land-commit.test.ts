import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  EXIT_LANDED,
  commitLane,
  fragmentBody,
  fragmentSubject,
  landBranch,
  parseArgs,
  refusalFor,
  type FragmentFile,
  type Gh,
  type GhCheck,
  type LandIo,
  type Run,
} from "./land";

const SCRATCH = join(import.meta.dir, "..", ".scratch");
const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function gitIn(cwd: string, args: string[]): Run {
  const result = Bun.spawnSync({
    cmd: ["git", "-c", "user.email=lane@example.test", "-c", "user.name=Lane", ...args],
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

/** A bare origin and a work clone on `beta`, inside `.scratch` so the fixture gate holds here too. */
function originWithBeta(): { bare: string; work: string } {
  const base = join(SCRATCH, `land-commit-${crypto.randomUUID()}`);
  made.push(base);
  mkdirSync(base, { recursive: true });
  const bare = join(base, "origin.git");
  const work = join(base, "work");
  gitOk(base, ["init", "-q", "--bare", "-b", "beta", bare]);
  gitOk(base, ["init", "-q", "-b", "beta", work]);
  writeFileSync(join(work, "shared.txt"), "one\n");
  gitOk(work, ["add", "-A"]);
  gitOk(work, ["commit", "-q", "-m", "base work"]);
  gitOk(work, ["remote", "add", "origin", bare]);
  gitOk(work, ["push", "-q", "-u", "origin", "beta"]);
  return { bare, work };
}

function fragmentsIn(dir: string): FragmentFile[] {
  const changes = join(dir, "changes");
  let names: string[];
  try {
    names = readdirSync(changes).filter((name) => name.endsWith(".md"));
  } catch {
    return [];
  }
  return names.map((name) => ({ path: join(changes, name), text: readFileSync(join(changes, name), "utf8"), mtimeMs: 1 }));
}

function commitIn(work: string, log: string[] = []) {
  return commitLane({
    base: "beta",
    branch: "agent/lane-x",
    git: (args) => gitIn(work, args),
    checkout: work,
    files: () => fragmentsIn(work),
    read: (path) => readFileSync(path, "utf8"),
    write: (path, text) => writeFileSync(path, text),
    log: (line) => log.push(line),
  });
}

test("the commit subject is the fragment's first bullet, and its body the bullets", () => {
  const text = "### Changed\n\n- The lane closes itself in one command.\n- It names its own status command.\n";
  expect(fragmentSubject(text)).toBe("The lane closes itself in one command.");
  expect(fragmentBody(text)).toBe("- The lane closes itself in one command.\n- It names its own status command.");
  expect(fragmentSubject("### Fixed\n\n- " + "x".repeat(140) + "\n")).toHaveLength(100);
  expect(fragmentSubject("### Fixed\n")).toBe("");
});

test("stages unstaged work, commits it with the branch's own fragment, and leaves a clean tree", () => {
  const { work } = originWithBeta();
  gitOk(work, ["checkout", "-q", "-b", "agent/lane-x"]);
  mkdirSync(join(work, "changes"), { recursive: true });
  writeFileSync(join(work, "changes", "agent-lane-x.md"), "### Changed\n\n- The lane closes itself.\n");
  writeFileSync(join(work, "shared.txt"), "one\ntwo\n");

  const log: string[] = [];
  const outcome = commitIn(work, log);

  expect(outcome.kind).toBe("committed");
  expect(outcome.fragment).toBe("changes/agent-lane-x.md");
  expect(outcome.subject).toBe("The lane closes itself.");
  expect(outcome.created).toBe(false);
  expect(gitOk(work, ["log", "-1", "--format=%s"])).toBe("The lane closes itself.");
  expect(gitOk(work, ["log", "-1", "--format=%b"])).toContain("- The lane closes itself.");
  expect(gitOk(work, ["status", "--porcelain"])).toBe("");
  expect(gitOk(work, ["show", "--name-only", "--format=", "HEAD"]).split("\n").sort()).toEqual([
    "changes/agent-lane-x.md",
    "shared.txt",
  ]);
  expect(log).toEqual(["staged 2 file(s): changes/agent-lane-x.md, shared.txt"]);
});

test("commits work that was already staged", () => {
  const { work } = originWithBeta();
  gitOk(work, ["checkout", "-q", "-b", "agent/lane-x"]);
  mkdirSync(join(work, "changes"), { recursive: true });
  writeFileSync(join(work, "changes", "agent-lane-x.md"), "### Added\n\n- Staged before the close.\n");
  writeFileSync(join(work, "shared.txt"), "one\nstaged\n");
  gitOk(work, ["add", "-A"]);

  const outcome = commitIn(work);

  expect(outcome.kind).toBe("committed");
  expect(outcome.subject).toBe("Staged before the close.");
  expect(gitOk(work, ["status", "--porcelain"])).toBe("");
});

test("nothing to commit is not a failure: the tree is left alone", () => {
  const { work } = originWithBeta();
  gitOk(work, ["checkout", "-q", "-b", "agent/lane-x"]);
  gitOk(work, ["commit", "-q", "--allow-empty", "-m", "already done"]);

  const outcome = commitIn(work);

  expect(outcome).toEqual({ kind: "clean" });
  expect(gitOk(work, ["log", "-1", "--format=%s"])).toBe("already done");
});

test("a fragment another lane left is not used; this branch writes its own from the commit summary", () => {
  const { work } = originWithBeta();
  mkdirSync(join(work, "changes"), { recursive: true });
  writeFileSync(join(work, "changes", "other-lane.md"), "### Added\n\n- Someone else's work.\n");
  gitOk(work, ["add", "-A"]);
  gitOk(work, ["commit", "-q", "-m", "someone else's note"]);
  gitOk(work, ["push", "-q", "origin", "beta"]);
  gitOk(work, ["checkout", "-q", "-b", "agent/lane-x"]);
  writeFileSync(join(work, "shared.txt"), "one\nmine\n");

  const log: string[] = [];
  const outcome = commitIn(work, log);

  expect(outcome.kind).toBe("committed");
  expect(outcome.created).toBe(true);
  expect(outcome.fragment).toBe("changes/agent-lane-x.md");
  expect(outcome.subject).toBe("someone else's note");
  expect(readFileSync(join(work, "changes", "agent-lane-x.md"), "utf8")).toBe(
    "### Changed\n\n- someone else's note\n",
  );
  expect(gitOk(work, ["log", "-1", "--format=%b"])).not.toContain("Someone else's work");
  expect(log).toContain("no changes/ fragment in this branch's diff; wrote agent-lane-x.md from the commit summary");
});

function scriptedGit(options: { status?: string; diff?: string; summary?: string } = {}): {
  git: (args: string[]) => Run;
  calls: string[][];
} {
  const calls: string[][] = [];
  let statuses = 0;
  const git = (args: string[]): Run => {
    calls.push(args);
    const joined = args.join(" ");
    if (joined === "status --porcelain") {
      statuses += 1;
      return { status: 0, stdout: statuses === 1 ? (options.status ?? "") : "", stderr: "" };
    }
    if (joined.startsWith("log -1")) return { status: 0, stdout: `${options.summary ?? "the summary"}\n`, stderr: "" };
    if (joined.startsWith("diff --name-only origin/beta...HEAD")) return { status: 0, stdout: options.diff ?? "", stderr: "" };
    if (joined.startsWith("rev-list")) return { status: 0, stdout: "0\n", stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  return { git, calls };
}

const GREEN: GhCheck[] = [{ name: "ci", state: "SUCCESS", bucket: "pass" }];
const PR_URL = "https://github.com/Noisemaker111/JGengine/pull/4242";

function scriptedGh(): { gh: Gh; calls: string[][] } {
  const calls: string[][] = [];
  const gh: Gh = (args) => {
    calls.push(args);
    const joined = args.join(" ");
    if (joined.startsWith("pr list")) return { status: 0, stdout: "[]", stderr: "" };
    if (joined.startsWith("pr create")) return { status: 0, stdout: `${PR_URL}\n`, stderr: "" };
    if (joined.startsWith("pr checks")) return { status: 0, stdout: JSON.stringify(GREEN), stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  return { gh, calls };
}

function handOffIo(git: (args: string[]) => Run, gh: Gh): { io: LandIo; logs: string[] } {
  const logs: string[] = [];
  const ignite = (what: string) => () => {
    throw new Error(`land must not ${what} before handing the PR over`);
  };
  return {
    logs,
    io: {
      git,
      gh,
      verify: () => true,
      watch: ignite("watch checks"),
      sleep: ignite("sleep"),
      log: (line) => logs.push(line),
      error: () => {},
    },
  };
}

const FRAGMENT = "### Changed\n\n- The lane closes itself in one command.\n";

test("land --commit commits with the branch fragment, then hands the PR over in the same run", () => {
  const { git, calls } = scriptedGit({ status: " M scripts/land.ts\n", diff: "changes/agent-lane-x.md\n" });
  const { gh, calls: ghCalls } = scriptedGh();
  const { io, logs } = handOffIo(git, gh);

  const code = landBranch({
    args: { base: "beta", commit: true, watch: false },
    branch: "agent/lane-x",
    lock: join(SCRATCH, `lock-${crypto.randomUUID()}.lock`),
    io,
    commitIo: { files: () => [{ path: "changes/agent-lane-x.md", text: FRAGMENT, mtimeMs: 1 }], read: () => FRAGMENT },
  });

  expect(code).toBe(EXIT_LANDED);
  expect(calls).toContainEqual(["add", "-A"]);
  expect(calls).toContainEqual(["commit", "-m", "The lane closes itself in one command.", "-m", "- The lane closes itself in one command."]);
  expect(calls.some((call) => call.join(" ").startsWith("push -u origin HEAD"))).toBe(true);
  expect(ghCalls).toContainEqual(["pr", "merge", "4242", "--auto", "--merge"]);
  expect(logs).toContain("committed The lane closes itself in one command. (changes/agent-lane-x.md)");
  expect(logs).toContain(PR_URL);
  expect(logs).toContain("status: bun run ci:status --pr 4242");
});

test("land --commit with nothing to commit lands what the branch already has", () => {
  const { git, calls } = scriptedGit();
  const { gh } = scriptedGh();
  const { io, logs } = handOffIo(git, gh);

  const code = landBranch({
    args: { base: "beta", commit: true, watch: false },
    branch: "agent/lane-x",
    lock: join(SCRATCH, `lock-${crypto.randomUUID()}.lock`),
    io,
  });

  expect(code).toBe(EXIT_LANDED);
  expect(calls.some((call) => call[0] === "commit")).toBe(false);
  expect(calls.some((call) => call[0] === "add")).toBe(false);
  expect(logs).toContain("nothing to commit; landing what the branch already has");
  expect(logs).toContain("status: bun run ci:status --pr 4242");
});

test("a failed commit stops the landing before anything is pushed", () => {
  const { git, calls } = scriptedGit({ status: " M shared.txt\n" });
  const { gh, calls: ghCalls } = scriptedGh();
  const { io } = handOffIo(git, gh);
  const failing = (args: string[]): Run =>
    args[0] === "commit" ? { status: 1, stdout: "", stderr: "nothing added to commit" } : git(args);

  const code = landBranch({
    args: { base: "beta", commit: true, watch: false },
    branch: "agent/lane-x",
    lock: join(SCRATCH, `lock-${crypto.randomUUID()}.lock`),
    io: { ...io, git: failing },
    commitIo: { files: () => [], write: () => {} },
  });

  expect(code).toBe(3);
  expect(calls.some((call) => call.join(" ").startsWith("push"))).toBe(false);
  expect(ghCalls.length).toBe(0);
});

test("--commit skips the dirty-tree refusal that stops a plain landing", () => {
  const dirty = " M scripts/land.ts\n";
  expect(refusalFor({ base: "beta", commit: false, watch: false }, "agent/x", dirty)).toContain("dirty tree");
  expect(refusalFor({ base: "beta", commit: true, watch: false }, "agent/x", dirty)).toBeNull();
  expect(refusalFor({ base: "beta", commit: true, watch: false }, "beta", dirty)).toContain("refusing to land beta");
  expect(parseArgs(["--commit"])).toEqual({ base: "beta", commit: true, watch: false });
});
