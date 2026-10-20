/**
 * Monorepo `@jgengine/*` imports resolve to package source, never dist.
 *
 * Bun (tests, scripts) and tsgo (check-types) both honor tsconfig `paths`, so one
 * map in tsconfig.base.json makes a fresh checkout or worktree testable and
 * type-checkable with no build. A tsconfig that declares its own `paths` replaces
 * the inherited map wholesale, so those configs carry the full generated set next
 * to their own aliases. Build configs (`tsconfig.build.json`) map only the package
 * itself so emitted dist keeps importing siblings by name.
 *
 * Published consumers are unaffected: tsconfig files are not in any package's
 * `files`, and package `exports` still point at dist.
 *
 *   bun scripts/sourcePaths.ts          # rewrite drifted configs
 *   bun scripts/sourcePaths.ts --check  # exit 1 and name each drifted config
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type Paths = Record<string, string[]>;

interface TsconfigJson {
  extends?: string;
  compilerOptions?: { paths?: Paths };
}

/** Workspace package dirs under packages/ that have a src tree, keyed by package name. */
export function sourcePackages(root = repoRoot): Map<string, string> {
  const out = new Map<string, string>();
  const base = join(root, "packages");
  for (const entry of readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const dir = join(base, entry.name);
    if (!existsSync(join(dir, "package.json")) || !existsSync(join(dir, "src"))) continue;
    const name = (JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name?: string }).name;
    if (name?.startsWith("@jgengine/")) out.set(name, dir);
  }
  return out;
}

function posixRel(from: string, to: string): string {
  const rel = relative(from, to).replaceAll("\\", "/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

/** The `@jgengine/*` → source entries for a tsconfig living in `configDir`. */
export function sourcePathEntries(configDir: string, root = repoRoot): Paths {
  const entries: Paths = {};
  for (const [name, dir] of sourcePackages(root)) {
    const src = posixRel(configDir, join(dir, "src"));
    if (existsSync(join(dir, "src", "index.ts"))) entries[name] = [`${src}/index.ts`];
    entries[`${name}/*`] = [`${src}/*`];
  }
  return entries;
}

function readTsconfig(path: string): TsconfigJson {
  return JSON.parse(readFileSync(path, "utf8")) as TsconfigJson;
}

/** `paths` in effect for a config, with the directory they resolve against. */
export function effectivePaths(path: string): { paths: Paths; dir: string } | undefined {
  const config = readTsconfig(path);
  if (config.compilerOptions?.paths) return { paths: config.compilerOptions.paths, dir: dirname(path) };
  if (!config.extends) return undefined;
  return effectivePaths(resolve(dirname(path), config.extends));
}

function isJgengineKey(key: string): boolean {
  return key.startsWith("@jgengine/");
}

/** Every workspace tsconfig the source map governs (relative to root). */
export function workspaceTsconfigs(root = repoRoot): string[] {
  const out = ["tsconfig.base.json", ...(existsSync(join(root, "tsconfig.json")) ? ["tsconfig.json"] : [])];
  for (const group of ["packages", "apps", "examples"]) {
    const base = join(root, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      for (const file of readdirSync(join(base, entry.name))) {
        if (/^tsconfig(\.[\w-]+)?\.json$/.test(file)) out.push(`${group}/${entry.name}/${file}`);
      }
    }
  }
  if (existsSync(join(root, "registry", "tsconfig.json"))) out.push("registry/tsconfig.json");
  return out.sort();
}

function sameEntries(actual: Paths, expected: Paths): boolean {
  const a = Object.keys(actual).filter(isJgengineKey).sort();
  const e = Object.keys(expected).sort();
  if (a.length !== e.length || a.some((key, i) => key !== e[i])) return false;
  return e.every((key) => JSON.stringify(actual[key]) === JSON.stringify(expected[key]));
}

export interface Drift {
  file: string;
  reason: string;
}

/** Configs whose `@jgengine/*` resolution would fall back to dist (or, for builds, pull in sibling source). */
export function findDrift(root = repoRoot): Drift[] {
  const drift: Drift[] = [];
  const packages = sourcePackages(root);
  for (const rel of workspaceTsconfigs(root)) {
    const path = join(root, rel);
    if (rel.endsWith("tsconfig.build.json")) {
      const own = readTsconfig(path);
      const self = [...packages].find(([, dir]) => resolve(dir) === resolve(dirname(path)))?.[0];
      const keys = Object.keys(own.compilerOptions?.paths ?? {}).filter(isJgengineKey);
      if (!own.compilerOptions?.paths) {
        drift.push({ file: rel, reason: "must declare its own `paths` (self only) so the build does not inherit sibling source" });
      } else if (keys.some((key) => self === undefined || !key.startsWith(self))) {
        drift.push({ file: rel, reason: `maps a sibling package (${keys.filter((key) => !self || !key.startsWith(self)).join(", ")}); builds must resolve siblings through dist` });
      }
      continue;
    }
    const effective = effectivePaths(path);
    if (!effective) {
      drift.push({ file: rel, reason: "no `paths` in effect — extend tsconfig.base.json" });
      continue;
    }
    if (!sameEntries(effective.paths, sourcePathEntries(effective.dir, root))) {
      drift.push({ file: rel, reason: "`@jgengine/*` paths differ from the generated source map" });
    }
  }
  return drift;
}

function renderPaths(paths: Paths, indent: string): string {
  const inner = `${indent}  `;
  const lines = Object.entries(paths).map(([key, value]) => `${inner}${JSON.stringify(key)}: ${JSON.stringify(value)}`);
  return `{\n${lines.join(",\n")}\n${indent}}`;
}

/** Replace the `paths` object in a tsconfig's text, keeping non-`@jgengine` aliases first. */
export function rewritePaths(text: string, configDir: string, root = repoRoot): string {
  const match = /^([ \t]*)"paths"\s*:\s*\{/m.exec(text);
  if (!match) return text;
  let i = match.index + match[0].length;
  for (let depth = 1; depth > 0; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") depth -= 1;
  }
  const current = (JSON.parse(text) as TsconfigJson).compilerOptions?.paths ?? {};
  const next: Paths = {};
  for (const [key, value] of Object.entries(current)) if (!isJgengineKey(key)) next[key] = value;
  Object.assign(next, sourcePathEntries(configDir, root));
  const indent = match[1] ?? "";
  return `${text.slice(0, match.index)}${indent}"paths": ${renderPaths(next, indent)}${text.slice(i)}`;
}

/** Rewrite every non-build config that declares its own `paths`. Returns the files changed. */
export function syncSourcePaths(root = repoRoot): string[] {
  const changed: string[] = [];
  for (const rel of workspaceTsconfigs(root)) {
    if (rel.endsWith("tsconfig.build.json")) continue;
    const path = join(root, rel);
    const text = readFileSync(path, "utf8");
    if (!readTsconfig(path).compilerOptions?.paths) continue;
    const next = rewritePaths(text, dirname(path), root);
    if (next !== text) {
      writeFileSync(path, next);
      changed.push(rel);
    }
  }
  return changed;
}

if (import.meta.main) {
  if (process.argv.includes("--check")) {
    const drift = findDrift();
    if (drift.length > 0) {
      console.error("tsconfig source paths drifted — run `bun scripts/sourcePaths.ts`:");
      for (const d of drift) console.error(`  - ${d.file}: ${d.reason}`);
      process.exit(1);
    }
    console.log("tsconfig source paths ok");
  } else {
    const changed = syncSourcePaths();
    console.log(changed.length ? `sourcePaths: rewrote ${changed.join(", ")}` : "sourcePaths: up to date");
    const drift = findDrift();
    for (const d of drift) console.error(`  - ${d.file}: ${d.reason}`);
    if (drift.length > 0) process.exit(1);
  }
}
