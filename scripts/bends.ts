// A lane under pressure makes a check pass by bending it: an assertion deleted, a test skipped, a
// CI step or gate switched off. Each can be right, but a reviewer who never reads the diff cannot
// see one. `land` reads the branch's diff for these and writes them into the PR body as a "Bends"
// section when it finds any; a clean diff gets no section.
//
// A raised budget or a strict matcher swapped for a looser one is not listed: most such edits are
// sanctioned re-records, and a scanner cannot tell those from the rest.
//
//   bun scripts/bends.ts [--base origin/beta]     print the section for this branch
import { spawnSync } from "node:child_process";

export type BendKind = "assertion removed" | "test skipped" | "check disabled";

export interface Bend {
  kind: BendKind;
  file: string;
  /** The line as the diff shows it, trimmed. */
  detail: string;
}

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const WORKFLOW = /^\.github\/workflows\//;
const ASSERTION = /\bexpect\s*\(|\bassert(?:\.\w+)?\s*\(|\.rejects\b|\.resolves\b/;
const SKIP = /\b(?:test|it|describe)\s*\.\s*(?:skip|todo|failing|skipIf|if\s*\(\s*false)|\b(?:xit|xtest|xdescribe)\s*\(/;
const DISABLE =
  /continue-on-error:\s*true|\|\|\s*true\b|@ts-ignore|@ts-nocheck|@ts-expect-error|eslint-disable|biome-ignore|\/\/\s*(?:walk|wait|home|framework)-ok\b|--no-verify|^\s*if:\s*false\b/;

interface FileDiff {
  file: string;
  removed: string[];
  added: string[];
}

/** Split a unified diff into per-file removed and added lines. */
export function parseDiff(diff: string): FileDiff[] {
  const files: FileDiff[] = [];
  let current: FileDiff | null = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const match = / b\/(.+)$/.exec(line);
      current = { file: match?.[1] ?? "?", removed: [], added: [] };
      files.push(current);
      continue;
    }
    if (current === null || line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("-")) current.removed.push(line.slice(1));
    else if (line.startsWith("+")) current.added.push(line.slice(1));
  }
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

    if (TEST_FILE.test(file.file)) {
      const removedAssertions = removed.filter((line) => ASSERTION.test(line));
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
  }
  return bends;
}

export const BENDS_HEADING = "## Bends";

/** The PR body section: one bullet per bend, or "" when the diff shows none. */
export function bendsSection(bends: readonly Bend[], limit = 25): string {
  if (bends.length === 0) return "";
  const lines = [BENDS_HEADING, ""];
  lines.push("Found in the diff by `scripts/bends.ts`; each is a check made easier to pass. Say why it is right, or undo it.", "");
  for (const bend of bends.slice(0, limit)) lines.push(`- ${bend.kind}: \`${bend.file}\` - ${bend.detail.replace(/`/g, "'")}`);
  if (bends.length > limit) lines.push(`- and ${bends.length - limit} more (run \`bun scripts/bends.ts\`)`);
  return lines.join("\n");
}

/**
 * `body` with its Bends section replaced by `section`: appended when the body has none, removed
 * when `section` is "".
 */
export function withBends(body: string, section: string): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => line.trim() === BENDS_HEADING);
  if (start < 0) return section === "" ? body : `${body.trimEnd()}\n\n${section}\n`;
  let end = start + 1;
  while (end < lines.length && !/^#{1,2}\s/.test(lines[end]!)) end += 1;
  const replacement = section === "" ? [] : section.split("\n");
  const rest = end < lines.length ? [...(replacement.length > 0 ? [""] : []), ...lines.slice(end)] : [];
  return [...lines.slice(0, start), ...replacement, ...rest].join("\n").trimEnd() + "\n";
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
  const section = bendsSection(findBends(branchDiff(process.cwd(), base)));
  console.log(section === "" ? "no bends in the diff" : section);
}
