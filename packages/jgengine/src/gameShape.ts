/**
 * Canonical game `src/` shape — single source of truth for doctor, check-game-shape,
 * and create/template tests.
 *
 * `src/` holds only the skeleton; game-specific modules live under `src/game/`.
 */

/** Top-level src/ files the scaffold ships and the shape docs list as the core skeleton. */
export const GAME_SKELETON_REQUIRED_FILES = [
  "game.config.ts",
  "index.tsx",
  "main.tsx",
  "index.css",
  "style.css",
] as const;

/**
 * Top-level src/ files a game may keep outside `src/game/` (loop/world modules, preview harness,
 * scene ownership manifest, editor document + wiring). Presence is optional.
 */
export const GAME_SKELETON_OPTIONAL_FILES = [
  "loop.ts",
  "world.ts",
  "preview.tsx",
  "scene-ownership.json",
  "art-direction.md",
  "editorLayers.ts",
  "editorLayers.test.ts",
  "editorCatalogs.ts",
  "editorCatalogs.test.ts",
  "editorKinds.ts",
  "editorKinds.test.ts",
  "editor.scene.json",
] as const;

/**
 * Editor-import-graph side-effect modules follow the `editor<Name>.ts` convention
 * (`editorLayers`, `editorCatalogs`, `editorKinds`, …). They load with the editor via
 * `editorLayers.ts` and are legitimate top-level `src/` extras. Matching the convention by
 * pattern — not an exact-filename enumeration — keeps a new editor module (and its colocated
 * `.test.ts`) from tripping the shape gate the moment it lands, which is what stalled main
 * after #1369 added `editorKinds.ts`.
 */
const EDITOR_MODULE_RE = /^editor[A-Z][A-Za-z0-9]*(\.test)?\.tsx?$/;

/** Top-level directories allowed under src/ (everything game-specific lives under these). */
export const GAME_SKELETON_DIRS = ["game"] as const;

const ALLOWED_FILES: ReadonlySet<string> = new Set([
  ...GAME_SKELETON_REQUIRED_FILES,
  ...GAME_SKELETON_OPTIONAL_FILES,
]);

const ALLOWED_DIRS: ReadonlySet<string> = new Set(GAME_SKELETON_DIRS);

/** Union allowlist for "is this top-level src entry legal?" checks. */
export function gameSkeletonAllowedFiles(): ReadonlySet<string> {
  return ALLOWED_FILES;
}

export function gameSkeletonAllowedDirs(): ReadonlySet<string> {
  return ALLOWED_DIRS;
}

/** True when a direct child of `src/` is either a skeleton file or an allowed dir. */
export function isAllowedGameSrcEntry(name: string, isDirectory: boolean): boolean {
  if (isDirectory) return ALLOWED_DIRS.has(name);
  return ALLOWED_FILES.has(name) || EDITOR_MODULE_RE.test(name);
}

/** Human-readable core skeleton list for doctor/check error copy. */
export function gameSkeletonRequiredSummary(): string {
  return GAME_SKELETON_REQUIRED_FILES.join(", ");
}

/**
 * A source line that declares mutable module state (#1579): `let x` or `export let x` at the start
 * of a line. Module scope is shared by every `GameContext` in a process, so per-run state belongs in
 * `defineStore` / `perContext`. Returns the declared name, or null for any other line.
 */
export function moduleGlobalName(line: string): string | null {
  return /^(?:export )?let (\w+)/.exec(line)?.[1] ?? null;
}

/** A game source file the source gates read: a non-test `.ts` / `.tsx` under a game's `src`. */
export function isGameSourceFile(fileName: string): boolean {
  return /\.tsx?$/.test(fileName) && !/\.test\.tsx?$/.test(fileName);
}
