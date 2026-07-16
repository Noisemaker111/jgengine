import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface PackageJson {
  name?: string;
  version?: string;
  type?: string;
  workspaces?: string[];
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export type { PackageJson };

/** @internal */
export function readPackageJson(path: string): PackageJson | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

/** @internal */
export function cliVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const own = readPackageJson(join(here, "..", "package.json")) ?? readPackageJson(join(here, "..", "..", "package.json"));
  return own?.version ?? "0.0.0";
}

/** @internal */
export function findUp(startDir: string, predicate: (dir: string) => boolean): string | null {
  let dir = resolve(startDir);
  for (;;) {
    if (predicate(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** @internal */
export function findWorkspaceRoot(startDir: string): string | null {
  return findUp(startDir, (dir) => {
    const pkg = readPackageJson(join(dir, "package.json"));
    return Array.isArray(pkg?.workspaces);
  });
}

/** @internal */
export function isEngineMonorepo(rootDir: string): boolean {
  return existsSync(join(rootDir, "packages", "core", "src")) && existsSync(join(rootDir, "Games"));
}

/** @internal */
export function flag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

/** @internal */
export function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`);
}
