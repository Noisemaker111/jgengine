/**
 * Per-session player-spawn override — a capture-harness ergonomics seam that lets a single
 * screenshot or drive run place the player somewhere other than the authored `player_spawn`
 * marker *without mutating `editor.scene.json`*. The runner installs one from the `?spawn=` URL
 * overlay (mirroring `?cam=`); {@link authoredSpawnPosition} consults it for the default
 * player-spawn resolution only, so authored content is untouched and the override evaporates the
 * moment the page reloads without the param.
 *
 * Genre-agnostic: it moves whatever a game treats as its player spawn. It never changes markers of
 * other kinds or an explicit marker `id`, so an override taken for a close-up cannot perturb enemy
 * or prop placement queries that share {@link authoredSpawnPosition}.
 *
 * Install-style module state is the established runner pattern here (`installAssetBase`,
 * `installEditorHost`, `installSaveEndpoint`); the default is `null`, so nothing changes and every
 * pure query stays deterministic until a runner explicitly installs an override.
 */

/** A spawn point that replaces the authored player spawn for one capture session. */
export interface SpawnOverride {
  x: number;
  y: number;
  z: number;
  /** Optional facing (yaw radians); when omitted the authored/`0` rotation is kept. */
  rotationY?: number;
}

let installed: SpawnOverride | null = null;

/** Install (or, with `null`, clear) the active player-spawn override. Idempotent; last write wins. */
export function installSpawnOverride(override: SpawnOverride | null): void {
  installed = override;
}

/** Clear any installed player-spawn override. */
export function clearSpawnOverride(): void {
  installed = null;
}

/** The currently installed player-spawn override, or `null` when none is active. */
export function readSpawnOverride(): SpawnOverride | null {
  return installed;
}

/**
 * Parse a `?spawn=` / `--spawn` value into a {@link SpawnOverride}, or `null` when it is absent or
 * malformed. Accepts `"x,y,z"` and `"x,y,z,yaw"` (yaw in radians); whitespace around components is
 * tolerated. A non-finite or short tuple yields `null` so a typo never silently teleports the
 * player to `NaN`.
 */
export function parseSpawnOverride(raw: string | null | undefined): SpawnOverride | null {
  if (raw === null || raw === undefined) return null;
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length < 3 || parts.length > 4) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((value) => !Number.isFinite(value))) return null;
  const [x, y, z, rotationY] = nums as [number, number, number, number?];
  return rotationY === undefined ? { x, y, z } : { x, y, z, rotationY };
}
