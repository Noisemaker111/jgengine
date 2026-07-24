/**
 * Write curated named `exports` into packages/{core,shell,react}/package.json from
 * scripts/public-exports.json, keeping `"./*"` as the last escape-hatch entry.
 *
 *   bun scripts/sync-package-exports.ts
 *   bun scripts/sync-package-exports.ts --check
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const PUBLIC = join(root, "scripts/public-exports.json");
const check = process.argv.includes("--check");

type ExportMap = Record<string, { types: string; default: string }>;

function distEntry(sub: string): { types: string; default: string } {
  if (sub === ".") {
    return { types: "./dist/index.d.ts", default: "./dist/index.js" };
  }
  // Prefer bare file; if a package uses index folders (shell weather/camera), callers use those paths.
  const bare = sub.slice(2); // strip ./
  return {
    types: `./dist/${bare}.d.ts`,
    default: `./dist/${bare}.js`,
  };
}

/** Shell uses index barrels for weather/ and camera/. */
function shellDistEntry(sub: string): { types: string; default: string } {
  if (sub === "./weather" || sub === "./camera") {
    const bare = sub.slice(2);
    return { types: `./dist/${bare}/index.d.ts`, default: `./dist/${bare}/index.js` };
  }
  return distEntry(sub);
}

function pkgDir(name: string): string {
  return join(root, "packages", name.replace("@jgengine/", ""));
}

function syncPackage(pkgName: string, subs: string[], entryFn: (s: string) => { types: string; default: string }): boolean {
  const path = join(pkgDir(pkgName), "package.json");
  const pkg = JSON.parse(readFileSync(path, "utf8")) as { exports?: ExportMap & { "./*"?: unknown } };
  const next: ExportMap = {};
  for (const sub of subs) {
    next[sub] = entryFn(sub);
  }
  // Escape hatch last — Node picks the first matching condition; explicit names win over "./*".
  const merged = {
    ...next,
    "./*": {
      types: "./dist/*.d.ts",
      default: "./dist/*.js",
    },
  };
  const before = JSON.stringify(pkg.exports ?? null);
  pkg.exports = merged as typeof pkg.exports;
  const after = JSON.stringify(pkg.exports);
  if (before === after) return false;
  if (check) {
    console.error(`${pkgName}: package.json exports out of sync with scripts/public-exports.json — run bun scripts/sync-package-exports.ts`);
    return true;
  }
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`updated ${pkgName} exports (${subs.length} named + ./*)`);
  return false;
}

const publicExports = JSON.parse(readFileSync(PUBLIC, "utf8")) as Record<string, string[]>;
let dirty = false;
dirty = syncPackage("@jgengine/core", publicExports["@jgengine/core"] ?? [], distEntry) || dirty;
dirty = syncPackage("@jgengine/shell", publicExports["@jgengine/shell"] ?? [], shellDistEntry) || dirty;
dirty = syncPackage("@jgengine/react", publicExports["@jgengine/react"] ?? [], distEntry) || dirty;

if (check && dirty) process.exit(1);
if (check) console.log("sync-package-exports: package.json exports match public-exports.json");
