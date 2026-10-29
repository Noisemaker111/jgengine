// A rebase whose only conflicts are generated files is not a conflict: both sides changed a file
// that a command writes from source, so the answer is to run that command on the merged source.
// Two lanes that each added an export both touched `api.md` and the export manifest, and each such
// landing used to stop and ask the lane to merge generated text by hand.
//
// During `git rebase`, `--ours` is the base being rebased onto and `--theirs` is the lane's commit.
// A generated file takes the base's copy while the rebase runs and is regenerated once at the end;
// a change note (`changes/<branch>.md`) is the lane's own, so it keeps the lane's copy.
import type { Run } from "./land";
import { GEN_TARGETS } from "./run-stages";

/**
 * Files a generator writes; `bun run gen` rewrites every one. Read from the gen table itself: a
 * hand-kept copy here missed skill-routing.json and the type-escape baseline, so those conflicted
 * on every rebase two lanes shared.
 */
export const GENERATED_PATHS: readonly RegExp[] = GEN_TARGETS.flatMap((target) => target.outputs ?? []);

/** Files only the lane writes, so a conflict there keeps the lane's side. */
export const LANE_OWNED_PATHS: readonly RegExp[] = [/^changes\/[^/]+\.md$/];

/** The commands that rewrite `GENERATED_PATHS` from source, in order. */
export const REGENERATE: readonly (readonly string[])[] = [["bun", "run", "gen"]];

export const REGENERATED_SUBJECT = "Regenerate generated files after rebasing";

export function isGenerated(path: string): boolean {
  return GENERATED_PATHS.some((pattern) => pattern.test(path));
}

export function isLaneOwned(path: string): boolean {
  return LANE_OWNED_PATHS.some((pattern) => pattern.test(path));
}

export interface GeneratedRebase {
  /** The rebase finished (possibly after resolving generated files). */
  ok: boolean;
  /** Files that conflicted and are not generated: the lane's to resolve. Empty when `ok`. */
  conflicts: string[];
  /** Generated files whose conflict was resolved, so the caller regenerates. */
  regenerate: string[];
  /** The failing step's output when `ok` is false. */
  detail: string;
}

const lines = (text: string): string[] =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

/**
 * `git rebase <onto>`, resolving conflicts in generated and lane-owned files as it goes. A real
 * conflict aborts the rebase and is returned. The caller regenerates when `regenerate` is non-empty.
 */
export function rebaseResolvingGenerated(git: (args: string[]) => Run, onto: string): GeneratedRebase {
  let step = git(["rebase", onto]);
  const regenerated = new Set<string>();
  // One pass per replayed commit at most; the bound only stops a rebase that never progresses.
  for (let pass = 0; step.status !== 0 && pass < 500; pass += 1) {
    const conflicted = lines(git(["diff", "--name-only", "--diff-filter=U"]).stdout);
    if (conflicted.length === 0) {
      // A commit whose only change was a generated file is empty once that file takes the base's
      // copy; the regeneration at the end restores what it would have written.
      if (/nothing to commit|no changes|empty/i.test(`${step.stdout}\n${step.stderr}`) && regenerated.size > 0) {
        step = git(["rebase", "--skip"]);
        continue;
      }
      git(["rebase", "--abort"]);
      return { ok: false, conflicts: [], regenerate: [], detail: (step.stderr || step.stdout).trim() };
    }
    const real = conflicted.filter((path) => !isGenerated(path) && !isLaneOwned(path));
    if (real.length > 0) {
      git(["rebase", "--abort"]);
      return { ok: false, conflicts: real, regenerate: [], detail: (step.stderr || step.stdout).trim() };
    }
    for (const path of conflicted) {
      git(["checkout", isGenerated(path) ? "--ours" : "--theirs", "--", path]);
      if (isGenerated(path)) regenerated.add(path);
    }
    git(["add", "--", ...conflicted]);
    step = git(["-c", "core.editor=true", "rebase", "--continue"]);
  }
  if (step.status !== 0) {
    git(["rebase", "--abort"]);
    return { ok: false, conflicts: [], regenerate: [], detail: (step.stderr || step.stdout).trim() };
  }
  return { ok: true, conflicts: [], regenerate: [...regenerated].sort(), detail: "" };
}

/**
 * Whether a rebase that just finished must be followed by `bun run gen`: a generated file
 * conflicted, or the branch carries a generated file of its own, which git may have merged line by
 * line with the base's into text no generator writes (a CI drift failure after a clean rebase).
 */
export function needsRegenerate(rebase: GeneratedRebase, branchPaths: readonly string[]): boolean {
  return rebase.regenerate.length > 0 || branchPaths.some(isGenerated);
}

/**
 * Run the generators on the rebased tree and commit what they rewrote, so the branch carries
 * generated files that match its merged source. Returns why it failed, or null.
 */
export function regenerateAndCommit(git: (args: string[]) => Run, exec: (command: readonly string[]) => Run): string | null {
  for (const command of REGENERATE) {
    const ran = exec(command);
    if (ran.status !== 0) return `\`${command.join(" ")}\` failed after the rebase: ${lines(ran.stderr || ran.stdout).slice(-5).join("\n")}`;
  }
  const changed = lines(git(["diff", "--name-only", "HEAD"]).stdout).filter(isGenerated);
  if (changed.length === 0) return null;
  const added = git(["add", "--", ...changed]);
  if (added.status !== 0) return `git add failed: ${(added.stderr || added.stdout).trim()}`;
  const committed = git(["commit", "-q", "-m", REGENERATED_SUBJECT]);
  if (committed.status !== 0) return `commit of the regenerated files failed: ${(committed.stderr || committed.stdout).trim()}`;
  return null;
}
