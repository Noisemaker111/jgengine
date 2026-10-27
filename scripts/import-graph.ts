// The repository's own import graph: which tracked source file imports which. `verify:fast`
// walks it backwards from the changed files, so a test, a type-check or a game boot runs
// when its own import closure reaches the change, and not merely because it lives in a
// package that depends on the changed one.
//
// Every edge errs wide. Type-only imports count (a type change can break a type-check, and
// with `verbatimModuleSyntax` an inline `type` specifier still loads the module), and an
// in-repo specifier this cannot resolve marks its importer `opaque`: a caller treats an
// opaque file as reaching everything, so a missed edge costs time, never a silent pass.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, posix as posixPath } from "node:path";

import { effectivePaths } from "./sourcePaths";

const PARSED = /\.[cm]?[jt]sx?$/;
const EXTENSIONS = ["", ".ts", ".tsx", ".mts", ".cts", ".d.ts", ".js", ".jsx", ".mjs", "/index.ts", "/index.tsx", "/index.js"];

export interface ImportGraph {
  /** Every tracked or untracked-but-not-ignored file, repo-relative with `/`. */
  files: ReadonlySet<string>;
  /** Source file -> the in-repo files it imports. */
  imports: ReadonlyMap<string, readonly string[]>;
  /** File -> the source files that import it. */
  importers: ReadonlyMap<string, readonly string[]>;
  /** Source file -> its in-repo specifiers that resolved to no file; see the header. */
  opaque: ReadonlyMap<string, readonly string[]>;
}

/** Import specifiers in a source file: static, type-only, dynamic, re-export and require forms. */
export function specifiers(text: string): string[] {
  const found: string[] = [];
  const pattern = /(?:^|[^\w$.])(?:import|export)\s*(?:[^"'();]*?\sfrom\s*)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']|require\s*\(\s*["']([^"']+)["']/g;
  for (const match of text.matchAll(pattern)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier !== undefined) found.push(specifier);
  }
  return found;
}

/** Tracked and untracked (not ignored) files: the tree a lane is about to push. */
export function repoFiles(root: string): string[] {
  const result = spawnSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ls-files: ${(result.stderr ?? "").trim()}`);
  return (result.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.includes("node_modules/"));
}

interface Alias {
  key: string;
  targets: string[];
}

interface WorkspacePackage {
  name: string;
  dir: string;
}

/** True for a specifier that names code in this repository rather than an npm dependency. */
function inRepoBare(specifier: string, packages: readonly WorkspacePackage[], aliases: readonly Alias[]): boolean {
  if (specifier.startsWith("@jgengine/") || specifier.startsWith("@games/") || specifier.startsWith("@/")) return true;
  if (packages.some((pkg) => specifier === pkg.name || specifier.startsWith(`${pkg.name}/`))) return true;
  return aliases.some((alias) => (alias.key.endsWith("/*") ? specifier.startsWith(alias.key.slice(0, -1)) : specifier === alias.key));
}

/**
 * Build the graph over `files`. `readText` is injectable for tests; `packages` names the
 * workspace packages so `@games/harbor-heat/...` and `@llmville/game/...` resolve.
 */
export function buildImportGraph(
  root: string,
  files: readonly string[],
  options: { readText?: (path: string) => string; packages?: readonly WorkspacePackage[]; tsconfigs?: ReadonlyMap<string, Alias[]> } = {},
): ImportGraph {
  const all = new Set(files);
  const readText = options.readText ?? ((path: string): string => readFileSync(join(root, path), "utf8"));
  const packages = [...(options.packages ?? [])].sort((a, b) => b.name.length - a.name.length);
  const aliasCache = new Map<string, Alias[]>(options.tsconfigs ?? []);

  /** The `paths` in effect for files under `dir`: the nearest tsconfig.json up the tree. */
  const aliasesFor = (dir: string): Alias[] => {
    const cached = aliasCache.get(dir);
    if (cached !== undefined) return cached;
    let found: Alias[];
    const config = dir === "" ? "tsconfig.base.json" : `${dir}/tsconfig.json`;
    if (all.has(config) || (options.tsconfigs === undefined && existsSync(join(root, config)))) {
      const effective = effectivePaths(join(root, config));
      found =
        effective === undefined
          ? []
          : Object.entries(effective.paths)
              .map(([key, targets]) => ({
                key,
                targets: targets.map((target) => posixPath.normalize(posixPath.join(relPosix(root, effective.dir), target))),
              }))
              .sort((a, b) => b.key.length - a.key.length);
    } else {
      found = dir === "" ? [] : aliasesFor(parentDir(dir));
    }
    aliasCache.set(dir, found);
    return found;
  };

  const firstFile = (base: string): string | undefined => {
    const clean = base.replace(/\/$/, "");
    for (const ext of EXTENSIONS) if (all.has(`${clean}${ext}`)) return `${clean}${ext}`;
    // ESM-style `./x.js` names the emitted file; the source beside it is `x.ts` or `x.d.ts`.
    const stem = clean.replace(/\.[cm]?jsx?$/, "");
    if (stem !== clean) for (const ext of [".ts", ".tsx", ".mts", ".cts", ".d.ts"]) if (all.has(`${stem}${ext}`)) return `${stem}${ext}`;
    return undefined;
  };

  /** A `paths` match: the file it names, `null` when the key matches but no file exists, or undefined when no key matches. */
  const throughAliases = (bare: string, aliases: readonly Alias[]): string | null | undefined => {
    for (const alias of aliases) {
      const wildcard = alias.key.endsWith("/*");
      if (wildcard ? !bare.startsWith(alias.key.slice(0, -1)) : alias.key !== bare) continue;
      const rest = wildcard ? bare.slice(alias.key.length - 1) : "";
      for (const target of alias.targets) {
        const file = firstFile(wildcard ? target.replace("*", rest) : target);
        if (file !== undefined) return file;
      }
      return null;
    }
    return undefined;
  };

  // A shared file (the UI registry) is compiled inside whichever program imports it, under that
  // program's `paths`, so a specifier its own directory cannot resolve tries every tsconfig's.
  let everyAlias: Alias[] | undefined;
  const allAliases = (): Alias[] => {
    if (everyAlias !== undefined) return everyAlias;
    const seen = new Map<string, Alias>();
    for (const file of all) {
      if (!/(^|\/)tsconfig(\.base)?\.json$/.test(file)) continue;
      for (const alias of aliasesFor(file.includes("/") ? posixPath.dirname(file) : "")) seen.set(`${alias.key} => ${alias.targets.join("|")}`, alias);
    }
    everyAlias = [...seen.values()].sort((a, b) => b.key.length - a.key.length);
    return everyAlias;
  };

  const resolveOne = (specifier: string, from: string): { file?: string | undefined; inRepo: boolean } => {
    const bare = specifier.replace(/[?#].*$/, "");
    if (bare.startsWith(".")) {
      const file = firstFile(posixPath.normalize(posixPath.join(posixPath.dirname(from), bare)));
      return { file, inRepo: true };
    }
    const aliases = aliasesFor(posixPath.dirname(from) === "." ? "" : posixPath.dirname(from));
    const own = throughAliases(bare, aliases);
    if (typeof own === "string") return { file: own, inRepo: true };
    for (const pkg of packages) {
      if (bare !== pkg.name && !bare.startsWith(`${pkg.name}/`)) continue;
      const rest = bare.slice(pkg.name.length + 1);
      const candidates = rest.length === 0 ? [`${pkg.dir}/src/index`, `${pkg.dir}/index`] : [`${pkg.dir}/src/${rest}`, `${pkg.dir}/${rest}`];
      for (const candidate of candidates) {
        const file = firstFile(candidate);
        if (file !== undefined) return { file, inRepo: true };
      }
    }
    const any = throughAliases(bare, allAliases());
    if (typeof any === "string") return { file: any, inRepo: true };
    return { inRepo: own === null || any === null || inRepoBare(bare, packages, aliases) };
  };

  const imports = new Map<string, string[]>();
  const importers = new Map<string, string[]>();
  const opaque = new Map<string, string[]>();
  for (const file of files) {
    if (!PARSED.test(file)) continue;
    let text: string;
    try {
      text = readText(file);
    } catch {
      continue;
    }
    const targets = new Set<string>();
    for (const specifier of specifiers(text)) {
      const resolved = resolveOne(specifier, file);
      if (resolved.file !== undefined) targets.add(resolved.file);
      else if (resolved.inRepo && !/\.(css|svg|png|jpe?g|webp|gif|glb|gltf|bin|hdr|exr|ktx2|wasm|mp3|ogg|wav|ttf|otf|woff2?|txt|md)$/i.test(specifier.replace(/[?#].*$/, ""))) {
        opaque.set(file, [...(opaque.get(file) ?? []), specifier]);
      }
    }
    const list = [...targets].sort();
    imports.set(file, list);
    for (const target of list) {
      const into = importers.get(target);
      if (into === undefined) importers.set(target, [file]);
      else into.push(file);
    }
  }
  return { files: all, imports, importers, opaque };
}

/** Every file whose import closure contains one of `seeds`, the seeds included. */
export function reverseReach(graph: ImportGraph, seeds: Iterable<string>): Set<string> {
  const reached = new Set<string>();
  const queue = [...seeds];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (reached.has(file)) continue;
    reached.add(file);
    for (const importer of graph.importers.get(file) ?? []) if (!reached.has(importer)) queue.push(importer);
  }
  return reached;
}

/** Every file `entry` imports, directly or not, `entry` included. */
export function closure(graph: ImportGraph, entries: Iterable<string>): Set<string> {
  const reached = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (reached.has(file)) continue;
    reached.add(file);
    for (const target of graph.imports.get(file) ?? []) if (!reached.has(target)) queue.push(target);
  }
  return reached;
}

function parentDir(dir: string): string {
  const parent = posixPath.dirname(dir);
  return parent === "." ? "" : parent;
}

function relPosix(root: string, path: string): string {
  const normalRoot = root.replaceAll("\\", "/").replace(/\/$/, "");
  const normal = path.replaceAll("\\", "/");
  if (normal === normalRoot) return "";
  return normal.startsWith(`${normalRoot}/`) ? normal.slice(normalRoot.length + 1) : normal;
}

