import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";

import { keepBothInsertions, mergeSuiteReports, MERGE_FILE_ARGS, rebaseResolvingGenerated } from "./generated-rebase";
import type { Run } from "./land";
import { SUITE_SCORE_END, SUITE_SCORE_START } from "./suite-score-block";

// Each test runs real git repos; on a busy Windows PC a rebase test took 5-6 s and failed bun's 5 s default.
setDefaultTimeout(60_000);

const README = "games/demo/README.md";
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo(): { dir: string; git: (args: string[]) => Run } {
  const dir = mkdtempSync(join(tmpdir(), "gen-rebase-"));
  dirs.push(dir);
  const git = (args: string[]): Run => {
    const ran = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" });
    return { status: ran.status ?? 1, stdout: ran.stdout ?? "", stderr: ran.stderr ?? "" };
  };
  git(["init", "-q", "-b", "beta"]);
  return { dir, git };
}

const readme = (score: string, top: string, bottom: string): string =>
  ["# Demo", "", SUITE_SCORE_START, `Game suite: **${score}**`, SUITE_SCORE_END, "", top, "", "## Play", "", "Walk about.", "", bottom, ""].join("\n");

function commit(dir: string, git: (args: string[]) => Run, text: string, message: string): void {
  writeFileSync(join(dir, README), text);
  git(["add", "-A"]);
  expect(git(["commit", "-q", "-m", message]).status).toBe(0);
}

/** A base, beta moved on from it, and a lane branched from the base; returns the repo after the lane's commit. */
function lanes(betaText: string, laneText: string): { dir: string; git: (args: string[]) => Run } {
  const made = repo();
  const { dir, git } = made;
  spawnSync("mkdir", ["-p", join(dir, "games/demo")]);
  commit(dir, git, readme("10 / 20", "A game.", "End."), "base");
  git(["branch", "lane"]);
  commit(dir, git, betaText, "beta rescored");
  git(["checkout", "-q", "lane"]);
  commit(dir, git, laneText, "lane rescored");
  return made;
}

describe("rebaseResolvingGenerated", () => {
  test("two lanes rescoring a game conflict only in its suite-score block: the rebase keeps both hand edits and regenerates", () => {
    const { dir, git } = lanes(readme("11 / 20", "A game, by beta.", "End."), readme("12 / 20", "A game.", "End, by the lane."));
    const rebased = rebaseResolvingGenerated(git, "beta");
    expect(rebased).toEqual({ ok: true, conflicts: [], regenerate: [README], detail: "" });
    expect(readFileSync(join(dir, README), "utf8")).toBe(readme("11 / 20", "A game, by beta.", "End, by the lane."));
  });

  test("a hand edit right beside the block still merges", () => {
    const beside = (score: string, note: string) => readme(score, "A game.", "End.").replace(`${SUITE_SCORE_END}\n`, `${SUITE_SCORE_END}\n${note}\n`);
    const { dir, git } = lanes(beside("11 / 20", "Beta's note."), readme("12 / 20", "A game.", "End, by the lane."));
    expect(rebaseResolvingGenerated(git, "beta")).toEqual({ ok: true, conflicts: [], regenerate: [README], detail: "" });
    expect(readFileSync(join(dir, README), "utf8")).toBe(beside("11 / 20", "Beta's note.").replace("End.", "End, by the lane."));
  });

  test("a conflict that reaches the hand-written text stays the lane's to resolve", () => {
    const { git } = lanes(readme("11 / 20", "A game, by beta.", "End."), readme("12 / 20", "A game, by the lane.", "End."));
    const rebased = rebaseResolvingGenerated(git, "beta");
    expect(rebased.ok).toBe(false);
    expect(rebased.conflicts).toEqual([README]);
  });
});

/** `git merge-file -p` of three texts, in the style and with the labels the rebase uses. */
function mergeFile(ours: string, base: string, theirs: string): string {
  const dir = mkdtempSync(join(tmpdir(), "gen-rebase-merge-"));
  dirs.push(dir);
  const files = Object.entries({ ours, base, theirs }).map(([name, text]) => {
    writeFileSync(join(dir, name), text);
    return join(dir, name);
  });
  return spawnSync("git", ["merge-file", "-p", ...MERGE_FILE_ARGS, ...files], { encoding: "utf8" }).stdout;
}

describe("keepBothInsertions", () => {
  const probe = (fields: string[]) => ["probe: {", "  x: 1,", ...fields, "},", ""].join("\n");

  test("lines both sides appended at one place are both kept, the base's first", () => {
    const merged = mergeFile(probe(["  stones: 2,"]), probe([]), probe(["  arrows: 3,"]));
    expect(keepBothInsertions(merged)).toBe(probe(["  stones: 2,", "  arrows: 3,"]));
  });

  test("two added blocks that open and close with the same lines are both kept whole", () => {
    const imports = (added: string) => `import {\n  world,\n} from "./world";\n${added}\nexport {};\n`;
    const block = (name: string) => `import {\n  ${name},\n} from "./game/${name}";\n`;
    const merged = keepBothInsertions(mergeFile(imports(block("dossier")), imports(""), imports(block("tranqs"))));
    expect(merged).toBe(imports(`${block("dossier")}${block("tranqs")}`));
  });

  test("a lane that carries another lane's added lines and more keeps one copy of them", () => {
    const imports = (names: string[]) => ["import {", "  a,", ...names.map((name) => `  ${name},`), '} from "./creatures";', ""].join("\n");
    const merged = mergeFile(imports(["speciesNear"]), imports([]), imports(["speciesNear", "wildLevelNear"]));
    expect(keepBothInsertions(merged)).toBe(imports(["speciesNear", "wildLevelNear"]));
    const before = mergeFile(imports(["speciesNear"]), imports([]), imports(["wildLevelNear", "speciesNear"]));
    expect(keepBothInsertions(before)).toBe(imports(["wildLevelNear", "speciesNear"]));
  });

  test("a line both sides changed is a real conflict", () => {
    expect(keepBothInsertions(mergeFile(probe(["  y: 2,"]).replace("x: 1", "x: 2"), probe([]), probe([]).replace("x: 1", "x: 3")))).toBeNull();
  });

  test("text that only looks like a conflict marker is kept as text", () => {
    const heading = (extra: string) => `Title\n=======\n\n${extra}`;
    expect(keepBothInsertions(mergeFile(heading("- a\n"), heading(""), heading("- b\n")))).toBe(heading("- a\n- b\n"));
  });
});

describe("mergeSuiteReports", () => {
  const proof = (file: string, ok = true) => ({ file, proves: [file], ok });
  const report = (proofs: ReturnType<typeof proof>[], data: string[] = []) =>
    `${JSON.stringify({ game: "demo", proofs, data: data.map((id) => ({ id, ok: true, problems: [] })) }, null, 2)}\n`;

  test("each side keeps the proof rows it changed; rows stay sorted by file", () => {
    const base = report([proof("a"), proof("c", false), proof("gone")], ["d1"]);
    const ours = report([proof("a", false), proof("b"), proof("c", false)], ["d1", "d2"]);
    const theirs = report([proof("a"), proof("c"), proof("gone"), proof("z")], ["d1", "d3"]);
    expect(mergeSuiteReports({ base, ours, theirs })).toBe(report([proof("a", false), proof("b"), proof("c"), proof("z")], ["d1", "d2", "d3"]));
  });

  test("a row both sides changed takes the lane's run", () => {
    const ran = (ok: boolean, failure?: string) => ({ ...proof("a", ok), ...(failure === undefined ? {} : { failure }) });
    const merged = mergeSuiteReports({ base: report([proof("a", false)]), ours: report([ran(false, "beta's reason")]), theirs: report([ran(true)]) });
    expect(merged).toBe(report([proof("a")]));
  });

  test("a side that is not a suite report is not merged", () => {
    expect(mergeSuiteReports({ base: report([]), ours: "{", theirs: report([]) })).toBeNull();
  });
});
