import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export const manifestPath = join(repoRoot, "scripts", "export-manifest.json");

export const publishedPackages = [
  "core",
  "rapier",
  "ws",
  "sql",
  "navbake",
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

function targetString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidate = record.default ?? record.types;
    if (typeof candidate === "string") return candidate;
  }
  return undefined;
}

// Subpaths come from the files the build WILL emit (src filtered by each package's
// tsconfig.build.json), never from dist on disk: dist can be absent, partial or
// hold orphans from deleted sources, and any of those made the manifest drift.
export function exposedSubpathsForPackageDir(
  pkgDir: string,
  exportsMap: Record<string, unknown>,
): string[] {
  const emitted = emittedFilesForPackageDir(pkgDir);
  const subpaths = new Set<string>();
  for (const [key, value] of Object.entries(exportsMap)) {
    if (key.includes("*")) {
      const target = targetString(value);
      if (!target) continue;
      const bare = target.replace(/^\.\//, "").replace(/\.d\.ts$|\.js$/, "");
      const [prefix, suffix = ""] = bare.split("*");
      for (const file of emitted) {
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

/** Whether a package has been built; only tarball/pack checks need dist. */
export function distExists(pkg: PublishedPackage): boolean {
  try {
    return statSync(join(packageDir(pkg), "dist")).isDirectory();
  } catch {
    return false;
  }
}

export function computeExposedSubpaths(pkg: PublishedPackage): string[] {
  return exposedSubpathsForPackageDir(packageDir(pkg), readPackageJson(pkg).exports ?? {});
}

// The build's emit set, mirrored from tsconfig.build.json include/exclude/rootDir.

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

const defaultBuildTsconfig: BuildTsconfig = { include: ["src"], exclude: [], rootDir: "src" };

/** Package-relative `dist/<path>` (no extension) for every module the build emits. */
export function emittedFilesForPackageDir(pkgDir: string, cfg = readBuildTsconfig(pkgDir) ?? defaultBuildTsconfig): string[] {
  const rootDir = cfg.rootDir.replace(/^\.\//, "").replace(/\/+$/, "");
  return emittableSrcRelPaths(pkgDir, cfg)
    .map((srcRel) => {
      const withoutRoot = srcRel.startsWith(`${rootDir}/`) ? srcRel.slice(rootDir.length + 1) : srcRel;
      return `dist/${withoutRoot.replace(emittableExtensions, "")}`;
    })
    .sort();
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
