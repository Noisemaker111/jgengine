// A rebase conflict that has one right answer is not a conflict, so a landing never stops on one. Three
// kinds resolve here; only a conflict that fits none of them is left to the lane.
//
// - Generated files: both sides changed a file a command writes from source (`api.md`, the export
//   manifest), so the file takes the base's copy while the rebase runs and is regenerated once at the end.
//   A generator may own only a marked block of a hand-written file (each game's suite score in its README
//   and PLAN): such a file keeps both sides' hand-written text, takes the base's block, and is regenerated.
// - Files merged by meaning: a game's `proofs/suite-report.json` is one row per proof, so the rows merge by
//   proof file (each side keeps the rows it changed) and the README/PLAN score is regenerated from the result.
//   Fernwild lanes each add a proof, and 37 of 98 PRs on Nov 6-8 touched that one file.
// - Lines both sides added at one place: two lanes appending a probe field to `game.config.ts`, a tick to
//   PLAN.md or a credit to CREDITS.md keep both, the base's first. An edit to a line the other side also
//   changed or removed stays a real conflict. lane:close verifies the rebased tree, so a union that does not
//   compile (two lanes adding the same key) stops there, never on beta.
//
// During `git rebase`, `--ours` is the base being rebased onto and `--theirs` is the lane's commit.
// A change note (`changes/<branch>.md`) is the lane's own, so it keeps the lane's copy.
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

/** The three sides of a conflicted file: the commits' common ancestor, the base rebased onto, and the lane's commit. */
export interface ConflictStages {
  base: string;
  ours: string;
  theirs: string;
}

/** A three-way merge of rows keyed by `key`: a row one side left as the base had it takes the other side's; both changed, the lane's. */
function mergeRows<T>(base: readonly T[], ours: readonly T[], theirs: readonly T[], key: (row: T) => string): T[] {
  const text = (row: T | undefined): string | undefined => (row === undefined ? undefined : JSON.stringify(row));
  const index = (rows: readonly T[]): Map<string, T> => new Map(rows.map((row) => [key(row), row]));
  const [was, mine, lane] = [index(base), index(ours), index(theirs)];
  const merged: T[] = [];
  for (const id of new Set([...ours, ...theirs].map(key))) {
    const before = text(was.get(id));
    const row = text(lane.get(id)) === before ? mine.get(id) : text(mine.get(id)) === before ? lane.get(id) : (lane.get(id) ?? mine.get(id));
    if (row !== undefined) merged.push(row);
  }
  return merged;
}

/** A suite report's rows, keyed: proofs by `file`, content checks by `id`. Read here, not through `@jgengine/core`, because landing runs from an unpacked `scripts/` with no packages (`landing-code.ts`). */
interface ReportRows {
  game: unknown;
  proofs: { key: string; row: unknown }[];
  data: { key: string; row: unknown }[];
}

function reportRows(text: string): ReportRows | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const { game, proofs, data } = raw as Record<string, unknown>;
  const keyed = (rows: unknown, field: string): { key: string; row: unknown }[] | null => {
    if (!Array.isArray(rows)) return null;
    const out: { key: string; row: unknown }[] = [];
    for (const row of rows) {
      const key: unknown = typeof row === "object" && row !== null ? (row as Record<string, unknown>)[field] : undefined;
      if (typeof key !== "string") return null;
      out.push({ key, row });
    }
    return out;
  };
  const [proofRows, dataRows] = [keyed(proofs, "file"), keyed(data, "id")];
  return proofRows === null || dataRows === null ? null : { game, proofs: proofRows, data: dataRows };
}

/**
 * Two runs of one game's suite, merged: each proof row is that proof's own result, so a row only one side
 * changed takes that side's. A row both changed takes the lane's run; the suite test on the merged tree,
 * which lane:close runs, writes the true one. Null when a side is not a suite report.
 */
export function mergeSuiteReports({ base, ours, theirs }: ConflictStages): string | null {
  const [was, mine, lane] = [reportRows(base), reportRows(ours), reportRows(theirs)];
  if (was === null || mine === null || lane === null) return null;
  const merged = (field: "proofs" | "data") => mergeRows(was[field], mine[field], lane[field], (entry) => entry.key);
  const byFile = (a: { key: string }, b: { key: string }) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const report = { game: mine.game, proofs: merged("proofs").sort(byFile).map((entry) => entry.row), data: merged("data").map((entry) => entry.row) };
  return `${JSON.stringify(report, null, 2)}\n`;
}

/** Files a rebase merges by what they hold rather than by line; a resolved one is followed by `bun run gen`. */
export const MEANING_MERGES: readonly { readonly paths: RegExp; readonly merge: (stages: ConflictStages) => string | null }[] = [
  { paths: /^games\/[^/]+\/proofs\/suite-report\.json$/, merge: mergeSuiteReports },
];

function meaningMerge(path: string): ((stages: ConflictStages) => string | null) | undefined {
  return MEANING_MERGES.find((entry) => entry.paths.test(path))?.merge;
}

/** The conflict labels `merge-file` is given, so a marker-like line in a file is never read as one. */
const SIDE = "jg-rebase-side";
const OPEN = `<<<<<<< ${SIDE}-ours`;
const BASE_PART = `||||||| ${SIDE}-base`;
const SPLIT = "=======";
const CLOSE = `>>>>>>> ${SIDE}-theirs`;
/**
 * The `git merge-file` style and labels {@link keepBothInsertions} reads. Plain `--diff3`, not `--zdiff3`: zdiff3
 * lifts the lines two insertions share at their start or end (an `import {`, a closing `}),`) out of the
 * conflict, so keeping both sides kept those lines once and broke the code.
 */
export const MERGE_FILE_ARGS: readonly string[] = ["--diff3", ...["ours", "base", "theirs"].flatMap((side) => ["-L", `${SIDE}-${side}`])];

/**
 * `git merge-file -p` output (with `MERGE_FILE_ARGS`) with every conflict in which both
 * sides only added lines resolved to the base's added lines, then the lane's. Null when any conflict changed
 * or removed a line the common ancestor had: that one is the lane's to resolve.
 */
export function keepBothInsertions(merged: string): string | null {
  const out: string[] = [];
  let ours: string[] | null = null;
  let base: string[] | null = null;
  let theirs: string[] | null = null;
  for (const line of merged.split("\n")) {
    const bare = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (ours === null) {
      if (bare === OPEN) ours = [];
      else out.push(line);
    } else if (base === null) {
      if (bare === BASE_PART) base = [];
      else ours.push(line);
    } else if (theirs === null) {
      if (bare === SPLIT) theirs = [];
      else base.push(line);
    } else if (bare === CLOSE) {
      if (base.length > 0) return null;
      out.push(...ours, ...theirs);
      [ours, base, theirs] = [null, null, null];
    } else theirs.push(line);
  }
  return ours === null ? out.join("\n") : null;
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
 * `git rebase <onto>`, resolving every conflict with one right answer as it goes (see the header). A real
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
  // A line merge in which lines both sides added at one place keep both; any other conflict is null.
  const merge = (ours: string, base: string, theirs: string): string | null => {
    const dir = mkdtempSync(join(tmpdir(), "jg-block-merge-"));
    try {
      const files = [["ours", ours], ["base", base], ["theirs", theirs]].map(([name, text]) => {
        const file = join(dir, name!);
        writeFileSync(file, text!);
        return file;
      });
      const merged = git(["merge-file", "-p", ...MERGE_FILE_ARGS, ...files]);
      if (merged.status === 0) return merged.stdout;
      // merge-file answers the number of conflicts, or a value of 128 and above for an error such as a binary file.
      return merged.status > 0 && merged.status < 128 ? keepBothInsertions(merged.stdout) : null;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  // A block file merges its hand-written text around its blocks, a file merged by meaning uses its own
  // merge, and any other text file keeps the lines both sides added at one place.
  const resolve = (path: string): string | null => {
    if (top.length === 0) return null;
    const [base, ours, theirs] = [stage(1, path), stage(2, path), stage(3, path)];
    if (base === null || ours === null || theirs === null) return null;
    if (blocksOf(path).length > 0) return resolveBlockConflict(path, { base, ours, theirs }, merge);
    const byMeaning = meaningMerge(path);
    if (byMeaning !== undefined) return byMeaning({ base, ours, theirs });
    return merge(ours, base, theirs);
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
    const resolved = new Map<string, string>();
    for (const path of conflicted) {
      const text = isGenerated(path) || isLaneOwned(path) ? null : resolve(path);
      if (text !== null) resolved.set(path, text);
    }
    const real = conflicted.filter((path) => !isGenerated(path) && !isLaneOwned(path) && !resolved.has(path));
    if (real.length > 0) {
      git(["rebase", "--abort"]);
      return { ok: false, conflicts: real, regenerate: [], detail: (step.stderr || step.stdout).trim() };
    }
    for (const path of conflicted) {
      const text = resolved.get(path);
      if (text !== undefined) writeFileSync(join(top, path), text);
      else git(["checkout", isGenerated(path) ? "--ours" : "--theirs", "--", path]);
      if (isRegenerated(path) || meaningMerge(path) !== undefined) regenerated.add(path);
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
