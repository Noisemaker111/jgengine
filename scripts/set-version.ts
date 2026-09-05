// Bump published package versions and keep every internal reference in step:
// packages/*/package.json versions, their `@jgengine/*` dependency ranges, and the
// `VERSION` mirror in packages/core/src/meta/changelog.ts.
//
//   bun run version:prerelease            # 0.14.0 -> 0.15.0-next.0, 0.15.0-next.0 -> 0.15.0-next.1
//   bun run version:prerelease -- --id rc # ...-rc.0
//   bun run version:release               # 0.15.0-next.2 -> 0.15.0 (stable, npm latest)
//   bun scripts/set-version.ts --check    # fail if anything is out of step
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PACKAGES = ["core", "rapier", "ws", "sql", "react", "convex", "node", "shell", "editor", "assets", "github", "jgengine"];
const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const check = args.includes("--check");
const release = args.includes("--release");
const patchRelease = args.includes("--patch");
const idIndex = args.indexOf("--id");
const preId = idIndex >= 0 ? args[idIndex + 1] : "next";

const manifestPath = (pkg: string) => `${root}packages/${pkg}/package.json`;

// --release finalizes a prerelease in place (0.15.0-next.2 -> 0.15.0); on an already-stable
// version it takes the next minor.
function nextRelease(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) throw new Error(`unparseable version: ${version}`);
  const [, major, minor, patch] = match;
  if (version.includes("-")) return `${major}.${minor}.${patch}`;
  return patchRelease ? `${major}.${minor}.${Number(patch) + 1}` : `${major}.${Number(minor) + 1}.0`;
}

function nextPrerelease(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
  if (!match) throw new Error(`unparseable version: ${version}`);
  const [, major, minor, patch, pre] = match;
  if (pre) {
    const parts = pre.split(".");
    const last = parts[parts.length - 1];
    if (parts[0] === preId && /^\d+$/.test(last)) {
      parts[parts.length - 1] = String(Number(last) + 1);
      return `${major}.${minor}.${patch}-${parts.join(".")}`;
    }
    return `${major}.${minor}.${patch}-${preId}.0`;
  }
  return `${major}.${Number(minor) + 1}.0-${preId}.0`;
}

const manifests = new Map(PACKAGES.map((pkg) => [pkg, JSON.parse(readFileSync(manifestPath(pkg), "utf8"))]));
const byName = new Map<string, string>();
const targets = new Map<string, string>();
for (const [pkg, manifest] of manifests) {
  const version = check
    ? manifest.version
    : release
      ? nextRelease(manifest.version)
      : nextPrerelease(manifest.version);
  targets.set(pkg, version);
  byName.set(manifest.name, version);
}

const drift: string[] = [];
for (const [pkg, manifest] of manifests) {
  const version = targets.get(pkg)!;
  if (manifest.version !== version) manifest.version = version;
  for (const field of ["dependencies", "peerDependencies", "devDependencies"] as const) {
    const deps = manifest[field];
    if (!deps) continue;
    for (const [name, range] of Object.entries(deps as Record<string, string>)) {
      const target = byName.get(name);
      if (!target || range.startsWith("workspace:")) continue;
      const want = `^${target}`;
      if (range === want) continue;
      if (check) drift.push(`packages/${pkg}/package.json ${field}.${name}: ${range} (expected ${want})`);
      deps[name] = want;
    }
  }
  if (!check) writeFileSync(manifestPath(pkg), `${JSON.stringify(manifest, null, 2)}\n`);
}

const mirrorPath = `${root}packages/core/src/meta/changelog.ts`;
const mirror = readFileSync(mirrorPath, "utf8");
const coreVersion = targets.get("core")!;
const mirrored = mirror.replace(/export const VERSION = "[^"]+";/, `export const VERSION = "${coreVersion}";`);
if (mirrored !== mirror) {
  if (check) drift.push(`packages/core/src/meta/changelog.ts VERSION is not ${coreVersion}`);
  else writeFileSync(mirrorPath, mirrored);
}

if (check) {
  if (drift.length > 0) {
    console.error(`set-version --check failed:\n${drift.map((d) => `  ${d}`).join("\n")}`);
    process.exit(1);
  }
  console.log("set-version ok: package versions, internal ranges, and the VERSION mirror agree.");
} else {
  console.log(PACKAGES.map((pkg) => `${manifests.get(pkg)!.name}@${targets.get(pkg)}`).join("\n"));
}
