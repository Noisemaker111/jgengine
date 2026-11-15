import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * The source reading `jgengine propose` needs, without a compiler: import specifiers, the names a
 * module exports (following its re-exports), and relative module resolution. Proposal files are
 * ordinary TypeScript, so a few patterns over comment-free text cover them.
 */

/** `text` with comments blanked to spaces (newlines kept), strings and template literals left intact. */
export function stripComments(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    const next = text[i + 1];
    if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") { out += " "; i += 1; }
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? text.length : end + 2;
      for (; i < stop; i += 1) out += text[i] === "\n" ? "\n" : " ";
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      out += ch;
      i += 1;
      while (i < text.length && text[i] !== ch) {
        if (text[i] === "\\") { out += text[i]!; i += 1; }
        if (i < text.length) { out += text[i]!; i += 1; }
        if (ch !== "`" && text[i - 1] === "\n") break;
      }
      if (i < text.length) { out += text[i]!; i += 1; }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** One import or re-export statement's module specifier and what it binds. */
export interface ImportRef {
  specifier: string;
  /** Names bound from the module (`default` for a default import); `*` for a namespace import or `export *`. */
  names: string[];
  /** Offset of the specifier's opening quote in the source. */
  at: number;
}

const FROM = /\b(import|export)\s+((?:type\s+)?(?:(?:[\w$]+\s*,\s*)?(?:\{[^}]*\}|\*(?:\s*as\s+[\w$]+)?)|[\w$]+))\s*from\s*(["'])([^"']+)\3/g;
const BARE = /\bimport\s*(["'])([^"']+)\1/g;
const DYNAMIC = /\bimport\(\s*(["'])([^"']+)\1\s*\)/g;

function boundNames(keyword: string, clause: string): string[] {
  const body = clause.replace(/^type\s+/, "").trim();
  const names: string[] = [];
  const braces = /\{([^}]*)\}/.exec(body);
  if (braces !== null) {
    for (const part of braces[1]!.split(",")) {
      const spec = part.trim().replace(/^type\s+/, "");
      if (spec.length === 0) continue;
      // `a as b`: an import binds `a` from the module; a re-export publishes `a` under `b`, but
      // either way the module itself must export `a`.
      names.push(spec.split(/\s+as\s+/)[0]!.trim());
    }
  }
  const outside = body.replace(/\{[^}]*\}/, "").split(",").map((part) => part.trim()).filter(Boolean);
  for (const part of outside) {
    if (part.startsWith("*")) names.push("*");
    else if (keyword === "import") names.push("default");
  }
  return names;
}

/** Every static and dynamic import and every `export ... from` in `text`. */
export function importRefs(text: string): ImportRef[] {
  const clean = stripComments(text);
  const refs: ImportRef[] = [];
  for (const match of clean.matchAll(FROM)) {
    const at = match.index! + match[0].length - match[4]!.length - 2;
    refs.push({ specifier: match[4]!, names: boundNames(match[1]!, match[2]!), at });
  }
  for (const match of clean.matchAll(BARE)) refs.push({ specifier: match[2]!, names: [], at: match.index! + match[0].indexOf(match[1]!) });
  for (const match of clean.matchAll(DYNAMIC)) refs.push({ specifier: match[2]!, names: ["*"], at: match.index! + match[0].indexOf(match[1]!) });
  return refs.sort((a, b) => a.at - b.at);
}

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".d.ts", ".mts", ".js", ".mjs", ".jsx"];

/** The file a relative specifier names from `fromFile`, or null when none exists. */
export function resolveRelative(fromFile: string, specifier: string): string | null {
  return resolveModulePath(resolve(dirname(fromFile), specifier));
}

/** `base` as a module: the file itself, with a source extension, or its index. */
export function resolveModulePath(base: string): string | null {
  const stems = [base];
  const js = /\.(?:[cm]?js|jsx)$/.exec(base);
  if (js !== null) stems.unshift(base.slice(0, -js[0].length));
  for (const stem of stems) {
    if (isFile(stem) && /\.[cm]?[jt]sx?$/.test(stem)) return stem;
    for (const ext of SOURCE_EXTENSIONS) if (isFile(stem + ext)) return stem + ext;
    for (const ext of SOURCE_EXTENSIONS) if (isFile(join(stem, `index${ext}`))) return join(stem, `index${ext}`);
  }
  return null;
}

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

const DECLARED = /\bexport\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\s*\*?|class|const\s+enum|const|let|var|type|interface|enum|namespace|module)\s+([A-Za-z_$][\w$]*)/g;
const LIST = /\bexport\s+(?:type\s+)?\{([^}]*)\}(\s*from\s*(["'])([^"']+)\3)?/g;
const STAR = /\bexport\s+(?:type\s+)?\*\s*(?:as\s+([A-Za-z_$][\w$]*)\s*)?from\s*(["'])([^"']+)\2/g;
const DEFAULT = /\bexport\s+default\b/;

/**
 * The names `file` exports, following its relative `export * from` re-exports. Bare re-exports
 * (another package) are not followed: a target's names are its own package's.
 */
export function exportedNames(file: string, seen: Set<string> = new Set()): Set<string> {
  const names = new Set<string>();
  if (seen.has(file) || !isFile(file)) return names;
  seen.add(file);
  const text = stripComments(readFileSync(file, "utf8"));
  for (const match of text.matchAll(DECLARED)) names.add(match[1]!);
  if (DEFAULT.test(text)) names.add("default");
  for (const match of text.matchAll(LIST)) {
    for (const part of match[1]!.split(",")) {
      const spec = part.trim().replace(/^type\s+/, "");
      if (spec.length === 0) continue;
      const pieces = spec.split(/\s+as\s+/);
      names.add((pieces[1] ?? pieces[0]!).trim());
    }
  }
  for (const match of text.matchAll(STAR)) {
    if (match[1] !== undefined) {
      names.add(match[1]);
      continue;
    }
    const specifier = match[3]!;
    if (!specifier.startsWith(".")) continue;
    const target = resolveRelative(file, specifier);
    if (target !== null) for (const name of exportedNames(target, seen)) if (name !== "default") names.add(name);
  }
  return names;
}

const SKIP_DIRS = new Set(["node_modules", "dist", "build", "out", "coverage"]);

/** Every file under `root` whose name matches `pattern`, skipping dependencies, builds and dot folders. */
export function walkFiles(root: string, pattern: RegExp): string[] {
  const found: string[] = [];
  const visit = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && pattern.test(entry.name)) found.push(path);
    }
  };
  if (existsSync(root)) visit(root);
  return found;
}

/** The nearest folder at or above `start` (and not above `stop`) holding a package.json. */
export function nearestPackageDir(start: string, stop: string): string {
  let dir = start;
  for (;;) {
    if (isFile(join(dir, "package.json"))) return dir;
    if (dir === stop) return stop;
    const parent = dirname(dir);
    if (parent === dir) return stop;
    dir = parent;
  }
}
