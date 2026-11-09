// Runtime react-three-fiber imports in the draw layer and in games. The migration off r3f keeps
// a shrinking allowlist of files that still legitimately render through it: the r3f host itself,
// nested preview canvases, dual-host JSX bridges (`<Html>` while r3f owns a canvas), and compat
// hooks awaiting their last consumers. Every other `.draw` file and every game file must mount
// draws through `useEngineDraw`/`EngineDrawMount` and read the frame through `useEngineHost`.
//
// A file leaves the allowlist when its r3f path is deleted; the check fails on a stale entry, so
// the list can only shrink. Type-only imports (`import type`, `import { type X }`) are erased at
// compile time and always allowed — they name JSX intrinsics, not a runtime dependency.
//
//   bun run check r3f-free
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { printHelpIfAsked, type Usage } from "./script-help";

/**
 * Files still allowed a *value* import of `@react-three/fiber` or `@react-three/drei`, as
 * repo-relative paths. Delete the entry when the file's r3f path goes away.
 */
export const R3F_FREE_ALLOWLIST: ReadonlySet<string> = new Set([
  // The r3f host itself and its frame facade — the bridge every dual-host file stands on.
  "packages/core/src/frame/frameBoardPump.draw.tsx",
  "packages/core/src/frame/r3fEngineHost.draw.tsx",
  // Nested preview canvases: their own r3f root, host provided inside.
  "packages/core/src/render/EntityPreview.draw.tsx",
  "packages/core/src/generator/GeneratorVariantGrid.draw.tsx",
  // Dual-host JSX bridges: `<Html>` overlays that render through r3f only while it owns a canvas.
  "packages/core/src/hud/hudOverlay.draw.tsx",
  "packages/core/src/item/WorldItems.draw.tsx",
  "packages/core/src/devtools/CollisionDebugWorld.draw.tsx",
  "packages/core/src/map/pingBeacons.draw.tsx",
  // Devtools split: the R3F half of frame telemetry / perf overlay reads r3f's store.
  "packages/core/src/devtools/FrameTelemetry.draw.tsx",
  "packages/core/src/devtools/perfOverlay.draw.tsx",
  // Compat hooks kept for editor/dev-demo consumers until those canvases port.
  "packages/core/src/material/authoredSurfaceMaterial.draw.tsx",
  "packages/core/src/material/materialAsset.draw.tsx",
  "packages/core/src/material/surfaceScanTextures.draw.ts",
  "packages/core/src/model/useModelInstance.draw.ts",
  "packages/core/src/scene/useDecalTexture.draw.ts",
  "packages/core/src/lod/impostor.draw.ts",
  // Games: dual-host components keeping their r3f branch, and dev/preview routes on their own canvas.
  "games/llmville/src/scene/components/SceneModel.tsx",
  "games/llmville/src/user/components/PlayerCharacterFigure.tsx",
  "games/llmville/src/user/components/CharacterCustomizeViewport.tsx",
  "games/llmville/src/user/components/CharacterDevPreview.tsx",
  "games/llmville/src/routes/dev.racks.tsx",
]);

const R3F_SPECIFIER = /^@react-three\/(fiber|drei)(\/|$)/;
const SOURCE_GLOBS = ["packages/core/src", "packages/shell/src", "games"];
const EXEMPT = /\.(test|spec)\.tsx?$|\.d\.ts$/;

const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:\\])\/\/.*$/gm, "$1");

/** One import statement's clause text and specifier, comments already blanked. */
const IMPORT_STATEMENT = /\bimport\s+(type\s+)?([^;]*?)\s+from\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']/g;

/** True when every named binding in an import clause is `type`-marked (or there are none). */
function clauseIsTypeOnly(clause: string): boolean {
  const named = /\{([^}]*)\}/.exec(clause)?.[1];
  if (named === undefined) return false; // default or namespace import is a value binding
  const bindings = named.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
  return bindings.every((part) => part.startsWith("type "));
}

/** Value imports of `@react-three/*` in `source`, as specifiers. */
export function r3fValueImports(source: string): string[] {
  const found: string[] = [];
  for (const match of withoutComments(source).matchAll(IMPORT_STATEMENT)) {
    const specifier = match[3] ?? match[4];
    if (specifier === undefined || !R3F_SPECIFIER.test(specifier)) continue;
    if (match[1] !== undefined || (match[2] !== undefined && clauseIsTypeOnly(match[2]))) continue;
    found.push(specifier);
  }
  return found;
}

export interface R3fViolation {
  file: string;
  specifier: string;
}

/** Scan the tracked and untracked source under `root` for r3f value imports outside the allowlist. */
export function scanR3fFree(root: string): { files: number; violations: R3fViolation[]; stale: string[] } {
  const listed = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...SOURCE_GLOBS], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (listed.status !== 0) throw new Error(`git ls-files: ${listed.stderr}`);
  const files = listed.stdout.split("\n").filter((path) => /\.tsx?$/.test(path) && !EXEMPT.test(path));
  const violations: R3fViolation[] = [];
  const stillImporting = new Set<string>();
  for (const file of files) {
    let source: string;
    try {
      source = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    const imports = r3fValueImports(source);
    if (imports.length === 0) continue;
    stillImporting.add(file);
    if (R3F_FREE_ALLOWLIST.has(file)) continue;
    for (const specifier of imports) violations.push({ file, specifier });
  }
  const stale = [...R3F_FREE_ALLOWLIST].filter((file) => !stillImporting.has(file));
  return { files: files.length, violations, stale };
}

const USAGE: Usage = {
  summary: "fail when draw-layer or game code gains a runtime @react-three import outside the shrinking allowlist",
  usage: "bun run check r3f-free",
  flags: [],
  example: "bun run check r3f-free",
  exits: ["0 clean", "1 a file imports r3f it may not, or the allowlist went stale"],
};

function main(argv: readonly string[]): number {
  if (printHelpIfAsked("check:r3f-free", USAGE, argv)) return 0;
  const root = fileURLToPath(new URL("..", import.meta.url));
  const { files, violations, stale } = scanR3fFree(root);
  const problems = [
    ...violations.map((v) => `${v.file}: value import of ${v.specifier} — mount an EngineDraw through useEngineDraw instead`),
    ...stale.map((file) => `${file}: allowlist entry is stale (no r3f import left) — remove it from R3F_FREE_ALLOWLIST`),
  ];
  if (problems.length === 0) {
    console.log(`r3f-free ok: ${files} files scanned, ${R3F_FREE_ALLOWLIST.size} files still on the r3f allowlist`);
    return 0;
  }
  console.error("check:r3f-free failed:");
  for (const problem of problems) console.error(`  ${problem}`);
  return 1;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
