/**
 * Shared staleness signal for built package `dist/`.
 *
 * Builds compile `src` into `dist` incrementally and in place. Three failure
 * modes leave a `dist` that *exists* but is wrong, and each one used to be
 * caught (or missed) by a different ad-hoc check:
 *   - never built            → dist dir absent            ("missing-dist")
 *   - interrupted / partial  → some src has no dist output ("missing-emit")
 *   - source changed post-build → dist older than its src  ("stale-emit")
 *
 * A single primitive here is consulted by every consumer that needs to know
 * whether a package's `dist` reflects current source: agent-bootstrap (as a
 * `--check` readiness signal and a pre-build clean trigger), ensure-ready
 * (the check-types preflight), and gen-export-manifest (an advisory warning).
 *
 * Correctness hinges on consulting each package's *build* tsconfig
 * (`tsconfig.build.json`) include/exclude so files the build never emits —
 * `editor` `src/mcp/cli.ts`, `jgengine` `src/recipes/snippets/*` (raw data /
 * build-excluded) — are not mistaken for missing output. A naive src→dist
 * inverse check false-positives on exactly those.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export type StaleKind = "missing-dist" | "missing-emit" | "stale-emit";

export interface DistStaleness {
  kind: StaleKind;
  /** Source file (relative to the package dir) that triggered the verdict. */
  sourcePath: string;
  /** One-line human-readable explanation. */
  detail: string;
}

const EMITTING_EXT = /\.(ts|tsx)$/;
const DECLARATION_EXT = /\.d\.ts$/;

/**
 * Tolerant JSON parse for tsconfig files (allows line and block comments and
 * trailing commas). String-aware: comment markers inside string values are
 * preserved — glob patterns such as a `src` double-star `test.ts` exclude embed
 * both block-comment open and close sequences and must survive parsing.
 */
function parseJsonc(text: string): unknown {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++; // skip the closing slash
      continue;
    }
    out += c;
  }
  const withoutTrailingCommas = out.replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(withoutTrailingCommas);
}

interface BuildTsconfig {
  compilerOptions?: { outDir?: string; rootDir?: string };
  include?: string[];
  exclude?: string[];
}

/**
 * Convert a tsconfig include/exclude glob into a matcher against a package-relative
 * POSIX path. `**` spans directories, `*`/`?` stay within a segment. A pattern
 * with no wildcard that names a directory also matches everything beneath it
 * (tsconfig directory-exclude semantics), e.g. `src/recipes/snippets`.
 */
function globToMatcher(pattern: string): (relPosix: string) => boolean {
  const normalized = pattern.replaceAll("\\", "/").replace(/\/+$/, "");
  let re = "";
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i]!;
    if (c === "*") {
      if (normalized[i + 1] === "*") {
        re += ".*";
        i++;
        if (normalized[i + 1] === "/") i++;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if ("+.^$()[]{}|\\".includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  const regex = new RegExp(`^${re}$`);
  return (relPosix) => regex.test(relPosix) || relPosix === normalized || relPosix.startsWith(`${normalized}/`);
}

function readBuildConfig(pkgDir: string): {
  rootDir: string;
  outDir: string;
  isExcluded: (relPosix: string) => boolean;
} | null {
  const buildTsconfig = join(pkgDir, "tsconfig.build.json");
  if (!existsSync(buildTsconfig)) return null;
  let config: BuildTsconfig;
  try {
    config = parseJsonc(readFileSync(buildTsconfig, "utf8")) as BuildTsconfig;
  } catch {
    return null;
  }
  const rootDir = join(pkgDir, config.compilerOptions?.rootDir ?? "src");
  const outDir = join(pkgDir, config.compilerOptions?.outDir ?? "dist");
  const matchers = (config.exclude ?? []).map(globToMatcher);
  return {
    rootDir,
    outDir,
    isExcluded: (relPosix) => matchers.some((match) => match(relPosix)),
  };
}

/** Absolute paths of source files the build would compile to `dist/*.js`. */
function emittingSources(pkgDir: string, rootDir: string, isExcluded: (relPosix: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const relPosix = relative(pkgDir, full).replaceAll("\\", "/");
      if (isExcluded(relPosix)) continue;
      if (entry.isDirectory()) {
        walk(full);
      } else if (EMITTING_EXT.test(entry.name) && !DECLARATION_EXT.test(entry.name)) {
        out.push(full);
      }
    }
  };
  walk(rootDir);
  return out;
}

/**
 * Return the first way a package's `dist` fails to reflect current source, or
 * `null` when `dist` is complete and fresh. Packages with no `tsconfig.build.json`
 * (nothing to emit to dist) return `null`.
 */
export function distStalenessForPackageDir(pkgDir: string): DistStaleness | null {
  const config = readBuildConfig(pkgDir);
  if (!config) return null;
  const { rootDir, outDir, isExcluded } = config;
  if (!existsSync(rootDir)) return null;

  if (!existsSync(outDir)) {
    return {
      kind: "missing-dist",
      sourcePath: relative(pkgDir, outDir),
      detail: `${relative(pkgDir, outDir)} does not exist — never built`,
    };
  }

  for (const src of emittingSources(pkgDir, rootDir, isExcluded)) {
    const distFile = join(outDir, relative(rootDir, src)).replace(EMITTING_EXT, ".js");
    const srcRel = relative(pkgDir, src).replaceAll("\\", "/");
    const distRel = relative(pkgDir, distFile).replaceAll("\\", "/");
    if (!existsSync(distFile)) {
      return {
        kind: "missing-emit",
        sourcePath: srcRel,
        detail: `${srcRel} has no compiled ${distRel} (partial/interrupted build)`,
      };
    }
    if (statSync(distFile).mtimeMs < statSync(src).mtimeMs) {
      return {
        kind: "stale-emit",
        sourcePath: srcRel,
        detail: `${srcRel} is newer than its compiled ${distRel} (dist predates source)`,
      };
    }
  }
  return null;
}

export interface PackageStaleness {
  pkg: string;
  dir: string;
  staleness: DistStaleness;
}

/**
 * Scan every buildable package under `packages/` (those with a
 * `tsconfig.build.json`) and return the ones whose `dist` is stale/incomplete.
 * Optionally restrict to `only` package directory names.
 */
export function scanStalePackages(repoRoot: string, only?: readonly string[]): PackageStaleness[] {
  const packagesDir = join(repoRoot, "packages");
  if (!existsSync(packagesDir)) return [];
  const out: PackageStaleness[] = [];
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (only && !only.includes(entry.name)) continue;
    const dir = join(packagesDir, entry.name);
    if (!existsSync(join(dir, "tsconfig.build.json"))) continue;
    const staleness = distStalenessForPackageDir(dir);
    if (staleness) out.push({ pkg: entry.name, dir, staleness });
  }
  return out;
}
