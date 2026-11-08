import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  EXIT_COULD_NOT_MERGE,
  EXIT_LANDED,
  EXIT_VERIFY_FAILED,
  LOCK_STALE_MS,
  acquireLock,
  baseMoved,
  chooseBody,
  duration,
  ensurePr,
  forcePushArgs,
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
  runAt,
  staleReason,
  ownFragments,
  mergeVerified,
  MERGE_ATTEMPTS,
  commitsBody,
  noteLines,
  syncOntoBase,
  retryServerErrors,
} from "./land";
import type { FragmentFile, LandIo, LockWait, Run } from "./land";
import { attemptsOf, judgeChecks } from "./ci-status";
import type { RollupEntry } from "./ci-status";
import { fakeGitHub, type FakeCall, type FakeCheck, type FakeGitHub } from "./github.fixture";
import { OUTAGE_ATTEMPTS } from "./github";

test("a command printing more than Node's 1 MiB default comes back whole, as `git show` of a big api.md does", () => {
  const size = 3 * 1024 * 1024;
  const out = runAt(process.cwd(), process.execPath, ["-e", `process.stdout.write("x".repeat(${size}))`]);
  expect(out.status).toBe(0);
  expect(out.stdout.length).toBe(size);
});

test("parses flags with values and defaults the base to beta", () => {
  expect(parseArgs([])).toEqual({ base: "beta", commit: false, allow: [], messages: [] });
  expect(parseArgs(["--verify", "bun run preflight"])).toEqual({
    base: "beta",
    verify: "bun run preflight",
    commit: false,
    allow: [],
    messages: [],
  });
  expect(parseArgs(["--title", "Menus", "--body-file", ".scratch/body.md", "--base", "beta"])).toEqual({
    base: "beta",
    title: "Menus",
    bodyFile: ".scratch/body.md",
    commit: false,
    allow: [],
    messages: [],
  });
  expect(parseArgs(["--commit"]).commit).toBe(true);
  expect(parseArgs(["-m", "Wolves hunt", "--message", "Fixed: dens"]).messages).toEqual(["Wolves hunt", "Fixed: dens"]);
  expect(() => parseArgs(["-m"])).toThrow("-m needs a value");
});

test("noteLines turns whole commit messages into note lines: subject, body lines unbulleted, trailers dropped", () => {
  expect(
    noteLines(["Carry the body\n\n- Subjects alone said what.\n* The body says why.\n\nCloses #12\n\nCo-Authored-By: Claude <noreply@anthropic.com>", "Second commit"]),
  ).toEqual(["Carry the body", "Subjects alone said what.", "The body says why.", "Closes #12", "Second commit"]);
  expect(noteLines([])).toEqual([]);
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
  expect(logged).toEqual([]);

  // Naming the skipped notes is --verbose detail.
  const before = process.env["JG_VERBOSE"];
  process.env["JG_VERBOSE"] = "1";
  try {
    landBody({
      args: { base: "beta" },
      branch: "agent/lane-x",
      summary: "the last commit",
      files: () => [FOREIGN, OWN],
      added: () => ["scripts/land.ts", "changes/agent-lane-x.md"],
      log: (line) => logged.push(line),
    });
  } finally {
    if (before === undefined) delete process.env["JG_VERBOSE"];
    else process.env["JG_VERBOSE"] = before;
  }
  expect(logged).toEqual([
    "ignoring changes/agent-lane-someone-else.md: this branch's diff against origin/beta does not add it",
  ]);
});

test("with no fragment of its own the body carries the branch's commit messages, bodies included, never a stranger's note", () => {
  const logged: string[] = [];
  const body = landBody({
    args: { base: "beta" },
    branch: "agent/lane-x",
    summary: "the last commit",
    files: () => [FOREIGN],
    added: () => ["scripts/land.ts"],
    commits: () => ["Add the resolver\n\nIt reads the manifest first.\nOld callers keep working.", "Test it"],
    log: (line) => logged.push(line),
  });
  expect(body.text).toBe(
    "Changed on this branch:\n- Add the resolver\n\n  It reads the manifest first.\n  Old callers keep working.\n- Test it",
  );
  expect(body.text).not.toContain("stranger");
  expect(logged).toContain("no changes/ fragment in this branch's diff; body carries its 2 commit message(s)");
});

test("a note this run rewrote from -m replaces a reused PR's body; a kept note does not", () => {
  const options = {
    branch: "agent/lane-x",
    summary: "the last commit",
    files: () => [OWN],
    added: () => ["changes/agent-lane-x.md"],
  };
  expect(landBody({ ...options, args: { base: "beta", messages: ["The fragment."] } }).explicit).toBe(true);
  expect(landBody({ ...options, args: { base: "beta", messages: [] } }).explicit).toBe(false);
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
    commits: () => [],
  });
  expect(body).toEqual({ text: "the last commit", explicit: false });
});

const LAND_REPO = "Noisemaker111/JGengine";

/** GitHub with one open PR on agent/lane-x per entry, so a landing can be replayed without GitHub. */
function prApi(open: { number: number; body?: string; title?: string }[], fail?: (call: FakeCall) => string | undefined) {
  return fakeGitHub({
    repo: LAND_REPO,
    pulls: open.map((pr) => ({ number: pr.number, head: "agent/lane-x", body: pr.body ?? "", title: pr.title ?? "" })),
    ...(fail === undefined ? {} : { fail }),
  });
}

const edits = (api: FakeGitHub): FakeCall[] => api.calls.filter((call) => call.method === "PATCH");

const noLog = (): void => {};

test("a reused PR has its stale body and title replaced with the explicit ones", () => {
  const api = prApi([{ number: 12, body: "a stale body", title: "the first run's title" }]);
  const pr = ensurePr({
    args: { base: "beta", bodyFile: ".scratch/body.md" },
    branch: "agent/lane-x",
    summary: "the last commit",
    body: { text: "the body I wrote", explicit: true },
    github: api.github,
    log: noLog,
  });
  expect(pr).toEqual({ number: 12, url: `https://github.com/${LAND_REPO}/pull/12` });
  expect(edits(api)).toEqual([
    { method: "PATCH", path: `repos/${LAND_REPO}/pulls/12`, fields: { title: "the last commit", body: "the body I wrote" } },
  ]);
});

test("a re-close with -m retitles the reused PR from the new note, and a matching title is left alone", () => {
  const stale = prApi([{ number: 16, body: "the note", title: "old subject" }]);
  ensurePr({
    args: { base: "beta" },
    branch: "agent/lane-x",
    summary: "new subject",
    body: { text: "the note", explicit: true },
    github: stale.github,
    log: noLog,
  });
  expect(edits(stale).map((call) => call.fields)).toEqual([{ title: "new subject" }]);

  const same = prApi([{ number: 17, body: "the note", title: "new subject" }]);
  ensurePr({ args: { base: "beta" }, branch: "agent/lane-x", summary: "new subject", body: { text: "the note", explicit: true }, github: same.github, log: noLog });
  expect(edits(same)).toEqual([]);

  // A body land was not given leaves the title alone too.
  const kept = prApi([{ number: 18, body: "someone's body", title: "someone's title" }]);
  ensurePr({ args: { base: "beta" }, branch: "agent/lane-x", summary: "new subject", body: { text: "x", explicit: false, bends: "" }, github: kept.github, log: noLog });
  expect(edits(kept).some((call) => call.fields["title"] !== undefined)).toBe(false);
});

test("fragments are split by what the diff adds, not by which one is newest", () => {
  const split = ownFragments([FOREIGN, OWN], ["changes/agent-lane-x.md", "scripts/land.ts"]);
  expect(split.own.map((file) => file.path)).toEqual([OWN.path]);
  expect(split.ignored.map((file) => file.path)).toEqual([FOREIGN.path]);
  expect(ownFragments([FOREIGN], ["changes/README.md"])).toEqual({ own: [], ignored: [FOREIGN] });
  expect(commitsBody([" one ", "", "two"])).toBe("Changed on this branch:\n- one\n- two");
  expect(commitsBody(["one\n\nwhy one\n"])).toBe("Changed on this branch:\n- one\n\n  why one");
  expect(commitsBody([])).toBe("");
});

test("a reused PR keeps a body land was not given, and one that already matches is not rewritten", () => {
  const kept = prApi([{ number: 13, body: "a body someone wrote" }]);
  ensurePr({
    args: { base: "beta" },
    branch: "agent/lane-x",
    summary: "the last commit",
    body: { text: "### Changed\n\n- The fragment.\n", explicit: false },
    github: kept.github,
    log: noLog,
  });
  expect(edits(kept)).toEqual([]);

  const same = prApi([{ number: 14, body: "the body I wrote\n", title: "the last commit" }]);
  ensurePr({
    args: { base: "beta", bodyFile: ".scratch/body.md" },
    branch: "agent/lane-x",
    summary: "the last commit",
    body: { text: "the body I wrote", explicit: true },
    github: same.github,
    log: noLog,
  });
  expect(edits(same)).toEqual([]);
});

test("a body that cannot be written over the reused PR stops the landing", () => {
  const api = prApi([{ number: 15, body: "stale" }], (call) => (call.method === "PATCH" ? "HTTP 422: Validation Failed" : undefined));
  const pr = ensurePr({
    args: { base: "beta", bodyFile: ".scratch/body.md" },
    branch: "agent/lane-x",
    summary: "the last commit",
    body: { text: "the body I wrote", explicit: true },
    github: api.github,
    log: noLog,
  });
  expect(pr).toBeNull();
});

test("opening a PR sends the explicit body rather than the fragment, over REST", () => {
  const api = prApi([]);
  const pr = ensurePr({
    args: { base: "beta", title: "Menus", bodyFile: ".scratch/body.md" },
    branch: "agent/lane-x",
    summary: "the last commit",
    body: { text: "the body I wrote", explicit: true },
    github: api.github,
    log: noLog,
  });
  expect(pr).toEqual({ number: 1, url: `https://github.com/${LAND_REPO}/pull/1` });
  expect(api.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
    `GET repos/${LAND_REPO}/pulls?state=open&per_page=30&head=${encodeURIComponent("Noisemaker111:agent/lane-x")}&base=beta`,
    `POST repos/${LAND_REPO}/pulls`,
  ]);
  expect(api.calls[1]?.fields).toEqual({ base: "beta", head: "agent/lane-x", title: "Menus", body: "the body I wrote" });
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

test("a task branch behind a beta that moved without a conflict is pushed as it is: no rebase, the merge brings beta in", () => {
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
  // A git before 2.38 cannot test a merge and rebases as land did before (boat's machines, 8 Nov).
  if (gitIn(work, ["merge-tree", "--write-tree", "--quiet", "HEAD", "HEAD"]).status !== 0) {
    expect(sync).toEqual({ rebased: true, refusal: null });
    return;
  }
  expect(sync).toEqual({ rebased: false, refusal: null });

  const remoteTip = gitOk(bare, ["rev-parse", "refs/heads/agent/behind"]);
  expect(remoteTip).toBe(gitOk(work, ["rev-parse", "HEAD"]));
  expect(gitIn(bare, ["merge-base", "--is-ancestor", movedBeta, remoteTip]).status).toBe(1);
});

test("a rebase that conflicts only in generated files and the lane's change note resolves them and regenerates", () => {
  const { bare, work, partner } = originWithBeta();
  mkdirSync(join(work, "scripts"), { recursive: true });
  mkdirSync(join(work, "changes"), { recursive: true });
  commit(work, "scripts/export-manifest.json", '{"exports":["a"]}\n', "manifest");
  gitOk(work, ["push", "-q", "origin", "beta"]);
  gitOk(partner, ["pull", "-q", "origin", "beta"]);

  gitOk(work, ["checkout", "-q", "-b", "agent/gen"]);
  writeFileSync(join(work, "lane.ts"), "export const lane = 1;\n");
  writeFileSync(join(work, "scripts/export-manifest.json"), '{"exports":["a","lane"]}\n');
  writeFileSync(join(work, "changes/agent-gen.md"), "### Added\n\n- Lane.\n");
  gitOk(work, ["add", "-A"]);
  gitOk(work, ["commit", "-q", "-m", "lane work"]);
  gitOk(work, ["push", "-q", "-u", "origin", "agent/gen"]);

  mkdirSync(join(partner, "scripts"), { recursive: true });
  mkdirSync(join(partner, "changes"), { recursive: true });
  writeFileSync(join(partner, "other.ts"), "export const other = 1;\n");
  writeFileSync(join(partner, "scripts/export-manifest.json"), '{"exports":["a","other"]}\n');
  writeFileSync(join(partner, "changes/agent-gen.md"), "### Added\n\n- Someone else's note.\n");
  gitOk(partner, ["add", "-A"]);
  gitOk(partner, ["commit", "-q", "-m", "another PR lands"]);
  gitOk(partner, ["push", "-q", "origin", "beta"]);

  const ran: string[] = [];
  const sync = syncOntoBase({
    branch: "agent/gen",
    base: "beta",
    git: (args) => gitIn(work, args),
    exec: (command) => {
      ran.push(command.join(" "));
      // The generator writes the manifest from the merged source.
      if (command.join(" ") === "bun run gen") writeFileSync(join(work, "scripts/export-manifest.json"), '{"exports":["a","lane","other"]}\n');
      return { status: 0, stdout: "", stderr: "" };
    },
  });
  expect(sync).toEqual({ rebased: true, refusal: null });
  expect(ran).toEqual(["bun run gen"]);
  expect(readFileSync(join(work, "scripts/export-manifest.json"), "utf8")).toBe('{"exports":["a","lane","other"]}\n');
  expect(readFileSync(join(work, "changes/agent-gen.md"), "utf8")).toContain("- Lane.");
  expect(gitOk(work, ["log", "-1", "--format=%s"])).toBe("Regenerate generated files after rebasing");
  expect(gitOk(work, ["status", "--porcelain", "--untracked-files=no"])).toBe("");
  expect(gitOk(bare, ["rev-parse", "refs/heads/agent/gen"])).toBe(gitOk(work, ["rev-parse", "HEAD"]));
}, 120_000);

test("a conflict in source is still the lane's, named, and the branch is left as it was", () => {
  const { work, partner } = originWithBeta();
  gitOk(work, ["checkout", "-q", "-b", "agent/real"]);
  commit(work, "shared.txt", "mine\n", "lane edits shared");
  gitOk(work, ["push", "-q", "-u", "origin", "agent/real"]);
  const before = gitOk(work, ["rev-parse", "HEAD"]);
  commit(partner, "shared.txt", "theirs\n", "beta edits shared");
  gitOk(partner, ["push", "-q", "origin", "beta"]);

  const sync = syncOntoBase({ branch: "agent/real", base: "beta", git: (args) => gitIn(work, args), exec: () => ({ status: 0, stdout: "", stderr: "" }) });
  expect(sync.rebased).toBe(false);
  expect(sync.refusal).toContain("conflict in shared.txt");
  expect(gitOk(work, ["rev-parse", "HEAD"])).toBe(before);
}, 120_000);

test("two Fernwild lanes from one old beta, each adding a proof, a probe field, a PLAN tick and a rescore, land back to back with no hand rebase", () => {
  const { bare, work, partner } = originWithBeta();
  const real = (file: string): string => readFileSync(join(import.meta.dir, "..", "games/fernwild", file), "utf8");
  const files = ["proofs/suite-report.json", "PLAN.md", "README.md", "src/game.config.ts"];
  mkdirSync(join(work, "games/fernwild/proofs"), { recursive: true });
  mkdirSync(join(work, "games/fernwild/src"), { recursive: true });
  for (const file of files) writeFileSync(join(work, "games/fernwild", file), real(file));
  gitOk(work, ["add", "-A"]);
  gitOk(work, ["commit", "-q", "-m", "fernwild as beta has it"]);
  gitOk(work, ["push", "-q", "origin", "beta"]);
  const oldBeta = gitOk(work, ["rev-parse", "HEAD"]);
  gitOk(partner, ["fetch", "-q", "origin"]);

  // What one real Fernwild lane changes: a proof row (and a content row) in the report, the generated score in
  // README and PLAN, a ticked milestone at the end of PLAN, and a probe field and its import in game.config.ts.
  const lane = (dir: string, name: string): void => {
    gitOk(dir, ["checkout", "-q", "-b", `agent/${name}`, oldBeta]);
    const at = (file: string) => join(dir, "games/fernwild", file);
    const report = JSON.parse(readFileSync(at("proofs/suite-report.json"), "utf8")) as { proofs: { file: string }[]; data: { id: string; ok: boolean; problems: string[] }[] };
    report.proofs.push({ file: `proofs/sim/zz-${name}.proof.ts`, proves: [`lane.${name}`], ok: true } as { file: string });
    report.data.push({ id: `content.${name}`, ok: true, problems: [] });
    writeFileSync(at("proofs/suite-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    const rescore = (text: string) => text.replace(/(<!-- suite-score[^\n]*-->\n)[\s\S]*?(<!-- \/suite-score -->)/, `$1Rescored by ${name}.\n$2`);
    writeFileSync(at("README.md"), rescore(readFileSync(at("README.md"), "utf8")));
    writeFileSync(at("PLAN.md"), `${rescore(readFileSync(at("PLAN.md"), "utf8")).trimEnd()}\n- [x] ${name}: a milestone this lane ticked\n`);
    const config = readFileSync(at("src/game.config.ts"), "utf8")
      .replace('} from "./world";\n', `} from "./world";\nimport {\n  ${name}Probe,\n} from "./game/${name}";\n`)
      .replace(/(\n\s*stones: ctx[^\n]*\n)/, `$1        ${name}: ${name}Probe(ctx),\n`);
    writeFileSync(at("src/game.config.ts"), config);
    gitOk(dir, ["add", "-A"]);
    gitOk(dir, ["commit", "-q", "-m", `Fernwild: ${name}`]);
  };
  const close = (dir: string, name: string) => {
    const sync = syncOntoBase({ branch: `agent/${name}`, base: "beta", git: (args) => gitIn(dir, args), exec: () => ({ status: 0, stdout: "", stderr: "" }) });
    expect(sync.refusal).toBeNull();
    // GitHub's merge: the pushed head goes onto beta.
    gitOk(dir, ["push", "-q", "origin", `agent/${name}:beta`]);
    return sync;
  };

  lane(partner, "dossier");
  lane(work, "tranqs");
  expect(close(partner, "dossier").rebased).toBe(false);
  expect(close(work, "tranqs").rebased).toBe(true);

  const landed = (file: string) => gitOk(bare, ["show", `beta:games/fernwild/${file}`]);
  for (const file of files) expect(landed(file)).not.toMatch(/^(<<<<<<<|>>>>>>>|\|\|\|\|\|\|\|)/m);
  const report = JSON.parse(landed("proofs/suite-report.json")) as { proofs: { file: string }[]; data: { id: string }[] };
  expect(report.proofs.map((proof) => proof.file).slice(-2)).toEqual(["proofs/sim/zz-dossier.proof.ts", "proofs/sim/zz-tranqs.proof.ts"]);
  expect(report.data.map((row) => row.id).slice(-2)).toEqual(["content.dossier", "content.tranqs"]);
  expect(landed("PLAN.md")).toMatch(/- \[x\] dossier: [^\n]*\n- \[x\] tranqs: /);
  expect(landed("src/game.config.ts")).toMatch(/import \{\n  dossierProbe,\n\} from "\.\/game\/dossier";\nimport \{\n  tranqsProbe,\n\}/);
  expect(landed("src/game.config.ts")).toMatch(/dossier: dossierProbe\(ctx\),\n\s*tranqs: tranqsProbe\(ctx\),/);
}, 120_000);

test("two lanes from one old beta, each adding a game-flow command and a Fernwild feature through game.config.ts, land back to back with no hand rebase", () => {
  const { bare, work, partner } = originWithBeta();
  const repo = join(import.meta.dir, "..");
  const files = ["packages/core/src/game/gameFlow.ts", "packages/core/src/game/gameFlow.test.ts", "games/fernwild/src/game.config.ts"];
  for (const file of files) {
    mkdirSync(dirname(join(work, file)), { recursive: true });
    writeFileSync(join(work, file), readFileSync(join(repo, file), "utf8"));
  }
  gitOk(work, ["add", "-A"]);
  gitOk(work, ["commit", "-q", "-m", "game flow and fernwild as beta has them"]);
  gitOk(work, ["push", "-q", "origin", "beta"]);
  const oldBeta = gitOk(work, ["rev-parse", "HEAD"]);
  gitOk(partner, ["fetch", "-q", "origin"]);

  // Each insertion must find its anchor, so a layout change that moves one fails here instead of passing vacuously.
  const insert = (text: string, anchor: string, added: string, before = false): string => {
    expect(text).toContain(anchor);
    return text.replace(anchor, before ? `${added}${anchor}` : `${anchor}${added}`);
  };
  // What the lanes that stopped on Nov 7-8 changed, each at the same spot as the other lane: a game-flow command
  // and its name in the test's list (#3064's replay: save/continue against settings.rebind), and in game.config.ts
  // a name added to an existing import (BROOD_TIERS beside BROOD_PHASES; wildLevelNear beside speciesNear), a new
  // import, a prompt source, a system and a probe field.
  const lane = (dir: string, name: string): void => {
    gitOk(dir, ["checkout", "-q", "-b", `agent/${name}`, oldBeta]);
    const edit = (file: string, change: (text: string) => string) => writeFileSync(join(dir, file), change(readFileSync(join(dir, file), "utf8")));
    edit(files[0]!, (text) =>
      insert(
        text,
        "];\n\n/**\n * Title, play",
        `  // \`${name}\` does what the ${name} lane needed.\n  (ctx) =>\n    ctx.game.commands.define("${name}", {\n      apply(state) {\n        return state;\n      },\n    }),\n`,
        true,
      ),
    );
    edit(files[1]!, (text) => insert(text, '      "start",\n', `      "${name}",\n`));
    edit(files[2]!, (text) => {
      let config = insert(text, "  BROOD_TIERS,\n", `  ${name.toUpperCase()}_TIERS,\n`);
      config = insert(config, "  speciesNear,\n", `  ${name}Near,\n`);
      config = insert(config, '} from "./world";\n', `import {\n  ${name}Prompts,\n  ${name}System,\n} from "./game/${name}";\n`);
      config = insert(config, "      ...notePrompts(ctx),\n", `      ...${name}Prompts(ctx),\n`);
      config = insert(config, "    firstDay,\n", `    ${name}System,\n`);
      return insert(config, /\n(\s*stones: ctx[^\n]*\n)/.exec(config)?.[1] ?? "stones: ctx", `        ${name}: ${name}Near(ctx),\n`);
    });
    gitOk(dir, ["add", "-A"]);
    gitOk(dir, ["commit", "-q", "-m", `Feature: ${name}`]);
  };
  const close = (dir: string, name: string) => {
    const sync = syncOntoBase({ branch: `agent/${name}`, base: "beta", git: (args) => gitIn(dir, args), exec: () => ({ status: 0, stdout: "", stderr: "" }) });
    expect(sync.refusal).toBeNull();
    gitOk(dir, ["push", "-q", "origin", `agent/${name}:beta`]);
    return sync;
  };

  lane(partner, "rebind");
  lane(work, "resume");
  expect(close(partner, "rebind").rebased).toBe(false);
  expect(close(work, "resume").rebased).toBe(true);

  const landed = (file: string) => gitOk(bare, ["show", `beta:${file}`]);
  for (const file of files) {
    expect(landed(file)).not.toMatch(/^(<<<<<<<|>>>>>>>|\|\|\|\|\|\|\||=======$)/m);
    // A union that kept a shared opening or closing line once still contains every added line but no longer parses.
    expect(() => new Bun.Transpiler({ loader: "ts" }).transformSync(landed(file))).not.toThrow();
  }
  for (const name of ["rebind", "resume"]) {
    expect(landed(files[0]!)).toContain(`ctx.game.commands.define("${name}", {`);
    expect(landed(files[1]!)).toContain(`      "${name}",\n`);
    const config = landed(files[2]!);
    for (const line of [`  ${name.toUpperCase()}_TIERS,`, `  ${name}Near,`, `} from "./game/${name}";`, `      ...${name}Prompts(ctx),`, `    ${name}System,`, `        ${name}: ${name}Near(ctx),`]) {
      expect(config).toContain(`${line}\n`);
    }
  }
}, 120_000);

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

test("after land pushed and stopped on a source conflict the lane resolved, the next land rewrites its own push", () => {
  const { bare, work, partner } = originWithBeta();
  gitOk(work, ["checkout", "-q", "-b", "agent/again"]);
  commit(work, "shared.txt", "mine\n", "lane edits shared");
  commit(partner, "shared.txt", "theirs\n", "beta edits shared");
  gitOk(partner, ["push", "-q", "origin", "beta"]);
  const git = (args: string[]) => gitIn(work, args);
  const exec = () => ({ status: 0, stdout: "", stderr: "" });

  expect(syncOntoBase({ branch: "agent/again", base: "beta", git, exec }).refusal).toContain("conflict in shared.txt");
  // The lane rebases and resolves the conflict itself.
  gitIn(work, ["rebase", "origin/beta"]);
  writeFileSync(join(work, "shared.txt"), "both\n");
  gitOk(work, ["add", "shared.txt"]);
  gitOk(work, ["-c", "core.editor=true", "rebase", "--continue"]);

  expect(syncOntoBase({ branch: "agent/again", base: "beta", git, exec })).toEqual({ rebased: false, refusal: null });
  expect(gitOk(bare, ["rev-parse", "refs/heads/agent/again"])).toBe(gitOk(work, ["rev-parse", "HEAD"]));
}, 120_000);

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
/** `releaseOn`: hold until that file exists, so a test releases on an event instead of a timer. */
function spawnHolder(options: { lock: string; branch: string; holdMs: number; crash?: boolean; releaseOn?: string }) {
  const logFile = `${options.lock}.${options.branch.replace(/\W/g, "-")}.log`;
  const script = `
import { appendFileSync, existsSync } from "node:fs";
const { acquireLock } = await import("./scripts/land.ts");
const at = (label) => appendFileSync(${JSON.stringify(logFile)}, label + " " + Date.now() + "\\n");
const release = acquireLock({ path: ${JSON.stringify(options.lock)}, branch: ${JSON.stringify(options.branch)}, log: (line) => at("LOG " + line) }).release;
at("HELD");
if (${options.crash === true}) process.exit(9);
await Bun.sleep(${options.holdMs});
const releaseOn = ${JSON.stringify(options.releaseOn ?? null)};
while (releaseOn !== null && !existsSync(releaseOn)) await Bun.sleep(20);
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

test("a landing started while another holds the lock waits for it, then holds it alone", async () => {
  const lock = lockPathForTest();
  const releaseOn = `${lock}.release`;
  const first = spawnHolder({ lock, branch: "agent/one", holdMs: 0, releaseOn });
  // Started on the first's HELD, not after a delay: under load a process can take longer than any
  // fixed delay to reach the lock, and then the order this test checks was never set up.
  await first.waitFor("HELD");
  const second = spawnHolder({ lock, branch: "agent/two", holdMs: 0 });
  await second.waitFor("LOG");
  writeFileSync(releaseOn, "");
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
 * run at once against a real throwaway remote; the fake GitHub answers PR calls and marks when it is
 * opening the PR, so a test can see whether two openings overlapped.
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
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const done = { ok: true, value: null };
const url = "https://example.test/" + cfg.number;
const pull = { number: cfg.number, url, title: "", body: "", state: "OPEN", isDraft: false, isCrossRepository: false, headRefName: cfg.branch, headRefOid: "head1", baseRefName: "beta", updatedAt: null, mergeStateStatus: "CLEAN", labels: [] };
let created = false;
const github = {
  repo: "me/game",
  listPulls: () => ({ ok: true, value: created ? [pull] : [] }),
  pull: () => ({ ok: true, value: pull }),
  checks: () => ({ ok: true, value: [{ name: "ci", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: "https://example.test/actions/runs/1/job/2" }] }),
  createPull: () => {
    at("OPEN-START");
    pause(cfg.openMs);
    created = true;
    at("OPEN-END");
    return { ok: true, value: { number: cfg.number, url } };
  },
  editPull: () => done,
};
const waits = [];
at("START");
const code = land.landBranch({
  args: { base: "beta", commit: false, allow: [], messages: [], verify: cfg.verify },
  branch: cfg.branch,
  lock: cfg.lock,
  waits,
  io: {
    git: lane,
    github,
    verify: () => cfg.verifyOk,
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

/** A bare origin and one branch per lane. */
function landingRepo(names: readonly string[]): { lanes: Lane[] } {
  const { bare, work } = originWithBeta();
  const home = dirname(work);
  const lanes = names.map((name) => {
    const clone = join(home, `lane-${name}`);
    gitOk(home, ["clone", "-q", "-b", "beta", bare, clone]);
    const branch = `agent/${name}`;
    gitOk(clone, ["checkout", "-q", "-b", branch]);
    commit(clone, `${name}.txt`, `${name}\n`, `${name} work`);
    return { clone, branch };
  });
  return { lanes };
}

function runDir(): string {
  const dir = join(SCRATCH, `run-${crypto.randomUUID()}`);
  made.push(dir);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function startLanding(options: {
  lane: Lane;
  lock: string;
  number: number;
  openMs?: number;
  verify?: string;
  verifyOk?: boolean;
  dir?: string;
}): Promise<Landing> {
  const dir = options.dir ?? runDir();
  const events = join(dir, "events.log");
  const out = join(dir, "out.json");
  const config = {
    clone: options.lane.clone,
    branch: options.lane.branch,
    lock: options.lock,
    number: options.number,
    openMs: options.openMs ?? 150,
    verify: options.verify ?? undefined,
    verifyOk: options.verifyOk ?? true,
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

test("two landings at once both hand over, and the lock keeps their PR openings apart", async () => {
  const pair = landingRepo(["a", "b"]);
  const lock = join(dirname(pair.lanes[0]!.clone), "land.lock");
  const shared = { lock };
  const [a, b] = await Promise.all([
    startLanding({ ...shared, lane: pair.lanes[0]!, number: 2 }),
    startLanding({ ...shared, lane: pair.lanes[1]!, number: 3 }),
  ]);
  printLanding("landing a", a);
  printLanding("landing b", b);

  expect(a.code).toBe(0);
  expect(b.code).toBe(0);

  const [aOpen, bOpen] = [windows(a.events, "OPEN-START", "OPEN-END")[0]!, windows(b.events, "OPEN-START", "OPEN-END")[0]!];
  expect(overlap(aOpen, bOpen)).toBeLessThanOrEqual(0);

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
    lock,
    number: 4,
  });
  printLanding("landing behind a holder", landing);

  expect(landing.code).toBe(0);
  expect(landing.logs).toContainEqual(expect.stringMatching(/^waited (\d+s|<1s) for the lock \(held by agent\/holder\)$/));
  expect(landing.waits.length).toBeGreaterThan(0);
  expect(landing.waits[0]!.holder).toBe("agent/holder");
  expect(landing.logs.at(-1)).toMatch(/^worked (\d+s|<1s), waited (\d+s|<1s) for the lock \(held by agent\/holder\)$/);
  await holder.child.exited;
}, 120_000);

test("a failed verify stops the landing before it hands the PR over", async () => {
  const repo = landingRepo(["unverified"]);
  const landing = await startLanding({
    lane: repo.lanes[0]!,
    lock: join(dirname(repo.lanes[0]!.clone), "land.lock"),
    number: 6,
    verify: "the-command",
    verifyOk: false,
  });

  expect(landing.code).toBe(EXIT_VERIFY_FAILED);
  expect(landing.logs).toContain("verify the-command");
  expect(landing.errors).toContain("verify failed: the-command");
  expect(landing.logs).not.toContain("lane:close merges it once its verify:fast receipt covers this head");
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

const GREEN: FakeCheck[] = [{ name: "ci", url: "https://example.test/job/1" }];
const URL_4242 = `https://github.com/${LAND_REPO}/pull/4242`;

/** GitHub for a hand-off: no open PR yet, so land opens #4242, whose head commit carries `checks`. */
function handOffApi(options: { checks?: FakeCheck[]; fail?: (call: FakeCall) => string | undefined } = {}): FakeGitHub {
  return fakeGitHub({
    repo: LAND_REPO,
    nextNumber: 4242,
    checks: { "sha-4242": options.checks ?? GREEN },
    ...(options.fail === undefined ? {} : { fail: options.fail }),
  });
}

/** An io that records what a hand-off prints. */
function handOffIo(parts: { git: (args: string[]) => Run; github: FakeGitHub; verifyOk?: boolean }): {
  io: LandIo;
  logs: string[];
  errors: string[];
} {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    io: {
      git: parts.git,
      github: parts.github.github,
      verify: () => parts.verifyOk ?? true,
      log: (line) => logs.push(line),
      error: (line) => errors.push(line),
    },
    logs,
    errors,
  };
}

test("land hands the PR over in one pass: the URL and who merges it", () => {
  const { git } = scriptedGit();
  const api = handOffApi();
  const { io, logs } = handOffIo({ git, github: api });

  const code = landBranch({ args: { base: "beta", commit: false, allow: [], messages: [] }, branch: "agent/lane-x", lock: lockPathForTest(), io });

  expect(code).toBe(EXIT_LANDED);
  expect(api.pulls.get(4242)?.labels ?? []).toEqual([]);
  expect(logs).toContain(URL_4242);
  expect(logs).toContain("lane:close merges it once its verify:fast receipt covers this head");
  expect(logs.at(-1)).toMatch(/^worked (\d+s|<1s), waited 0s for the lock$/);
});

test("a hand-off takes one path: it opens the PR and never reads checks, labels or merges", () => {
  const api = handOffApi();
  const { io } = handOffIo({ git: scriptedGit().git, github: api });
  landBranch({ args: { base: "beta", commit: false, allow: [], messages: [] }, branch: "agent/lane-x", lock: lockPathForTest(), io });
  expect(api.calls.map((call) => `${call.method} ${call.path.split("?")[0]}`)).toEqual([
    `GET repos/${LAND_REPO}/pulls`,
    `POST repos/${LAND_REPO}/pulls`,
  ]);
});

test("a failed verify hands nothing over", () => {
  const unverified = handOffApi();
  const second = handOffIo({ git: scriptedGit().git, github: unverified, verifyOk: false });
  expect(
    landBranch({
      args: { base: "beta", commit: false, allow: [], messages: [], verify: "bun run preflight" },
      branch: "agent/lane-x",
      lock: lockPathForTest(),
      io: second.io,
    }),
  ).toBe(EXIT_VERIFY_FAILED);
  expect(second.logs).not.toContain("lane:close merges it once its verify:fast receipt covers this head");
  expect(unverified.calls.some((call) => call.path.endsWith("/merge"))).toBe(false);
  expect(second.logs).toContain("verify bun run preflight");
});

test("mergeVerified merges the head it was given, and retries only while another merge moves the base", () => {
  const api = fakeGitHub({ repo: LAND_REPO, nextNumber: 7 });
  const pauses: number[] = [];
  let refusals = 2;
  const github = {
    ...api.github,
    mergePull: (number: number, sha: string) =>
      refusals-- > 0 ? { ok: false as const, error: "HTTP 405: Base branch was modified. Review and try the merge again." } : { ok: true as const, value: { sha: `merge-of-${sha}-in-${number}` } },
  };
  const merged = mergeVerified(github, 7, "head1", (ms) => pauses.push(ms));
  expect(merged).toEqual({ ok: true, sha: "merge-of-head1-in-7" });
  expect(pauses).toEqual([3_000, 6_000]);

  const refused = mergeVerified(
    { ...api.github, mergePull: () => ({ ok: false as const, error: "HTTP 409: Head branch was modified" }) },
    7,
    "head1",
    (ms) => pauses.push(ms),
  );
  expect(refused).toEqual({ ok: false, error: "HTTP 409: Head branch was modified", baseMoved: false });
  expect(pauses).toHaveLength(2);

  let calls = 0;
  const stuck = mergeVerified(
    { ...api.github, mergePull: () => (calls++, { ok: false as const, error: "HTTP 405: Base branch was modified." }) },
    7,
    "head1",
    () => {},
  );
  expect(stuck.ok).toBe(false);
  expect(calls).toBe(MERGE_ATTEMPTS);
});

test("an attempt on an older commit contributes nothing to this commit's verdict", () => {
  const stale: RollupEntry[] = [
    { name: "ci", conclusion: "CANCELLED", status: "COMPLETED", startedAt: "2026-10-24T04:00:00Z", detailsUrl: "" },
    { name: "ci", conclusion: "SUCCESS", status: "COMPLETED", startedAt: "2026-10-24T04:12:44Z", detailsUrl: "" },
  ];
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

test("a reused PR keeps its body and gets the Bends section the diff now shows", () => {
  const api = prApi([{ number: 12, body: "Context.\n\n## Bends\n\nold" }]);
  const pr = ensurePr({
    args: { base: "beta" },
    branch: "agent/lane-x",
    summary: "the last commit",
    body: { text: "from the fragment", explicit: false, bends: "## Bends\n\n- test skipped: `a.test.ts` - test.skip" },
    github: api.github,
    log: noLog,
  });
  expect(pr).toEqual({ number: 12, url: `https://github.com/${LAND_REPO}/pull/12` });
  expect(edits(api).map((call) => call.fields)).toEqual([{ body: "Context.\n\n## Bends\n\n- test skipped: `a.test.ts` - test.skip\n" }]);
});

test("a git command GitHub answers with a server error runs again; any other failure returns at once", () => {
  const serverError: Run = { status: 1, stdout: "", stderr: "remote: Internal Server Error\n ! [remote rejected] HEAD -> agent/x (Internal Server Error)" };
  const rejected: Run = { status: 1, stdout: "", stderr: " ! [rejected] HEAD -> agent/x (fetch first)" };
  const answers = (list: Run[]) => {
    const calls: string[][] = [];
    return { calls, git: (args: string[]) => { calls.push(args); return list[calls.length - 1] ?? { status: 0, stdout: "", stderr: "" }; } };
  };
  const pauses: number[] = [];
  const blip = answers([serverError]);
  expect(retryServerErrors(blip.git, (ms) => pauses.push(ms))(["push"]).status).toBe(0);
  expect(blip.calls.length).toBe(2);
  expect(pauses.length).toBe(1);

  const down = answers(Array.from({ length: OUTAGE_ATTEMPTS }, () => serverError));
  expect(retryServerErrors(down.git, () => {})(["push"])).toEqual(serverError);
  expect(down.calls.length).toBe(OUTAGE_ATTEMPTS);

  const refused = answers([rejected]);
  expect(retryServerErrors(refused.git, () => {})(["push"])).toEqual(rejected);
  expect(refused.calls.length).toBe(1);
});
