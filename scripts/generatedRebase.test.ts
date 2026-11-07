import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";

import { rebaseResolvingGenerated } from "./generated-rebase";
import type { Run } from "./land";
import { SUITE_SCORE_END, SUITE_SCORE_START } from "./suite-score-block";

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
