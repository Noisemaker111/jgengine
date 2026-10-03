import { join } from "node:path";
import { findUp, readPackageJson } from "./pkg";

/** @internal */
export function installedPackageVersion(dir: string, name: string): string | null {
  const root = findUp(dir, candidate => readPackageJson(join(candidate, "node_modules", name, "package.json")) !== null);
  const version = root === null ? undefined : readPackageJson(join(root, "node_modules", name, "package.json"))?.version;
  return typeof version === "string" ? version : null;
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
