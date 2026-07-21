import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export const manifestPath = join(repoRoot, "scripts", "export-manifest.json");

export const publishedPackages = [
  "core",
  "ws",
  "sql",
  "react",
  "convex",
  "node",
  "shell",
  "editor",
  "assets",
  "github",
  "jgengine",
] as const;

export type PublishedPackage = (typeof publishedPackages)[number];

interface PackageJson {
  name: string;
  exports?: Record<string, unknown>;
}

const forbiddenSubpathPattern = /(^|\/)(testFixtures|testkit)(\/|$)|\.test$/;

export function isForbiddenSubpath(subpath: string): boolean {
  return forbiddenSubpathPattern.test(subpath.replace(/^\.\//, ""));
}

export function packageDir(pkg: PublishedPackage): string {
  return join(repoRoot, "packages", pkg);
}

export function readPackageJson(pkg: PublishedPackage): PackageJson {
  return JSON.parse(readFileSync(join(packageDir(pkg), "package.json"), "utf8")) as PackageJson;
}

// A dist/*.js file is a real public subpath only when a source file still
// produces it. Builds compile in place without pruning dist, so a deleted or
// renamed source leaves an orphaned dist/*.js behind. Reading dist as the sole
// source of truth would then report that orphan as a live public subpath,
// masking the removal. Cross-checking each dist entry against src keeps the
// manifest deterministic and free of these phantoms without an rm -rf rebuild.
const sourceExtensions = [".ts", ".tsx"] as const;

function hasSourceCounterpart(srcDir: string, relWithoutExtension: string): boolean {
  return sourceExtensions.some((extension) => existsSync(join(srcDir, `${relWithoutExtension}${extension}`)));
}

function distFilesWithoutExtension(pkgDir: string, distDir: string, srcDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".js")) {
        const relToDist = relative(distDir, full).slice(0, -".js".length).replaceAll("\\", "/");
        if (!hasSourceCounterpart(srcDir, relToDist)) continue;
        out.push(relative(pkgDir, full).slice(0, -".js".length).replaceAll("\\", "/"));
      }
    }
  };
  walk(distDir);
  return out;
}

function targetString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidate = record.default ?? record.types;
    if (typeof candidate === "string") return candidate;
  }
  return undefined;
}

export function distExists(pkg: PublishedPackage): boolean {
  try {
    return statSync(join(packageDir(pkg), "dist")).isDirectory();
  } catch {
    return false;
  }
}

// Directory-based core so the src/dist cross-check is testable against a
// temp fixture without depending on a real package's mutable dist output.
export function exposedSubpathsForPackageDir(
  pkgDir: string,
  exportsMap: Record<string, unknown>,
): string[] {
  const distFiles = distFilesWithoutExtension(pkgDir, join(pkgDir, "dist"), join(pkgDir, "src"));
  const subpaths = new Set<string>();
  for (const [key, value] of Object.entries(exportsMap)) {
    if (key.includes("*")) {
      const target = targetString(value);
      if (!target) continue;
      const bare = target.replace(/^\.\//, "").replace(/\.d\.ts$|\.js$/, "");
      const [prefix, suffix = ""] = bare.split("*");
      for (const file of distFiles) {
        if (file.startsWith(prefix) && file.endsWith(suffix)) {
          const captured = file.slice(prefix.length, file.length - suffix.length);
          subpaths.add(key.replace("*", captured));
        }
      }
    } else {
      subpaths.add(key);
    }
  }
  return [...subpaths].sort();
}

export function computeExposedSubpaths(pkg: PublishedPackage): string[] {
  if (!distExists(pkg)) {
    throw new Error(`dist missing for @jgengine/${pkg} — run \`bun run build\` before generating the export manifest`);
  }
  return exposedSubpathsForPackageDir(packageDir(pkg), readPackageJson(pkg).exports ?? {});
}

// --- Stale/partial dist detection (advisory only) -------------------------
//
// The manifest reads `dist/*.js` as the source of truth, so generating before a
// full package build silently omits new subpaths: a fresh `src/foo.ts` with no
// `dist/foo.js` yet just does not appear, and the drift only surfaces later on a
// fully-built (often unrelated) branch. A naive src->dist inverse check
// false-positives on sources the build deliberately does not emit 1:1 (e.g.
// `editor` `src/mcp/*` and `jgengine` `src/recipes/snippets/*`). We therefore
// mirror exactly what the build emits by consulting each package's
// `tsconfig.build.json` `include`/`exclude`/`rootDir`, so a fully-built tree
// produces zero false positives while a partial dist is named loudly.

interface BuildTsconfig {
  include: string[];
  exclude: string[];
  rootDir: string;
}

export function readBuildTsconfig(pkgDir: string): BuildTsconfig | undefined {
  let parsed: { compilerOptions?: { rootDir?: string }; include?: string[]; exclude?: string[] };
  try {
    parsed = JSON.parse(readFileSync(join(pkgDir, "tsconfig.build.json"), "utf8")) as typeof parsed;
  } catch {
    return undefined;
  }
  return {
    include: parsed.include ?? ["src"],
    exclude: parsed.exclude ?? [],
    rootDir: parsed.compilerOptions?.rootDir ?? "src",
  };
}

// Convert one TypeScript `exclude` entry to a matcher against a posix path
// relative to the package dir. Handles the shapes these configs actually use:
// a literal file path, a bare directory (excludes everything under it), and
// `**`/`*`/`?` globs. Tokenized rather than chained string replaces so the
// glob wildcards never collide with each other's output.
function excludeEntryTester(pattern: string): (relPath: string) => boolean {
  const clean = pattern.replace(/^\.\//, "").replace(/\/+$/, "");
  if (!/[*?]/.test(clean)) {
    return (relPath) => relPath === clean || relPath.startsWith(`${clean}/`);
  }
  let source = "";
  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i] as string;
    if (char === "*") {
      if (clean[i + 1] === "*") {
        i += 1;
        if (clean[i + 1] === "/") {
          i += 1;
          source += "(?:.*/)?"; // `**/` matches zero or more leading directories
        } else {
          source += ".*"; // `**` matches across directory separators
        }
      } else {
        source += "[^/]*"; // `*` matches within a single path segment
      }
    } else if (char === "?") {
      source += "[^/]";
    } else if (/[.+^${}()|[\]\\]/.test(char)) {
      source += `\\${char}`;
    } else {
      source += char;
    }
  }
  const re = new RegExp(`^${source}$`);
  return (relPath) => re.test(relPath);
}

function excludeTester(patterns: string[]): (relPath: string) => boolean {
  const testers = patterns.map(excludeEntryTester);
  return (relPath) => testers.some((test) => test(relPath));
}

const emittableExtensions = /\.(ts|tsx)$/;

function emittableSrcRelPaths(pkgDir: string, cfg: BuildTsconfig): string[] {
  const isExcluded = excludeTester(cfg.exclude);
  const out: string[] = [];
  const rel = (full: string): string => relative(pkgDir, full).replaceAll("\\", "/");
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const relPath = rel(full);
      if (isExcluded(relPath)) continue;
      if (entry.isDirectory()) {
        walk(full);
      } else if (emittableExtensions.test(entry.name) && !entry.name.endsWith(".d.ts")) {
        out.push(relPath);
      }
    }
  };
  for (const include of cfg.include) {
    const full = join(pkgDir, include);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walk(full);
    } else if (emittableExtensions.test(include) && !include.endsWith(".d.ts")) {
      const relPath = rel(full);
      if (!isExcluded(relPath)) out.push(relPath);
    }
  }
  return out;
}

// Directory-based core so the staleness signal is testable against a temp
// fixture without depending on a real package's mutable dist output.
export function missingDistFilesForPackageDir(pkgDir: string, cfg: BuildTsconfig): string[] {
  const rootDir = cfg.rootDir.replace(/^\.\//, "").replace(/\/+$/, "");
  const missing: string[] = [];
  for (const srcRel of emittableSrcRelPaths(pkgDir, cfg)) {
    const withoutRoot = srcRel.startsWith(`${rootDir}/`) ? srcRel.slice(rootDir.length + 1) : srcRel;
    const distRel = `${withoutRoot.replace(emittableExtensions, "")}.js`;
    if (!existsSync(join(pkgDir, "dist", distRel))) missing.push(distRel);
  }
  return missing.sort();
}

export interface StalePackage {
  package: string;
  missing: string[];
}

// Packages whose dist is present but missing built output the build config says
// it should emit. Fully-missing dist is deliberately skipped here — that case is
// already loud via `computeExposedSubpaths` throwing.
export function stalePackages(): StalePackage[] {
  const stale: StalePackage[] = [];
  for (const pkg of publishedPackages) {
    if (!distExists(pkg)) continue;
    const cfg = readBuildTsconfig(packageDir(pkg));
    if (!cfg) continue;
    const missing = missingDistFilesForPackageDir(packageDir(pkg), cfg);
    if (missing.length > 0) stale.push({ package: readPackageJson(pkg).name, missing });
  }
  return stale;
}

const MAX_LISTED_MISSING = 5;

export function formatStaleWarning(stale: StalePackage[]): string {
  const lines = [
    "WARNING: export manifest generated against a stale/partial dist.",
    "These packages have source files with no built output yet — their new subpaths will be silently omitted until you rebuild:",
  ];
  for (const { package: name, missing } of stale) {
    const shown = missing.slice(0, MAX_LISTED_MISSING).join(", ");
    const more = missing.length > MAX_LISTED_MISSING ? ` (+${missing.length - MAX_LISTED_MISSING} more)` : "";
    lines.push(`  - ${name}: ${shown}${more}`);
  }
  lines.push("Run `bun run build` (or `bun run agent:bootstrap`) before generating the manifest.");
  return lines.join("\n");
}

// Advisory only: prints a loud warning to stderr and never throws or exits.
export function warnIfStaleDist(logger: (message: string) => void = console.error): boolean {
  const stale = stalePackages();
  if (stale.length === 0) return false;
  logger(formatStaleWarning(stale));
  return true;
}

export function computeManifest(): Record<string, string[]> {
  const manifest: Record<string, string[]> = {};
  for (const pkg of publishedPackages) {
    manifest[readPackageJson(pkg).name] = computeExposedSubpaths(pkg);
  }
  return manifest;
}

export function readManifest(): Record<string, string[]> {
  return JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, string[]>;
}

export function serializeManifest(manifest: Record<string, string[]>): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
