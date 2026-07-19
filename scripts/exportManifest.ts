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
