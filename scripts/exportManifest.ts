import { readdirSync, readFileSync, statSync } from "node:fs";
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

function distFilesWithoutExtension(pkgDir: string, distDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".js")) {
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

export function computeExposedSubpaths(pkg: PublishedPackage): string[] {
  const distDir = join(packageDir(pkg), "dist");
  if (!distExists(pkg)) {
    throw new Error(`dist missing for @jgengine/${pkg} — run \`bun run build\` before generating the export manifest`);
  }
  const exportsMap = readPackageJson(pkg).exports ?? {};
  const distFiles = distFilesWithoutExtension(packageDir(pkg), distDir);
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
