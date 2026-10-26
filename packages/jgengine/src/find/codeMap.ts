import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { findUp } from "../pkg";
import { rowWords, tokenHits } from "./words";

/**
 * The code half of `jgengine find`: which folder in each layer holds a concept, read from the code
 * itself (folder and file names, exported names, their doc comments), so the answer cannot go stale.
 */

/** What each engine layer holds for a concept; other packages, apps and scripts are listed by name. */
export const LAYER_ROLES: Readonly<Record<string, string>> = {
  core: "model",
  shell: "draw",
  react: "view",
  editor: "author",
};

const LAYER_ORDER = ["core", "shell", "react", "editor"];

/** One source file, placed in its layer. */
export interface CodeFile {
  /** `core`, `shell`, `apps/dev`, `scripts`, ... */
  layer: string;
  /** Path to print, from the search root, posix. */
  path: string;
  /** Path inside the layer's source root, posix: `camera/shake/cameraShake.ts`. */
  rel: string;
}

/** One exported declaration and the first line of its doc comment. */
export interface CodeExport {
  name: string;
  line: number;
  doc?: string;
}

/** A file that matched, best first. */
export interface FileHit {
  path: string;
  score: number;
  /** Exports whose names (with the file's path) carry the query; else the file's first few. */
  exports: CodeExport[];
}

/** The answer for one layer: its home folder for the concept and what lives there. */
export interface LayerHome {
  layer: string;
  role?: string;
  /** Folder that holds the concept in this layer, posix, ending in `/`. */
  home: string;
  /** Matching files under the home folder. */
  files: FileHit[];
  /** Strong matches outside the home folder: scattered pieces a restructure should move in. */
  elsewhere: FileHit[];
}

const DECLARATION = /^export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\*?|const|let|var|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/;

/** The name an `export function|const|class|interface|type|enum ...` line declares, or null. */
export function declaredExport(line: string): string | null {
  return DECLARATION.exec(line)?.[1] ?? null;
}

/** Exported declarations of one source file with the first line of each JSDoc. */
export function readExports(text: string): CodeExport[] {
  const lines = text.split("\n");
  const found: CodeExport[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const name = declaredExport(lines[index]!);
    if (name === null) continue;
    const doc = docAbove(lines, index);
    found.push(doc === undefined ? { name, line: index + 1 } : { name, line: index + 1, doc });
  }
  return found;
}

function docAbove(lines: readonly string[], at: number): string | undefined {
  let end = at - 1;
  while (end >= 0 && lines[end]!.trim() === "") end -= 1;
  if (end < 0 || !lines[end]!.trim().endsWith("*/")) return undefined;
  let start = end;
  while (start >= 0 && !lines[start]!.includes("/**")) start -= 1;
  if (start < 0) return undefined;
  const text = lines
    .slice(start, end + 1)
    .map((line) => line.replace(/^\s*\/\*\*\s?|\s*\*\/\s*$|^\s*\*\s?/g, "").trim())
    .filter((line) => line !== "" && !line.startsWith("@"))
    .join(" ");
  return text === "" ? undefined : text.slice(0, 400);
}

const SOURCE = /\.tsx?$/;
const NOT_SOURCE = /\.(test|spec|browser\.test)\.tsx?$|\.fixture\.|\/fixtures?\//;

/** Place one repository path in its layer, or null when it is not engine source. */
export function layerOf(path: string): CodeFile | null {
  if (!SOURCE.test(path) || NOT_SOURCE.test(path) || path.endsWith(".d.ts")) return null;
  const pkg = /^packages\/([^/]+)\/src\/(.+)$/.exec(path);
  if (pkg !== null) return { layer: pkg[1]!, path, rel: pkg[2]! };
  const app = /^apps\/([^/]+)\/(?:src\/)?(.+)$/.exec(path);
  if (app !== null) return { layer: `apps/${app[1]!}`, path, rel: app[2]! };
  const script = /^scripts\/(.+)$/.exec(path);
  if (script !== null) return { layer: "scripts", path, rel: script[1]! };
  return null;
}

/** The engine checkout above `from`, if this is one. */
export function engineRoot(from: string): string | null {
  return findUp(from, (dir) => existsSync(join(dir, "packages", "core", "src")) && existsSync(join(dir, "packages", "jgengine", "src")));
}

/** Every engine source file in a checkout, from git's index (no tree walk). */
export function listRepoFiles(root: string): CodeFile[] {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "packages/*/src/*", "apps/*", "scripts/*"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) return [];
  return (result.stdout ?? "")
    .split("\n")
    .filter((line) => line !== "")
    .map(layerOf)
    .filter((file): file is CodeFile => file !== null);
}

/**
 * The published `@jgengine/*` packages of a consumer project, read from their `.d.ts` files, so
 * `jgengine find` answers in a game that has no engine source checked out.
 */
export function listInstalledFiles(from: string): { root: string; files: CodeFile[] } | null {
  const modules = findUp(from, (dir) => existsSync(join(dir, "node_modules", "@jgengine")));
  if (modules === null) return null;
  const scope = join(modules, "node_modules", "@jgengine");
  const files: CodeFile[] = [];
  for (const pkg of safeDirs(scope)) {
    const dist = join(scope, pkg, "dist");
    // walk-ok: one installed package's dist folder, bounded and never node_modules.
    const visit = (dir: string, rel: string): void => {
      for (const entry of safeEntries(dir)) {
        const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
        if (entry.isDirectory()) visit(join(dir, entry.name), childRel);
        else if (entry.name.endsWith(".d.ts")) {
          files.push({ layer: pkg, path: `node_modules/@jgengine/${pkg}/dist/${childRel}`, rel: childRel.replace(/\.d\.ts$/, ".ts") });
        }
      }
    };
    visit(dist, "");
  }
  return { root: modules, files };
}

function safeEntries(dir: string) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function safeDirs(dir: string): string[] {
  return safeEntries(dir).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

interface Scored {
  file: CodeFile;
  dir: string;
  score: number;
  exports: CodeExport[];
  pathHit: boolean;
}

function dirOf(rel: string): string {
  const at = rel.lastIndexOf("/");
  return at < 0 ? "" : rel.slice(0, at);
}

function baseName(rel: string): string {
  return rel.slice(rel.lastIndexOf("/") + 1).replace(/\.tsx?$/, "");
}

function covers(tokens: readonly string[], sets: readonly { words: ReadonlySet<string>; raw: string }[]): boolean {
  return tokens.every((token) => sets.some((set) => tokenHits(token, set.words, set.raw)));
}

function wordSet(text: string): { words: Set<string>; raw: string } {
  return { words: rowWords(text), raw: text.toLowerCase() };
}

/**
 * Score one file against the query tokens. Folder and file names weigh most, exported names next,
 * doc comments least; a file only counts when every token lands somewhere in it.
 */
export function scoreFile(file: CodeFile, exports: readonly CodeExport[], tokens: readonly string[]): Scored | null {
  const dir = dirOf(file.rel);
  const dirWords = wordSet(dir.replaceAll("/", " "));
  const nameWords = wordSet(baseName(file.rel));
  const exportWords = exports.map((entry) => ({ entry, name: wordSet(entry.name), doc: wordSet(entry.doc ?? "") }));
  const everything = [dirWords, nameWords, ...exportWords.flatMap((row) => [row.name, row.doc])];
  if (!covers(tokens, everything)) return null;
  let score = 0;
  const pathHit = covers(tokens, [dirWords, nameWords]);
  if (pathHit) score += 50;
  if (dir !== "" && covers(tokens, [dirWords])) score += 30;
  if (covers(tokens, [nameWords])) score += 20;
  const named = exportWords.filter((row) => covers(tokens, [row.name, dirWords, nameWords]) && tokens.some((token) => tokenHits(token, row.name.words, row.name.raw)));
  score += Math.min(named.length, 5) * 10;
  const documented = exportWords.filter((row) => !named.includes(row) && covers(tokens, [row.doc, row.name, dirWords, nameWords]));
  score += Math.min(documented.length, 5) * 2;
  const shown = named.length > 0 ? named.map((row) => row.entry) : pathHit ? exports.slice(0, 4) : documented.map((row) => row.entry);
  return { file, dir, score, exports: shown, pathHit };
}

function layerRank(layer: string): number {
  const fixed = LAYER_ORDER.indexOf(layer);
  if (fixed >= 0) return fixed;
  if (layer.startsWith("apps/")) return 20;
  if (layer === "scripts") return 30;
  return 10;
}

function isUnder(dir: string, home: string): boolean {
  return home === "" || dir === home || dir.startsWith(`${home}/`);
}

/** The home folder per layer for a query, best layers first in core → shell → react → editor order. */
export function locate(
  files: readonly CodeFile[],
  read: (file: CodeFile) => string,
  tokens: readonly string[],
): LayerHome[] {
  if (tokens.length === 0) return [];
  const byLayer = new Map<string, Scored[]>();
  const exportsOf = new Map<string, { file: CodeFile; exports: CodeExport[] }>();
  for (const file of files) {
    let text: string;
    try {
      text = read(file);
    } catch {
      continue;
    }
    const exports = readExports(text);
    exportsOf.set(file.path, { file, exports });
    const scored = scoreFile(file, exports, tokens);
    if (scored === null) continue;
    const list = byLayer.get(file.layer) ?? [];
    list.push(scored);
    byLayer.set(file.layer, list);
  }
  const homes: LayerHome[] = [];
  for (const [layer, scored] of byLayer) {
    // A doc comment that mentions the words is not a home; a layer needs a named file or export.
    if (!scored.some((row) => row.score >= 10)) continue;
    const dirScore = new Map<string, number>();
    for (const row of scored) {
      const own = dirScore.get(row.dir) ?? (row.dir !== "" && covers(tokens, [wordSet(row.dir.replaceAll("/", " "))]) ? 40 : 0);
      dirScore.set(row.dir, own + row.score);
    }
    // A concept folder that names the words holds everything under it, so its subfolders count toward it.
    for (const [dir] of dirScore) {
      if (dir === "" || !covers(tokens, [wordSet(dir.replaceAll("/", " "))])) continue;
      let total = 0;
      for (const row of scored) if (isUnder(row.dir, dir)) total += row.score;
      dirScore.set(dir, Math.max(dirScore.get(dir)!, total + 40));
    }
    const [home] = [...dirScore].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]))[0]!;
    const ranked = [...scored].sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path));
    const hit = (row: Scored): FileHit => ({ path: row.file.path, score: row.score, exports: row.exports });
    const inside = ranked.filter((row) => isUnder(row.dir, home) && row.score >= 10);
    // A folder named for the concept is its home: everything in it belongs, matched or not.
    if (home !== "" && covers(tokens, [wordSet(home.replaceAll("/", " "))])) {
      const listed = new Set(inside.map((row) => row.file.path));
      for (const { file, exports } of exportsOf.values()) {
        if (file.layer !== layer || listed.has(file.path) || !isUnder(dirOf(file.rel), home)) continue;
        inside.push({ file, dir: dirOf(file.rel), score: 0, exports: exports.slice(0, 4), pathHit: false });
      }
    }
    const outside = ranked.filter((row) => !isUnder(row.dir, home) && (row.pathHit || row.score >= 10));
    const sample = inside[0] ?? ranked[0]!;
    const root = sample.file.path.slice(0, sample.file.path.length - sample.file.rel.length);
    const role = LAYER_ROLES[layer];
    homes.push({
      layer,
      ...(role === undefined ? {} : { role }),
      home: `${root}${home === "" ? "" : `${home}/`}`,
      files: inside.map(hit),
      elsewhere: outside.map(hit),
    });
  }
  return homes.sort((a, b) => layerRank(a.layer) - layerRank(b.layer) || a.layer.localeCompare(b.layer));
}

function fileLine(hit: FileHit, home: string, width: number): string {
  const name = hit.path.startsWith(home) ? hit.path.slice(home.length) : hit.path;
  const names = hit.exports.slice(0, 4).map((entry) => entry.name);
  const more = hit.exports.length > names.length ? ", ..." : "";
  const doc = hit.exports.find((entry) => entry.doc !== undefined)?.doc;
  const summary = doc === undefined ? "" : ` — ${doc.length > 80 ? `${doc.slice(0, 77)}...` : doc}`;
  return `  ${name.padEnd(width)}  ${names.join(", ")}${more}${summary}`;
}

/** Text answer: one block per layer naming its home folder, the files in it and stray pieces elsewhere. */
export function renderLocations(homes: readonly LayerHome[], perLayer = 6): string[] {
  const lines: string[] = [];
  for (const home of homes) {
    const label = home.role === undefined ? home.layer : `${home.layer} (${home.role})`;
    lines.push(`${label.padEnd(16)} ${home.home}`);
    const shown = home.files.slice(0, perLayer);
    const width = Math.min(36, Math.max(0, ...shown.map((hit) => hit.path.length - home.home.length)));
    for (const hit of shown) lines.push(fileLine(hit, home.home, width));
    const rest = home.files.slice(perLayer).map((hit) => hit.path.slice(home.home.length));
    if (rest.length > 0) lines.push(`  more: ${rest.slice(0, 16).join(", ")}${rest.length > 16 ? `, ... ${rest.length - 16} more` : ""}`);
    const stray = home.elsewhere.slice(0, 4);
    for (const hit of stray) lines.push(`  also ${fileLine(hit, "", 0).trimStart()}`);
    if (home.elsewhere.length > stray.length) lines.push(`  also ${home.elsewhere.length - stray.length} more files in ${home.layer}`);
  }
  return lines;
}
