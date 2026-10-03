import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface PackageJson {
  name?: string;
  version?: string;
  type?: string;
  workspaces?: string[] | { packages: string[]; catalog?: Record<string, string>; catalogs?: Record<string, Record<string, string>> };
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
export function sdkVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const own = readPackageJson(join(here, "..", "package.json")) ?? readPackageJson(join(here, "..", "..", "package.json"));
  const pinned = own?.dependencies?.["@jgengine/assets"];
  return pinned !== undefined ? pinned.replace(/^[\^~]/, "") : cliVersion();
}

/** @internal */
export function pickPackageManager(preferred: string | undefined): string {
  if (preferred !== undefined) return preferred;
  const probe = spawnSync("bun", ["--version"], { stdio: "ignore", shell: process.platform === "win32" });
  return probe.status === 0 ? "bun" : "npm";
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
    const workspaces = pkg?.workspaces;
    return Array.isArray(workspaces) ? true : Array.isArray(workspaces?.packages);
  });
}

/** @internal */
export function resolveDependencyRange(
  projectDir: string,
  name: string,
  declared: string,
): { range: string | null; catalogSource?: string; error?: string } {
  if (!declared.startsWith("catalog:")) return { range: declared };
  const root = findWorkspaceRoot(projectDir);
  if (root === null) return { range: null, error: `${name}: ${declared} requires a workspace catalog` };
  const catalogName = declared.slice("catalog:".length);
  const catalogSource = `${join(root, "package.json")} workspaces.${catalogName === "" ? "catalog" : `catalogs.${catalogName}`}`;
  const workspaces = readPackageJson(join(root, "package.json"))?.workspaces;
  const record = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const catalogs: unknown = !Array.isArray(workspaces) ? workspaces?.catalogs : undefined;
  const catalog: unknown = catalogName === ""
    ? (!Array.isArray(workspaces) ? workspaces?.catalog : undefined)
    : (record(catalogs) ? catalogs[catalogName] : undefined);
  if (!record(catalog)) return { range: null, catalogSource, error: `${name}: missing or malformed ${catalogSource}` };
  const range = catalog[name];
  if (typeof range !== "string" || range.trim() === "" || range.startsWith("catalog:")) {
    return { range: null, catalogSource, error: `${name}: missing or malformed entry in ${catalogSource}` };
  }
  return { range, catalogSource };
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
