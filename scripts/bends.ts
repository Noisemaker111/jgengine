// A lane under pressure makes a check pass by bending it: an assertion deleted or loosened, a
// budget raised, a test skipped, a CI step or gate switched off. Each can be right, but a reviewer
// who never reads the diff cannot see one. `land` reads the branch's diff for these and writes them
// into the PR body as a "Bends" section, so every bend is named where the PR is judged.
//
//   bun scripts/bends.ts [--base origin/beta]     print the section for this branch
import { spawnSync } from "node:child_process";

export type BendKind = "assertion removed" | "assertion loosened" | "budget raised" | "test skipped" | "check disabled";

export interface Bend {
  kind: BendKind;
  file: string;
  /** The line as the diff shows it, trimmed. */
  detail: string;
}

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const WORKFLOW = /^\.github\/workflows\//;
const ASSERTION = /\bexpect\s*\(|\bassert(?:\.\w+)?\s*\(|\.rejects\b|\.resolves\b/;
const STRICT = /\.(toBe|toEqual|toStrictEqual|toMatchObject|toThrow|toHaveLength|toBeNull|toBeUndefined|toBeFalsy)\s*\(/;
const WEAK = /\.(toBeTruthy|toBeDefined|toBeGreaterThan|toBeGreaterThanOrEqual|toBeLessThan|toBeLessThanOrEqual|toBeCloseTo|toContain|toMatch|toBeInstanceOf)\s*\(|expect\.any\(|expect\.anything\(/;
const SKIP = /\b(?:test|it|describe)\s*\.\s*(?:skip|todo|failing|skipIf|if\s*\(\s*false)|\b(?:xit|xtest|xdescribe)\s*\(/;
const DISABLE =
  /continue-on-error:\s*true|\|\|\s*true\b|@ts-ignore|@ts-nocheck|@ts-expect-error|eslint-disable|biome-ignore|\/\/\s*(?:walk|wait)-ok\b|--no-verify|^\s*if:\s*false\b|Prevention: none -/;
const BUDGET_KEY = /budget|baseline|threshold|ceiling|tolerance|timeout|max[A-Z_]?\w*|limit|allow(?:ance|ed)?|\bms\b|Ms\b|seconds|minutes|_MS\b/i;
const NUMBER = /-?\d+(?:\.\d+)?/g;

interface FileDiff {
  file: string;
  removed: string[];
  added: string[];
  /** Consecutive -/+ runs, for line-for-line comparisons. */
  pairs: { removed: string; added: string }[];
}

/** Split a unified diff into per-file removed and added lines. */
export function parseDiff(diff: string): FileDiff[] {
  const files: FileDiff[] = [];
  let current: FileDiff | null = null;
  let run: { removed: string[]; added: string[] } = { removed: [], added: [] };
  const flush = (): void => {
    if (current !== null) {
      const count = Math.min(run.removed.length, run.added.length);
      for (let i = 0; i < count; i += 1) current.pairs.push({ removed: run.removed[i]!, added: run.added[i]! });
    }
    run = { removed: [], added: [] };
  };
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      flush();
      const match = / b\/(.+)$/.exec(line);
      current = { file: match?.[1] ?? "?", removed: [], added: [], pairs: [] };
      files.push(current);
      continue;
    }
    if (current === null || line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("-")) {
      if (run.added.length > 0) flush();
      current.removed.push(line.slice(1));
      run.removed.push(line.slice(1));
    } else if (line.startsWith("+")) {
      current.added.push(line.slice(1));
      run.added.push(line.slice(1));
    } else {
      flush();
    }
  }
  flush();
  return files;
}

/** Lines that were only moved (removed here, added there, same text) are not bends. */
function unmoved(lines: readonly string[], other: readonly string[]): string[] {
  const pool = new Map<string, number>();
  for (const line of other) pool.set(line.trim(), (pool.get(line.trim()) ?? 0) + 1);
  const kept: string[] = [];
  for (const line of lines) {
    const left = pool.get(line.trim()) ?? 0;
    if (left > 0) pool.set(line.trim(), left - 1);
    else kept.push(line);
  }
  return kept;
}

/** The numbers in a line when the rest of it is unchanged, else null. */
function numberChange(removed: string, added: string): { from: number; to: number } | null {
  if (removed.replace(NUMBER, "#") !== added.replace(NUMBER, "#")) return null;
  const before = (removed.match(NUMBER) ?? []).map(Number);
  const after = (added.match(NUMBER) ?? []).map(Number);
  for (let i = 0; i < before.length; i += 1) {
    if (before[i] !== after[i]) return { from: before[i]!, to: after[i]! };
  }
  return null;
}

/**
 * Whether a pattern's match sits inside a string or a regex literal: a rule written down (this
 * file, its test, a doc string) is not the rule applied.
 */
export function inLiteral(line: string, pattern: RegExp): boolean {
  const match = pattern.exec(line);
  if (match === null) return false;
  if (/^\s*\//.test(line) && !/^\s*\/\//.test(line)) return true;
  if (/[=(,:|]\s*\/(?![/*])/.test(line.slice(0, match.index + 1))) return true;
  const before = line.slice(0, match.index);
  for (const quote of ['"', "'", "`"]) {
    if ((before.split(quote).length - 1) % 2 === 1) return true;
  }
  return false;
}

function clip(text: string): string {
  const flat = text.trim().replace(/\s+/g, " ");
  return flat.length > 140 ? `${flat.slice(0, 139)}…` : flat;
}

/** Every bend a diff shows. Pure, so the rules are testable on diff text alone. */
export function findBends(diff: string): Bend[] {
  const bends: Bend[] = [];
  for (const file of parseDiff(diff)) {
    const removed = unmoved(file.removed, file.added);
    const added = unmoved(file.added, file.removed);
    const isTest = TEST_FILE.test(file.file);

    const loosened = new Set<string>();
    if (isTest) {
      for (const pair of file.pairs) {
        if (ASSERTION.test(pair.removed) && STRICT.test(pair.removed) && WEAK.test(pair.added) && !STRICT.test(pair.added)) {
          loosened.add(pair.removed.trim());
          bends.push({ kind: "assertion loosened", file: file.file, detail: `${clip(pair.removed)} -> ${clip(pair.added)}` });
        }
      }
      const removedAssertions = removed.filter((line) => ASSERTION.test(line) && !loosened.has(line.trim()));
      const addedAssertions = added.filter((line) => ASSERTION.test(line)).length;
      // An assertion rewritten in place is not a deletion; only the net loss is.
      const lost = removedAssertions.length - addedAssertions;
      if (lost > 0) {
        bends.push({
          kind: "assertion removed",
          file: file.file,
          detail: `${lost} fewer assertion(s), e.g. ${clip(removedAssertions[0]!)}`,
        });
      }
    }

    for (const line of added) {
      if (SKIP.test(line) && !inLiteral(line, SKIP)) bends.push({ kind: "test skipped", file: file.file, detail: clip(line) });
      else if (DISABLE.test(line) && !inLiteral(line, DISABLE)) bends.push({ kind: "check disabled", file: file.file, detail: clip(line) });
    }

    if (WORKFLOW.test(file.file)) {
      for (const line of removed) {
        if (/^\s*-?\s*(?:run|uses|name):\s*\S/.test(line) && !/actions\/(?:checkout|cache|setup)|setup-bun|bun install/.test(line)) {
          bends.push({ kind: "check disabled", file: file.file, detail: `CI step removed: ${clip(line)}` });
        }
      }
    }

    for (const pair of file.pairs) {
      const change = numberChange(pair.removed, pair.added);
      if (change === null || change.to <= change.from) continue;
      if (!BUDGET_KEY.test(pair.added) && !BUDGET_KEY.test(file.file)) continue;
      bends.push({ kind: "budget raised", file: file.file, detail: `${change.from} -> ${change.to}: ${clip(pair.added)}` });
    }
  }
  return bends;
}

export const BENDS_HEADING = "## Bends";

/** The PR body section: one bullet per bend, or a line saying the diff shows none. */
export function bendsSection(bends: readonly Bend[], limit = 25): string {
  const lines = [BENDS_HEADING, ""];
  if (bends.length === 0) {
    lines.push("None found in the diff: no assertion removed or loosened, budget raised, test skipped or check disabled.");
    return lines.join("\n");
  }
  lines.push("Found in the diff by `scripts/bends.ts`; each is a check made easier to pass. Say why it is right, or undo it.", "");
  for (const bend of bends.slice(0, limit)) lines.push(`- ${bend.kind}: \`${bend.file}\` - ${bend.detail.replace(/`/g, "'")}`);
  if (bends.length > limit) lines.push(`- and ${bends.length - limit} more (run \`bun scripts/bends.ts\`)`);
  return lines.join("\n");
}

/** `body` with its Bends section replaced by `section`, or `section` appended when it has none. */
export function withBends(body: string, section: string): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => line.trim() === BENDS_HEADING);
  if (start < 0) return `${body.trimEnd()}\n\n${section}\n`;
  let end = start + 1;
  while (end < lines.length && !/^#{1,2}\s/.test(lines[end]!)) end += 1;
  return [...lines.slice(0, start), ...section.split("\n"), ...(end < lines.length ? ["", ...lines.slice(end)] : [])].join("\n").trimEnd() + "\n";
}

/** The diff `land` reads: everything this branch changed against `base`. */
export function branchDiff(root: string, base: string): string {
  const run = spawnSync("git", ["diff", "--no-color", "-M", "-U0", `${base}...HEAD`], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    timeout: 60_000,
  });
  return run.status === 0 ? (run.stdout ?? "") : "";
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf("--base");
  const base = at >= 0 ? (argv[at + 1] ?? "origin/beta") : "origin/beta";
  console.log(bendsSection(findBends(branchDiff(process.cwd(), base))));
}
