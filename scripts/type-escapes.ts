/**
 * Type escapes: the places a file tells the compiler to stop checking. `any`, a non-null `!`, an
 * `as` cast (not `as const`) and a `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` each turn a
 * mistake the compiler would have caught into one that ships.
 *
 * The count per file and kind is committed in `scripts/type-escape-baseline.json` and only shrinks:
 * a new escape fails `bun run check type-escapes`, and `bun run gen` lowers the baseline after one is
 * removed. An escape that cannot be avoided says why on its own line or the line above:
 *
 *     // type-escape: Object.fromEntries returns string keys; the filter keeps exactly T's fields.
 *
 * and is then not counted.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { printHelpIfAsked, type Usage } from "./script-help";

export type EscapeKind = "any" | "nonNull" | "cast" | "ignore";
export const ESCAPE_KINDS: readonly EscapeKind[] = ["any", "nonNull", "cast", "ignore"];

export interface Escape {
  kind: EscapeKind;
  line: number;
  text: string;
}

const IGNORE = /@ts-(?:ignore|expect-error|nocheck)\b/;
const DOCUMENTED = /\/\/\s*type-escape:\s*\S/;
export const BASELINE_REL = "scripts/type-escape-baseline.json";

/** Every escape in one file's source, in order, minus the ones a `// type-escape: why` comment documents. */
export function findEscapes(fileName: string, source: string): Escape[] {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const lines = source.split("\n");
  // The reason sits on the escape's own line, or alone on the line above it.
  const documented = (line: number): boolean => {
    const above = lines[line - 2] ?? "";
    return DOCUMENTED.test(lines[line - 1] ?? "") || (/^\s*\/\//.test(above) && DOCUMENTED.test(above));
  };
  const found: Escape[] = [];
  const at = (node: ts.Node, escape: EscapeKind) => {
    const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
    if (!documented(line)) found.push({ kind: escape, line, text: node.getText(file).slice(0, 80) });
  };
  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) at(node, "any");
    else if (ts.isNonNullExpression(node)) at(node, "nonNull");
    else if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      const target = node.type;
      const isConst = ts.isTypeReferenceNode(target) && target.typeName.getText(file) === "const";
      if (!isConst) at(node, "cast");
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  lines.forEach((text, index) => {
    if (IGNORE.test(text) && /^\s*(?:\/\/|\/\*|\*)/.test(text) && !documented(index + 1)) {
      found.push({ kind: "ignore", line: index + 1, text: text.trim().slice(0, 80) });
    }
  });
  return found.sort((a, b) => a.line - b.line);
}

/** The area a repository path belongs to: `packages/core`, `games/fernwild`, `apps/web`, `scripts`, ... */
export function areaOf(path: string): string {
  const parts = path.split("/");
  const [top, name] = parts;
  if ((top === "packages" || top === "games" || top === "apps" || top === "examples") && name !== undefined && parts.length > 2) return `${top}/${name}`;
  return top ?? path;
}

export function isTest(path: string): boolean {
  return /\.(?:test|spec)\.[cm]?tsx?$/.test(path) || /(?:^|\/)testFixtures?(?:\/|\.)/.test(path);
}

/** TypeScript files git tracks, minus declarations. */
export function trackedSources(root: string): string[] {
  const listed = spawnSync("git", ["ls-files", "*.ts", "*.tsx", "*.mts", "*.cts"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (listed.status !== 0) throw new Error(`git ls-files failed: ${listed.stderr}`);
  return listed.stdout.split("\n").filter((path) => path.length > 0 && !path.endsWith(".d.ts") && !path.includes("node_modules/"));
}

export type Counts = Record<EscapeKind, number>;
export const zeroCounts = (): Counts => ({ any: 0, nonNull: 0, cast: 0, ignore: 0 });

/** Escape counts per file, for every file that has at least one. */
export type FileCounts = Record<string, Partial<Counts>>;

export function scanFiles(root: string): Map<string, Escape[]> {
  const byFile = new Map<string, Escape[]>();
  for (const path of trackedSources(root)) {
    const full = join(root, path);
    if (!existsSync(full)) continue;
    const escapes = findEscapes(path, readFileSync(full, "utf8"));
    if (escapes.length > 0) byFile.set(path, escapes);
  }
  return byFile;
}

export function countByFile(byFile: ReadonlyMap<string, readonly Escape[]>): FileCounts {
  const out: FileCounts = {};
  for (const [path, escapes] of [...byFile].sort(([a], [b]) => a.localeCompare(b))) {
    const counts: Partial<Counts> = {};
    for (const escape of escapes) counts[escape.kind] = (counts[escape.kind] ?? 0) + 1;
    out[path] = counts;
  }
  return out;
}

/** Per-area totals, split into source and tests. */
export function countByArea(files: FileCounts): Map<string, { source: Counts; tests: Counts }> {
  const areas = new Map<string, { source: Counts; tests: Counts }>();
  for (const [path, counts] of Object.entries(files)) {
    const area = areaOf(path);
    const entry = areas.get(area) ?? { source: zeroCounts(), tests: zeroCounts() };
    const bucket = isTest(path) ? entry.tests : entry.source;
    for (const kind of ESCAPE_KINDS) bucket[kind] += counts[kind] ?? 0;
    areas.set(area, entry);
  }
  return areas;
}

export interface EscapeVerdict {
  /** Files holding more escapes of a kind than the baseline allows. */
  grown: { path: string; kind: EscapeKind; live: number; allowed: number }[];
  /** Files holding fewer escapes than the baseline records: the baseline must shrink. */
  shrunk: { path: string; kind: EscapeKind; live: number; allowed: number }[];
}

export function compareToBaseline(live: FileCounts, baseline: FileCounts): EscapeVerdict {
  const verdict: EscapeVerdict = { grown: [], shrunk: [] };
  const paths = new Set([...Object.keys(live), ...Object.keys(baseline)]);
  for (const path of [...paths].sort()) {
    for (const kind of ESCAPE_KINDS) {
      const now = live[path]?.[kind] ?? 0;
      const allowed = baseline[path]?.[kind] ?? 0;
      if (now > allowed) verdict.grown.push({ path, kind, live: now, allowed });
      else if (now < allowed) verdict.shrunk.push({ path, kind, live: now, allowed });
    }
  }
  return verdict;
}

/** One file per line, so a diff of the baseline reads as the files whose escapes changed. */
export function serializeBaseline(files: FileCounts): string {
  const rows = Object.entries(files).map(([path, counts]) => `  ${JSON.stringify(path)}: ${JSON.stringify(counts)}`);
  return `{\n${rows.join(",\n")}\n}\n`;
}

function readBaseline(root: string): FileCounts {
  const path = join(root, BASELINE_REL);
  if (!existsSync(path)) return {};
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof parsed !== "object" || parsed === null) throw new Error(`${BASELINE_REL} is not an object`);
  const out: FileCounts = {};
  for (const [file, value] of Object.entries(parsed)) {
    if (typeof value !== "object" || value === null) continue;
    const counts: Partial<Counts> = {};
    for (const kind of ESCAPE_KINDS) {
      const count: unknown = Reflect.get(value, kind);
      if (typeof count === "number") counts[kind] = count;
    }
    out[file] = counts;
  }
  return out;
}

const KIND_LABEL: Record<EscapeKind, string> = { any: "any", nonNull: "non-null !", cast: "as cast", ignore: "@ts-ignore" };

const GUIDANCE = `Fix the type instead: narrow with a guard, give the value its real type, or use a helper that
returns T | undefined. When an escape truly cannot be avoided (a platform API that returns any, a
typed wrapper's one internal cast), put \`// type-escape: <why>\` on its line or the line above.`;

const usage: Usage = {
  summary: "Count any, non-null !, as casts and @ts-ignore per file; the committed count only shrinks.",
  usage: "bun scripts/type-escapes.ts [--check | --report | --json]",
  flags: [
    { flag: "(none)", detail: `lower ${BASELINE_REL} to the live counts (bun run gen); refuses to raise one` },
    { flag: "--check", detail: "fail when a file gained an escape, or lost one the baseline still records" },
    { flag: "--report", detail: "print totals per area (source | tests)" },
    { flag: "--json", detail: "print totals per area as JSON" },
  ],
  example: "bun scripts/type-escapes.ts --check",
};

function printReport(files: FileCounts, json: boolean): void {
  const areas = [...countByArea(files)].sort(([a], [b]) => a.localeCompare(b));
  if (json) {
    console.log(JSON.stringify(Object.fromEntries(areas), null, 2));
    return;
  }
  const total = { source: zeroCounts(), tests: zeroCounts() };
  console.log("area\tany\t!\tas\tignore\t|\ttests: any\t!\tas\tignore");
  for (const [area, { source, tests }] of areas) {
    for (const kind of ESCAPE_KINDS) {
      total.source[kind] += source[kind];
      total.tests[kind] += tests[kind];
    }
    console.log([area, ...ESCAPE_KINDS.map((k) => source[k]), "|", ...ESCAPE_KINDS.map((k) => tests[k])].join("\t"));
  }
  console.log(["TOTAL", ...ESCAPE_KINDS.map((k) => total.source[k]), "|", ...ESCAPE_KINDS.map((k) => total.tests[k])].join("\t"));
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (printHelpIfAsked("type-escapes", usage, argv)) process.exit(0);
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const byFile = scanFiles(root);
  const live = countByFile(byFile);

  if (argv.includes("--report") || argv.includes("--json")) {
    printReport(live, argv.includes("--json"));
    process.exit(0);
  }

  const baselinePath = join(root, BASELINE_REL);
  const write = (): void => writeFileSync(baselinePath, serializeBaseline(live));
  if (!existsSync(baselinePath) && !argv.includes("--check")) {
    write();
    console.log(`type-escapes: started ${BASELINE_REL} with ${Object.keys(live).length} file(s)`);
    process.exit(0);
  }
  const verdict = compareToBaseline(live, readBaseline(root));
  if (verdict.grown.length > 0) {
    console.error(`\ntype-escapes failed: ${verdict.grown.length} file/kind(s) gained a type escape\n`);
    for (const { path, kind, live: now, allowed } of verdict.grown) {
      console.error(`  ${path}: ${KIND_LABEL[kind]} ${now} (allowed ${allowed})`);
      for (const escape of byFile.get(path) ?? []) if (escape.kind === kind) console.error(`    ${path}:${escape.line}  ${escape.text}`);
    }
    console.error(`\n${GUIDANCE}\n`);
    process.exit(1);
  }

  if (argv.includes("--check")) {
    if (verdict.shrunk.length > 0) {
      console.error(`\ntype-escapes failed: ${verdict.shrunk.length} file/kind(s) lost escapes the baseline still records\n`);
      for (const { path, kind, live: now, allowed } of verdict.shrunk) console.error(`  ${path}: ${KIND_LABEL[kind]} ${now} (baseline ${allowed})`);
      console.error(`\nThe baseline only shrinks — commit the smaller one.\nFix: bun run gen type-escapes\n`);
      process.exit(1);
    }
    const total = Object.values(live).reduce((sum, counts) => sum + ESCAPE_KINDS.reduce((s, k) => s + (counts[k] ?? 0), 0), 0);
    console.log(`type-escapes ok: ${total} escape(s) in ${Object.keys(live).length} file(s), none added`);
    process.exit(0);
  }

  write();
  console.log(`type-escapes: wrote ${Object.keys(live).length} file(s) to ${BASELINE_REL}`);
}
