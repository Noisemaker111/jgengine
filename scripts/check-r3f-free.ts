// react-three-fiber and drei are gone from the repo. The 3D layer is plain three.js objects under
// the engine-owned frame loop (`packages/core/src/frame/engineLoop.draw.ts`): a draw mounts through
// `useEngineDraw`/`EngineDrawMount` and reads the frame from its `EngineFrameState`. This fails on any
// `@react-three/*` import (type-only ones too: the packages are not installed), any `useFrame(` call,
// and any package.json that names an `@react-three/*` package.
//
//   bun run check r3f-free
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { printHelpIfAsked, type Usage } from "./script-help";

const R3F_SPECIFIER = /^@react-three\//;
/** Source roots. `scripts/` is left out: its tests hold import lines as string fixtures. */
const SOURCE_ROOTS = ["packages", "games", "apps", "registry", "examples"];
const SOURCE_FILE = /\.(tsx?|jsx?|mjs|cjs)$/;

const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:\\])\/\/.*$/gm, "$1");

const IMPORT_SPECIFIER = /\b(?:import|export)\s+(?:type\s+)?[^;"']*?\s+from\s*["']([^"']+)["']|\bimport\s*\(?\s*["']([^"']+)["']|\brequire\s*\(\s*["']([^"']+)["']/g;
const USE_FRAME_CALL = /(^|[^.\w$])useFrame\s*\(/;

/** What `source` still takes from react-three-fiber: `@react-three/*` specifiers and `useFrame(` calls. */
export function r3fUses(source: string): string[] {
  const code = withoutComments(source);
  const found: string[] = [];
  for (const match of code.matchAll(IMPORT_SPECIFIER)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier !== undefined && R3F_SPECIFIER.test(specifier)) found.push(`import of ${specifier}`);
  }
  if (USE_FRAME_CALL.test(code)) found.push("useFrame( call");
  return found;
}

/** The `@react-three/*` packages a package.json names in any dependency field. */
export function r3fDependencies(packageJson: string): string[] {
  const parsed: unknown = JSON.parse(packageJson);
  if (typeof parsed !== "object" || parsed === null) return [];
  const found: string[] = [];
  for (const [field, value] of Object.entries(parsed)) {
    if (!/dependencies$/i.test(field) && field !== "peerDependenciesMeta" && field !== "overrides" && field !== "resolutions") continue;
    if (typeof value !== "object" || value === null) continue;
    for (const name of Object.keys(value)) if (R3F_SPECIFIER.test(name)) found.push(`${field}: ${name}`);
  }
  return found;
}

export interface R3fViolation {
  file: string;
  what: string;
}

/** Scan the tracked and untracked files under `root` for anything still tied to react-three-fiber. */
export function scanR3fFree(root: string): { files: number; violations: R3fViolation[] } {
  const listed = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (listed.status !== 0) throw new Error(`git ls-files: ${listed.stderr}`);
  const paths = listed.stdout.split("\n").filter((path) => path.length > 0);
  const violations: R3fViolation[] = [];
  let files = 0;
  for (const file of paths) {
    const isManifest = /(^|\/)package\.json$/.test(file);
    const isSource = SOURCE_FILE.test(file) && SOURCE_ROOTS.some((dir) => file.startsWith(`${dir}/`));
    if (!isManifest && !isSource) continue;
    let source: string;
    try {
      source = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    files += 1;
    for (const what of isManifest ? r3fDependencies(source) : r3fUses(source)) violations.push({ file, what });
  }
  return { files, violations };
}

const USAGE: Usage = {
  summary: "fail when any source file imports @react-three/* or calls useFrame, or a package.json names an @react-three package",
  usage: "bun run check r3f-free",
  flags: [],
  example: "bun run check r3f-free",
  exits: ["0 clean", "1 something still uses react-three-fiber or drei"],
};

function main(argv: readonly string[]): number {
  if (printHelpIfAsked("check:r3f-free", USAGE, argv)) return 0;
  const root = fileURLToPath(new URL("..", import.meta.url));
  const { files, violations } = scanR3fFree(root);
  if (violations.length === 0) {
    console.log(`r3f-free ok: ${files} files scanned, no @react-three import, useFrame call or dependency`);
    return 0;
  }
  console.error("check:r3f-free failed:");
  for (const violation of violations) {
    console.error(`  ${violation.file}: ${violation.what} — draw three.js objects from an EngineDraw (useEngineDraw / EngineDrawMount) and read the frame from its EngineFrameState`);
  }
  return 1;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
