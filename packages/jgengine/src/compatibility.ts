import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { readPackageJson } from "./pkg";

/** @internal */
export const LOCKSTEP_SDK_PACKAGES: readonly string[] = [
  "@jgengine/core", "@jgengine/rapier", "@jgengine/react", "@jgengine/ws", "@jgengine/node",
  "@jgengine/sql", "@jgengine/convex", "@jgengine/shell", "@jgengine/editor", "@jgengine/assets", "@jgengine/navbake",
];

/** @internal */
export function inspectInstalledPackageVersion(dir: string, name: string): { version: string | null; error?: string } {
  let current = resolve(dir);
  for (;;) {
    const file = join(current, "node_modules", name, "package.json");
    if (existsSync(file)) {
      const pkg = readPackageJson(file);
      if (pkg === null || typeof pkg.version !== "string" || pkg.version === "") return { version: null, error: `${file}: invalid installed package metadata` };
      return { version: pkg.version };
    }
    const parent = dirname(current);
    if (parent === current) return { version: null };
    current = parent;
  }
}

/** @internal */
export function installedPackageVersion(dir: string, name: string): string | null {
  return inspectInstalledPackageVersion(dir, name).version;
}

/** @internal */
export function installedSdkVersions(dir: string): { name: string; version: string }[] {
  const pkg = readPackageJson(join(dir, "package.json"));
  return Object.keys({ ...pkg?.dependencies, ...pkg?.devDependencies })
    .filter(name => name.startsWith("@jgengine/") && name !== "@jgengine/github")
    .flatMap(name => {
      const version = installedPackageVersion(dir, name);
      return version === null ? [] : [{ name, version }];
    });
}

/** @internal */
export function sdkMinorNewer(installed: string, supported: string): boolean {
  const a = /^(\d+)\.(\d+)\./.exec(installed);
  const b = /^(\d+)\.(\d+)\./.exec(supported);
  return a !== null && b !== null && (Number(a[1]) > Number(b[1]) || (a[1] === b[1] && Number(a[2]) > Number(b[2])));
}

/** @internal */
export function versionNewer(installed: string, incoming: string): boolean {
  const parse = (value: string) => /^(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?(?:\+[\w.-]+)?$/.exec(value);
  const a = parse(installed);
  const b = parse(incoming);
  if (a === null || b === null) throw new Error("invalid skill version metadata");
  for (let index = 1; index <= 3; index++) {
    if (Number(a[index]) !== Number(b[index])) return Number(a[index]) > Number(b[index]);
  }
  if (a[4] === b[4]) return false;
  if (a[4] === undefined) return true;
  if (b[4] === undefined) return false;
  const left = a[4].split(".");
  const right = b[4].split(".");
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const x = left[index];
    const y = right[index];
    if (x === y) continue;
    if (x === undefined) return false;
    if (y === undefined) return true;
    const numericX = /^\d+$/.test(x);
    const numericY = /^\d+$/.test(y);
    return numericX && numericY ? Number(x) > Number(y) : numericX !== numericY ? !numericX : x > y;
  }
  return false;
}
