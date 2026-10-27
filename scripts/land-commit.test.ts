import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { VERBOSE_ENV } from "./verbosity";
import {
  EXIT_LANDED,
  commitGuards,
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

function commitIn(work: string, log: string[] = [], messages: string[] = []) {
  return commitLane({
    messages,
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
  expect(log).toEqual(["committing 2 file(s)"]);
});

test("--verbose lists every path a clean commit takes", () => {
  const { work } = originWithBeta();
  gitOk(work, ["checkout", "-q", "-b", "agent/lane-x"]);
  mkdirSync(join(work, "changes"), { recursive: true });
  writeFileSync(join(work, "changes", "agent-lane-x.md"), "### Changed\n\n- The lane closes itself.\n");
  writeFileSync(join(work, "shared.txt"), "one\ntwo\n");

  const before = process.env[VERBOSE_ENV];
  process.env[VERBOSE_ENV] = "1";
  const log: string[] = [];
  try {
    commitIn(work, log);
  } finally {
    if (before === undefined) delete process.env[VERBOSE_ENV];
    else process.env[VERBOSE_ENV] = before;
  }
  expect(log).toEqual(["committing 2 file(s):", "  commit  changes/agent-lane-x.md", "  commit  shared.txt"]);
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

test("a re-close with new -m lines on a clean tree rewrites the note and commits it; the same lines again commit nothing", () => {
  const { work } = originWithBeta();
  gitOk(work, ["checkout", "-q", "-b", "agent/lane-x"]);
  writeFileSync(join(work, "shared.txt"), "one\nwork\n");
  expect(commitIn(work, [], ["First wording"]).kind).toBe("committed");
  expect(gitOk(work, ["status", "--porcelain"])).toBe("");

  const reworded = commitIn(work, [], ["Better wording"]);
  expect(reworded.kind).toBe("committed");
  expect(reworded.subject).toBe("Better wording");
  expect(readFileSync(join(work, "changes", "agent-lane-x.md"), "utf8")).toContain("- Better wording");

  expect(commitIn(work, [], ["Better wording"])).toEqual({ kind: "clean" });
  expect(gitOk(work, ["log", "-1", "--format=%s"])).toBe("Better wording");
});

test("a fragment another lane left is not used; this branch writes its own from its own commits", () => {
  const { work } = originWithBeta();
  mkdirSync(join(work, "changes"), { recursive: true });
  writeFileSync(join(work, "changes", "other-lane.md"), "### Added\n\n- Someone else's work.\n");
  gitOk(work, ["add", "-A"]);
  gitOk(work, ["commit", "-q", "-m", "someone else's note"]);
  gitOk(work, ["push", "-q", "origin", "beta"]);
  gitOk(work, ["checkout", "-q", "-b", "agent/lane-x"]);
  gitOk(work, ["commit", "-q", "--allow-empty", "-m", "my own work"]);
  writeFileSync(join(work, "shared.txt"), "one\nmine\n");

  const log: string[] = [];
  const outcome = commitIn(work, log);

  expect(outcome.kind).toBe("committed");
  expect(outcome.created).toBe(true);
  expect(outcome.fragment).toBe("changes/agent-lane-x.md");
  expect(outcome.subject).toBe("my own work");
  expect(readFileSync(join(work, "changes", "agent-lane-x.md"), "utf8")).toBe("my own work\n\n### Changed\n\n- my own work\n");
  expect(gitOk(work, ["log", "-1", "--format=%b"])).not.toContain("Someone else's work");
  expect(log).toContain("wrote agent-lane-x.md from the branch's commit messages");
});

test("the commit's body reaches the note it writes, so the PR body carries the why and its Closes line", () => {
  const { work } = originWithBeta();
  gitOk(work, ["checkout", "-q", "-b", "agent/lane-x"]);
  gitOk(work, [
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "Carry the body",
    "-m",
    "Subjects alone said what, never why.\n\nCloses #12\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
  ]);
  writeFileSync(join(work, "shared.txt"), "one\nmine\n");

  const outcome = commitIn(work);

  expect(outcome).toMatchObject({ kind: "committed", created: true, subject: "Carry the body" });
  expect(readFileSync(join(work, "changes", "agent-lane-x.md"), "utf8")).toBe(
    "Carry the body\n\nCloses #12\n\n### Changed\n\n- Carry the body\n- Subjects alone said what, never why.\n",
  );
});

test("-m writes the note: sections from prefixes, the API the diff added, the seam a game change leaned on", () => {
  const { work } = originWithBeta();
  const surface = (body: string) =>
    `<!-- GENERATED -->\n\n# jgengine-world — exported API surface\n\n## @jgengine/core/den/den\n\n${body}`;
  mkdirSync(join(work, ".claude", "skills", "jgengine-world"), { recursive: true });
  const api = join(work, ".claude", "skills", "jgengine-world", "api.md");
  writeFileSync(api, surface("- `oldDen` (function): function oldDen(): void — Old den.\n"));
  gitOk(work, ["add", "-A"]);
  gitOk(work, ["commit", "-q", "-m", "api"]);
  gitOk(work, ["push", "-q", "origin", "beta"]);
  gitOk(work, ["checkout", "-q", "-b", "agent/lane-x"]);
  writeFileSync(
    api,
    surface("- `denFor` (function): function denFor(id: string): Den — Find the den a pack sleeps in. Cheap.\n- `Den` (interface): interface Den — A den.\n"),
  );
  mkdirSync(join(work, "packages", "core", "src", "den"), { recursive: true });
  writeFileSync(join(work, "packages", "core", "src", "den", "den.ts"), "export const x = 1;\n");
  mkdirSync(join(work, "games", "wilds"), { recursive: true });
  writeFileSync(join(work, "games", "wilds", "pack.ts"), "export {};\n");

  const log: string[] = [];
  const outcome = commitIn(work, log, ["Wolves sleep in dens", "Fixed: a pack no longer splits at dusk"]);

  expect(outcome.kind).toBe("committed");
  expect(outcome.subject).toBe("Wolves sleep in dens");
  expect(readFileSync(join(work, "changes", "agent-lane-x.md"), "utf8")).toBe(
    [
      "Wolves sleep in dens",
      "",
      "Engine seam: packages/core/src/den/den.ts",
      "",
      "### Added",
      "",
      "- `denFor` (`@jgengine/core/den/den`): Find the den a pack sleeps in. Also `Den`.",
      "",
      "### Changed",
      "",
      "- Wolves sleep in dens",
      "",
      "### Fixed",
      "",
      "- a pack no longer splits at dusk",
      "",
      "### Removed",
      "",
      "- `@jgengine/core/den/den` no longer exports `oldDen`.",
      "",
    ].join("\n"),
  );
  expect(log).toContain("wrote agent-lane-x.md from the -m messages");
});

test("a second close keeps the note the first wrote; -m rewrites it", () => {
  const { work } = originWithBeta();
  gitOk(work, ["checkout", "-q", "-b", "agent/lane-x"]);
  writeFileSync(join(work, "shared.txt"), "one\nfirst\n");
  expect(commitIn(work, [], ["First words"]).kind).toBe("committed");

  writeFileSync(join(work, "shared.txt"), "one\nsecond\n");
  expect(commitIn(work).subject).toBe("First words");

  writeFileSync(join(work, "shared.txt"), "one\nthird\n");
  expect(commitIn(work, [], ["Better words"]).subject).toBe("Better words");
  expect(readFileSync(join(work, "changes", "agent-lane-x.md"), "utf8")).not.toContain("First words");
});

test("a lane with no commit, no fragment and no -m is refused, never given the base's merge subject", () => {
  const { work } = originWithBeta();
  gitOk(work, ["commit", "-q", "--allow-empty", "-m", "Merge pull request #1 from someone/else"]);
  gitOk(work, ["push", "-q", "origin", "beta"]);
  gitOk(work, ["checkout", "-q", "-b", "agent/lane-x"]);
  writeFileSync(join(work, "shared.txt"), "one\nmine\n");

  const log: string[] = [];
  const outcome = commitIn(work, log);

  expect(outcome.kind).toBe("failed");
  expect(existsSync(join(work, "changes", "agent-lane-x.md"))).toBe(false);
  expect(log.join("\n")).toContain('close again with -m "<what changed, in plain words>"');
  expect(gitOk(work, ["log", "-1", "--format=%s"])).toBe("Merge pull request #1 from someone/else");
});

function scriptedGit(options: {
  status?: string;
  diff?: string;
  summary?: string;
  staged?: readonly string[];
  added?: readonly string[];
  ignored?: readonly string[];
} = {}): {
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
    if (joined.startsWith("diff --name-only --cached")) {
      return { status: 0, stdout: (options.staged ?? []).map((path) => `${path}\n`).join(""), stderr: "" };
    }
    if (joined.startsWith("diff --name-status --cached --diff-filter=A")) {
      return { status: 0, stdout: (options.added ?? []).map((path) => `A\t${path}\n`).join(""), stderr: "" };
    }
    // Something is always staged by the time land asks: the scripted tree was dirty.
    if (joined === "diff --cached --quiet") return { status: 1, stdout: "", stderr: "" };
    if (joined.startsWith("check-ignore")) return { status: 0, stdout: (options.ignored ?? []).map((path) => `${path}\n`).join(""), stderr: "" };
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
    if (joined.startsWith("pr view")) {
      return { status: 0, stdout: JSON.stringify({ headRefOid: "head1", statusCheckRollup: GREEN }), stderr: "" };
    }
    if (joined.startsWith("pr checks")) return { status: 0, stdout: JSON.stringify(GREEN), stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  return { gh, calls };
}

function handOffIo(git: (args: string[]) => Run, gh: Gh): { io: LandIo; logs: string[]; errors: string[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    logs,
    errors,
    io: {
      git,
      gh,
      verify: () => true,
      log: (line) => logs.push(line),
      error: (line) => errors.push(line),
    },
  };
}

const FRAGMENT = "### Changed\n\n- The lane closes itself in one command.\n";

test("land --commit commits with the branch fragment, then hands the PR over in the same run", () => {
  const { git, calls } = scriptedGit({ status: " M scripts/land.ts\n", diff: "changes/agent-lane-x.md\n" });
  const { gh, calls: ghCalls } = scriptedGh();
  const { io, logs } = handOffIo(git, gh);

  const code = landBranch({
    args: { base: "beta", commit: true, allow: [], messages: [] },
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
    args: { base: "beta", commit: true, allow: [], messages: [] },
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
    args: { base: "beta", commit: true, allow: [], messages: [] },
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
  expect(refusalFor({ base: "beta", commit: false, allow: [], messages: [] }, "agent/x", dirty)).toContain("dirty tree");
  expect(refusalFor({ base: "beta", commit: true, allow: [], messages: [] }, "agent/x", dirty)).toBeNull();
  expect(refusalFor({ base: "beta", commit: true, allow: [], messages: [] }, "beta", dirty)).toContain("refusing to land beta");
  expect(parseArgs(["--commit"])).toEqual({ base: "beta", commit: true, allow: [], messages: [] });
});

test("a scratch artifact, an ignored path, a stray lockfile and a stranger's new fragment are refused", () => {
  const refused = commitGuards({
    staged: [".scratch-2038.txt", ".scratch/bg/x/out.log", "bun.lock", "changes/agent-lane-x.md", "scripts/land.ts"],
    added: ["changes/agent-lane-x.md"],
    ignored: [".scratch-2038.txt"],
    branch: "agent/lane-one-command",
  });

  expect(refused.map((entry) => entry.path)).toEqual([
    ".scratch-2038.txt",
    ".scratch/bg/x/out.log",
    "bun.lock",
    "changes/agent-lane-x.md",
  ]);
  const why = (path: string) => refused.find((entry) => entry.path === path)?.why ?? "";
  expect(why(".scratch-2038.txt")).toContain("git ignores this path");
  expect(why(".scratch/bg/x/out.log")).toContain("a run's own artifact");
  expect(why("bun.lock")).toContain("lockfile staged without its package.json manifest");
  expect(why("changes/agent-lane-x.md")).toContain("not part of agent/lane-one-command");
});

test("a lockfile with its manifest, a fragment named after the branch and an allowed path all pass", () => {
  expect(
    commitGuards({
      staged: ["bun.lock", "package.json", "changes/agent-lane-x.md", "scripts/land.ts"],
      added: ["changes/agent-lane-x.md"],
      ignored: [],
      branch: "agent/lane-x",
    }),
  ).toEqual([]);
  expect(
    commitGuards({
      staged: ["changes/lane-attribution.md"],
      added: ["changes/lane-attribution.md"],
      ignored: [],
      branch: "agent/lane-attribution",
    }),
  ).toEqual([]);
  expect(
    commitGuards({ staged: ["bun.lock"], added: [], ignored: [], branch: "agent/x", allow: ["bun.lock"] }),
  ).toEqual([]);
});

test("--commit prints every path it will commit, and refuses the whole set with its reasons", () => {
  const { git, calls } = scriptedGit({
    status: " M scripts/land.ts\n?? changes/agent-lane-x.md\n",
    staged: ["scripts/land.ts", "changes/agent-lane-x.md"],
    added: ["changes/agent-lane-x.md"],
  });
  const { gh, calls: ghCalls } = scriptedGh();
  const { io, logs, errors } = handOffIo(git, gh);

  const code = landBranch({
    args: { base: "beta", commit: true, allow: [], messages: [] },
    branch: "agent/lane-one-command",
    lock: join(SCRATCH, `lock-${crypto.randomUUID()}.lock`),
    io,
  });

  expect(code).toBe(3);
  expect(logs).toContain("committing 2 file(s):");
  expect(logs).toContain("  commit  scripts/land.ts");
  expect(logs).toContain("  refused changes/agent-lane-x.md");
  expect(errors).toContain(
    "land: refusing changes/agent-lane-x.md: a new changes/ fragment whose name is not part of agent/lane-one-command, so this lane did not write it",
  );
  expect(errors.join("\n")).toContain("bun run lane:close --allow <path>");
  expect(calls.some((call) => call[0] === "commit")).toBe(false);
  expect(calls.some((call) => call.join(" ").startsWith("push"))).toBe(false);
  expect(ghCalls.length).toBe(0);
});

test("--allow keeps one refused file on purpose", () => {
  const { git, calls } = scriptedGit({
    status: " M bun.lock\n?? changes/agent-lane-x.md\n",
    staged: ["bun.lock", "changes/agent-lane-x.md"],
    added: ["changes/agent-lane-x.md"],
    diff: "changes/agent-lane-x.md\n",
  });
  const { gh, calls: ghCalls } = scriptedGh();
  const { io } = handOffIo(git, gh);

  const code = landBranch({
    args: { base: "beta", commit: true, allow: ["bun.lock", "changes/agent-lane-x.md"], messages: [] },
    branch: "agent/lane-one-command",
    lock: join(SCRATCH, `lock-${crypto.randomUUID()}.lock`),
    io,
    commitIo: { files: () => [{ path: "changes/agent-lane-x.md", text: FRAGMENT, mtimeMs: 1 }], read: () => FRAGMENT },
  });

  expect(code).toBe(EXIT_LANDED);
  expect(calls.some((call) => call[0] === "commit")).toBe(true);
  expect(ghCalls).toContainEqual(["pr", "merge", "4242", "--auto", "--merge"]);
});
