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
  "editorLayers.ts",
  "editorLayers.test.ts",
  "editorCatalogs.ts",
  "editorCatalogs.test.ts",
  "editor.scene.json",
] as const;

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
  return isDirectory ? ALLOWED_DIRS.has(name) : ALLOWED_FILES.has(name);
}

/** Human-readable core skeleton list for doctor/check error copy. */
export function gameSkeletonRequiredSummary(): string {
  return GAME_SKELETON_REQUIRED_FILES.join(", ");
}
