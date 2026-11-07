// A rebase whose only conflicts are generated files is not a conflict: both sides changed a file
// that a command writes from source, so the answer is to run that command on the merged source.
// Two lanes that each added an export both touched `api.md` and the export manifest, and each such
// landing used to stop and ask the lane to merge generated text by hand.
//
// During `git rebase`, `--ours` is the base being rebased onto and `--theirs` is the lane's commit.
// A generated file takes the base's copy while the rebase runs and is regenerated once at the end;
// a change note (`changes/<branch>.md`) is the lane's own, so it keeps the lane's copy.
//
// A generator may own only a marked block of a hand-written file (each game's suite score in its
// README and PLAN). Two game lanes that each rescored their game conflict only inside that block; such
// a file keeps both sides' hand-written text, takes the base's block, and is regenerated too.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Run } from "./land";
import { GEN_TARGETS, type GeneratedBlock } from "./run-stages";

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

/** Generated blocks inside hand-written files, from the gen table. */
export const GENERATED_BLOCKS: readonly GeneratedBlock[] = GEN_TARGETS.flatMap((target) => target.blocks ?? []);

function blocksOf(path: string): GeneratedBlock[] {
  return GENERATED_BLOCKS.filter((block) => block.paths.test(path));
}

/** Whether a generator writes this file, whole or in a marked block. */
export function isRegenerated(path: string): boolean {
  return isGenerated(path) || blocksOf(path).length > 0;
}

/** Each generated block in the text, markers included, in order. */
function blocksIn(text: string, { start, end }: GeneratedBlock): { at: number; to: number }[] {
  const found: { at: number; to: number }[] = [];
  for (let from = 0; ; ) {
    const at = text.indexOf(start, from);
    if (at < 0) return found;
    const close = text.indexOf(end, at + start.length);
    if (close < 0) return found;
    found.push({ at, to: close + end.length });
    from = close + end.length;
  }
}

/** The text with each of its generated blocks replaced by `fill(block, index)`. */
function replaceBlocks(text: string, blocks: readonly GeneratedBlock[], fill: (block: GeneratedBlock, index: number) => string): string {
  let out = text;
  for (const block of blocks) {
    const found = blocksIn(out, block);
    for (let index = found.length - 1; index >= 0; index -= 1) out = out.slice(0, found[index]!.at) + fill(block, index) + out.slice(found[index]!.to);
  }
  return out;
}

/** The three sides of a conflicted file: the commits' common ancestor, the base rebased onto, and the lane's commit. */
export interface ConflictStages {
  base: string;
  ours: string;
  theirs: string;
}

/**
 * The resolved text of a conflicted file in which a generator owns marked blocks: the hand-written text merged
 * three ways with every block emptied, then the base's blocks put back for the regeneration to rewrite. Null when
 * the hand-written text itself conflicts (`merge` returns null), or the sides hold different numbers of blocks.
 */
export function resolveBlockConflict(
  path: string,
  stages: ConflictStages,
  merge: (ours: string, base: string, theirs: string) => string | null,
): string | null {
  const blocks = blocksOf(path);
  if (blocks.length === 0) return null;
  const counts = (text: string) => blocks.map((block) => blocksIn(text, block).length).join();
  if (counts(stages.ours) !== counts(stages.theirs)) return null;
  const empty = (text: string) => replaceBlocks(text, blocks, (block) => `${block.start}\n${block.end}`);
  const merged = merge(empty(stages.ours), empty(stages.base), empty(stages.theirs));
  if (merged === null || counts(merged) !== counts(stages.ours)) return null;
  return replaceBlocks(merged, blocks, (block, index) => {
    const at = blocksIn(stages.ours, block)[index]!;
    return stages.ours.slice(at.at, at.to);
  });
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
  const top = git(["rev-parse", "--show-toplevel"]).stdout.trim();
  const stage = (n: number, path: string): string | null => {
    const shown = git(["show", `:${n}:${path}`]);
    return shown.status === 0 ? shown.stdout : null;
  };
  const merge = (ours: string, base: string, theirs: string): string | null => {
    const dir = mkdtempSync(join(tmpdir(), "jg-block-merge-"));
    try {
      const files = [["ours", ours], ["base", base], ["theirs", theirs]].map(([name, text]) => {
        const file = join(dir, name!);
        writeFileSync(file, text!);
        return file;
      });
      const merged = git(["merge-file", "-p", ...files]);
      return merged.status === 0 ? merged.stdout : null;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const blockResolved = (path: string): string | null => {
    if (blocksOf(path).length === 0 || top.length === 0) return null;
    const [base, ours, theirs] = [stage(1, path), stage(2, path), stage(3, path)];
    if (base === null || ours === null || theirs === null) return null;
    return resolveBlockConflict(path, { base, ours, theirs }, merge);
  };
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
    const inBlocks = new Map<string, string>();
    for (const path of conflicted) {
      const resolved = isGenerated(path) || isLaneOwned(path) ? null : blockResolved(path);
      if (resolved !== null) inBlocks.set(path, resolved);
    }
    const real = conflicted.filter((path) => !isGenerated(path) && !isLaneOwned(path) && !inBlocks.has(path));
    if (real.length > 0) {
      git(["rebase", "--abort"]);
      return { ok: false, conflicts: real, regenerate: [], detail: (step.stderr || step.stdout).trim() };
    }
    for (const path of conflicted) {
      const resolved = inBlocks.get(path);
      if (resolved !== undefined) writeFileSync(join(top, path), resolved);
      else git(["checkout", isGenerated(path) ? "--ours" : "--theirs", "--", path]);
      if (isRegenerated(path)) regenerated.add(path);
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
  const changed = lines(git(["diff", "--name-only", "HEAD"]).stdout).filter(isRegenerated);
  if (changed.length === 0) return null;
  const added = git(["add", "--", ...changed]);
  if (added.status !== 0) return `git add failed: ${(added.stderr || added.stdout).trim()}`;
  const committed = git(["commit", "-q", "-m", REGENERATED_SUBJECT]);
  if (committed.status !== 0) return `commit of the regenerated files failed: ${(committed.stderr || committed.stdout).trim()}`;
  return null;
}
