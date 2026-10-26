// One concept lives in one folder per layer (AGENTS.md "Layout"). This gate reads only what a branch
// changed, so it costs a few git calls, and fails two ways a concept gets scattered again:
//
//   1. an exported name the branch adds is already exported somewhere else (two `pickWeighted`s);
//   2. a file the branch adds or moves is named for a concept whose folder exists in that layer,
//      but sits outside it (`react/src/cameraShakeMeter.tsx` when `react/src/camera/` exists).
//
//   bun run check:concept-homes                    diff against origin/beta
//   bun run check:concept-homes --base <ref>       diff against another base
//   bun run check:concept-homes --all              report every duplicate export in the repo (exit 0)
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { declaredExport } from "../packages/jgengine/src/find/codeMap";
import { printHelpIfAsked, type Usage } from "./script-help";

export const DEFAULT_BASE = "origin/beta";
/** A file whose first lines carry this marker is exempt from the home-folder rule, with the reason. */
export const HOME_OK = "home-ok:";

const SOURCE = /\.tsx?$/;
const NOT_SOURCE = /\.(test|spec)\.tsx?$|\.d\.ts$|\.fixture\.|(^|\/)fixtures?\/|^packages\/jgengine\/src\/(templates|recipes\/snippets)\//;
/**
 * Where an exported name must be unique: engine packages, and the apps and scripts that could shadow
 * them. Games are products with their own conventions (`world`, `GameUI`); a game re-implementing an
 * engine primitive is `games:check-framework`'s job.
 */
const SCANNED = /^(packages\/[^/]+\/src|apps\/[^/]+|scripts)\//;
const SCOPE = ["packages/*/src/*.ts", "packages/*/src/*.tsx", "apps/*.ts", "apps/*.tsx", "scripts/*.ts"];
const ENGINE = /^packages\/[^/]+\/src\//;
/** Layer roots whose folders are concept homes. */
const LAYER_ROOT = /^(packages\/[^/]+\/src|apps\/[^/]+\/src)\//;

export interface Definition {
  name: string;
  file: string;
}

export interface Failure {
  rule: "duplicate-export" | "outside-home";
  file: string;
  detail: string;
}

function git(root: string, args: string[], allowExit1 = false): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0 && !(allowExit1 && result.status === 1)) {
    throw new Error(`git ${args.join(" ")}: ${(result.stderr ?? "").trim()}`);
  }
  return result.stdout ?? "";
}

export function isScannedSource(path: string): boolean {
  return SCANNED.test(path) && SOURCE.test(path) && !NOT_SOURCE.test(path);
}

/** Exported names on `+` lines of a unified diff, with the file each landed in. */
export function addedExports(diff: string): Definition[] {
  const found: Definition[] = [];
  let file: string | null = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const path = line.slice(4).replace(/^b\//, "").trim();
      file = path === "/dev/null" ? null : path;
      continue;
    }
    if (file === null || !line.startsWith("+") || !isScannedSource(file)) continue;
    const name = declaredExport(line.slice(1));
    if (name !== null) found.push({ name, file });
  }
  return found;
}

/** The namespace an export lives in: the engine as one scope, then one per app and one per script file. */
export function namespaceOf(file: string): string {
  if (ENGINE.test(file)) return "engine";
  const app = /^apps\/([^/]+)\//.exec(file);
  if (app !== null) return `apps/${app[1]}`;
  return file;
}

/**
 * Two definitions of one name clash when either is engine code: the engine has one owner per name, and
 * an app or script that redefines an engine export should import it. Two scripts may share a name.
 */
export function clashes(a: Definition, b: Definition): boolean {
  if (a.file === b.file) return false;
  const left = namespaceOf(a.file);
  const right = namespaceOf(b.file);
  return left === "engine" || right === "engine";
}

/** Every definition of these names in the working tree (tracked and untracked), from one `git grep`. */
export function definitionsOf(root: string, names: readonly string[]): Definition[] {
  if (names.length === 0) return [];
  const found: Definition[] = [];
  const unique = [...new Set(names)];
  for (let at = 0; at < unique.length; at += 200) {
    const group = unique.slice(at, at + 200).map((name) => name.replace(/\$/g, "\\$")).join("|");
    const pattern = `^export[[:space:]]+(declare[[:space:]]+)?(default[[:space:]]+)?(async[[:space:]]+)?(abstract[[:space:]]+)?(function\\*?|const|let|var|class|interface|type|enum|namespace)[[:space:]]+(${group})([^A-Za-z0-9_$]|$)`;
    const out = git(root, ["grep", "--untracked", "-I", "-n", "-E", pattern, "--", ...SCOPE], true);
    for (const line of out.split("\n")) {
      const match = /^([^:]+):\d+:(.*)$/.exec(line);
      if (match === null || !isScannedSource(match[1]!)) continue;
      const name = declaredExport(match[2]!);
      if (name !== null) found.push({ name, file: match[1]! });
    }
  }
  return found;
}

/** Duplicate-export failures for the names a branch added. */
export function duplicateFailures(added: readonly Definition[], everywhere: readonly Definition[]): Failure[] {
  const failures: Failure[] = [];
  const seen = new Set<string>();
  for (const definition of added) {
    const key = `${definition.name}\0${definition.file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const others = [...new Set(everywhere.filter((other) => other.name === definition.name && clashes(definition, other)).map((other) => other.file))];
    if (others.length === 0) continue;
    failures.push({
      rule: "duplicate-export",
      file: definition.file,
      detail: `exports \`${definition.name}\`, already exported by ${others.join(", ")}: keep one owner and import it`,
    });
  }
  return failures;
}

/** camelCase / PascalCase / kebab words of a file's base name, lowercased: `CameraShakeApplier` → camera, shake, applier. */
export function nameWords(path: string): string[] {
  const base = path.slice(path.lastIndexOf("/") + 1).replace(/\.(test|spec|browser\.test)?\.?tsx?$/, "").replace(/\.tsx?$/, "");
  return base
    .split(/[^A-Za-z0-9]+/)
    .flatMap((run) => run.split(/(?<=[a-z0-9])(?=[A-Z])/))
    .filter((word) => word !== "")
    .map((word) => word.toLowerCase());
}

/** Lowercased folder name → folder paths, for every folder under each layer root. */
export function layerFolders(paths: readonly string[]): Map<string, Map<string, Set<string>>> {
  const layers = new Map<string, Map<string, Set<string>>>();
  for (const path of paths) {
    const root = LAYER_ROOT.exec(path)?.[1];
    if (root === undefined) continue;
    const parts = path.slice(root.length + 1).split("/").slice(0, -1);
    const folders = layers.get(root) ?? new Map<string, Set<string>>();
    for (let depth = 0; depth < parts.length; depth += 1) {
      const key = parts[depth]!.toLowerCase();
      const set = folders.get(key) ?? new Set<string>();
      set.add(`${root}/${parts.slice(0, depth + 1).join("/")}`);
      folders.set(key, set);
    }
    layers.set(root, folders);
  }
  return layers;
}

/**
 * Where a new file belongs: the longest leading run of its name words that names a folder in its
 * layer. `cameraShakeMeter.tsx` in a layer with `camera/` belongs under `camera/`. A file directly at
 * the layer root named exactly like a folder is that folder's entry barrel and stays put.
 */
export function homeFor(path: string, layers: Map<string, Map<string, Set<string>>>): { concept: string; homes: string[] } | null {
  const root = LAYER_ROOT.exec(path)?.[1];
  if (root === undefined || /(^|\/)index\.tsx?$/.test(path)) return null;
  const folders = layers.get(root);
  if (folders === undefined) return null;
  const words = nameWords(path);
  const inside = path.slice(root.length + 1).split("/").slice(0, -1).map((part) => part.toLowerCase());
  for (let length = words.length; length >= 1; length -= 1) {
    const concept = words.slice(0, length).join("");
    const homes = folders.get(concept);
    if (homes === undefined) continue;
    if (inside.includes(concept)) return null;
    if (inside.length === 0 && length === words.length) return null;
    return { concept, homes: [...homes].sort() };
  }
  return null;
}

function exempt(root: string, path: string): boolean {
  try {
    return readFileSync(join(root, path), "utf8").slice(0, 600).includes(HOME_OK);
  } catch {
    return false;
  }
}

/** Home-folder failures for the files a branch added or moved. */
export function homeFailures(added: readonly string[], allPaths: readonly string[], isExempt: (path: string) => boolean = () => false): Failure[] {
  const layers = layerFolders(allPaths);
  const failures: Failure[] = [];
  for (const path of added) {
    if (!SOURCE.test(path) || path.endsWith(".d.ts")) continue;
    const home = homeFor(path, layers);
    if (home === null || isExempt(path)) continue;
    failures.push({
      rule: "outside-home",
      file: path,
      detail: `is named for \`${home.concept}\`, whose home is ${home.homes.map((dir) => `${dir}/`).join(" or ")}: move it there (or add \`// ${HOME_OK} <reason>\`)`,
    });
  }
  return failures;
}

function lines(text: string): string[] {
  return text.split("\n").map((line) => line.trim()).filter((line) => line !== "");
}

/** The branch's diff against `base` plus staged, unstaged and untracked work, with renames detected. */
export function branchDiff(root: string, base: string): { diff: string; added: string[] } {
  const diffs = [
    git(root, ["diff", "-M", "-U0", "--no-color", `${base}...HEAD`]),
    git(root, ["diff", "-M", "-U0", "--no-color", "--cached"]),
    git(root, ["diff", "-M", "-U0", "--no-color"]),
  ];
  const added = new Set<string>([
    ...lines(git(root, ["diff", "-M", "--name-only", "--diff-filter=AR", `${base}...HEAD`])),
    ...lines(git(root, ["diff", "-M", "--name-only", "--diff-filter=AR", "--cached"])),
  ]);
  const untracked = lines(git(root, ["ls-files", "--others", "--exclude-standard"]));
  for (const path of untracked) {
    added.add(path);
    if (!isScannedSource(path)) continue;
    let text: string;
    try {
      text = readFileSync(join(root, path), "utf8");
    } catch {
      continue;
    }
    diffs.push(`+++ b/${path}\n${text.split("\n").map((line) => `+${line}`).join("\n")}`);
  }
  return { diff: diffs.join("\n"), added: [...added].sort() };
}

export function runCheck(root: string, base: string): Failure[] {
  const { diff, added } = branchDiff(root, base);
  const exports = addedExports(diff);
  const everywhere = definitionsOf(root, exports.map((entry) => entry.name));
  const allPaths = [...lines(git(root, ["ls-files", "--", "packages/*/src/*", "apps/*/src/*"])), ...added];
  return [...duplicateFailures(exports, everywhere), ...homeFailures(added, allPaths, (path) => exempt(root, path))];
}

/** Every exported name in the repo that clashes, for a restructure worklist. */
export function reportAll(root: string): Map<string, string[]> {
  const pattern = "^export[[:space:]]+(declare[[:space:]]+)?(default[[:space:]]+)?(async[[:space:]]+)?(abstract[[:space:]]+)?(function\\*?|const|let|var|class|interface|type|enum|namespace)[[:space:]]+[A-Za-z_$]";
  const all: Definition[] = [];
  for (const line of lines(git(root, ["grep", "-I", "-n", "-E", pattern, "--", ...SCOPE], true))) {
    const match = /^([^:]+):\d+:(.*)$/.exec(line);
    if (match === null || !isScannedSource(match[1]!)) continue;
    const name = declaredExport(match[2]!);
    if (name !== null) all.push({ name, file: match[1]! });
  }
  const byName = new Map<string, Definition[]>();
  for (const definition of all) byName.set(definition.name, [...(byName.get(definition.name) ?? []), definition]);
  const report = new Map<string, string[]>();
  for (const [name, definitions] of byName) {
    const files = [...new Set(definitions.map((definition) => definition.file))];
    if (files.length < 2 || !definitions.some((definition) => namespaceOf(definition.file) === "engine")) continue;
    const engineClash = definitions.some((a) => definitions.some((b) => clashes(a, b)));
    if (engineClash) report.set(name, files.sort());
  }
  return new Map([...report].sort((a, b) => a[0].localeCompare(b[0])));
}

const USAGE: Usage = {
  summary: "fail when a branch adds an exported name that already exists, or a concept file outside its home folder",
  usage: "bun run check:concept-homes [--base <ref>] [--all]",
  flags: [
    { flag: "--base <ref>", detail: `diff against this ref instead of ${DEFAULT_BASE}` },
    { flag: "--all", detail: "report every clashing export in the repo instead (a worklist; exits 0)" },
  ],
  example: "bun run check:concept-homes --base origin/beta",
  exits: ["0 clean", "1 a duplicate export or a file outside its home", "2 bad flags or git failed"],
};

function main(argv: readonly string[]): number {
  if (printHelpIfAsked("check:concept-homes", USAGE, argv)) return 0;
  const root = fileURLToPath(new URL("..", import.meta.url));
  let base = DEFAULT_BASE;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base") {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) {
        console.error("check:concept-homes: --base needs a value");
        return 2;
      }
      base = value;
    } else if (arg !== "--all") {
      console.error(`check:concept-homes: unknown argument ${arg}`);
      return 2;
    }
  }
  try {
    if (argv.includes("--all")) {
      const report = reportAll(root);
      for (const [name, files] of report) console.log(`${name}\t${files.join("  ")}`);
      console.log(`concept-homes: ${report.size} exported names defined in more than one place (engine-wide)`);
      return 0;
    }
    const failures = runCheck(root, base);
    if (failures.length === 0) {
      console.log(`concept-homes ok: no duplicate export or stray concept file against ${base}`);
      return 0;
    }
    console.error(`check:concept-homes failed (AGENTS.md "Layout": one concept, one folder per layer):`);
    for (const failure of failures) console.error(`  ${failure.file} ${failure.detail}`);
    return 1;
  } catch (error) {
    console.error(`check:concept-homes: ${(error as Error).message}`);
    return 2;
  }
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
