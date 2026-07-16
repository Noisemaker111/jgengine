import { devtools } from "@jgengine/core/devtools/devtools";

import { resolveTerrainSize, type TerrainArea } from "./terrainMath";

export const DEFAULT_GRASS_COUNT = 1500;
/** Blades per square meter — matches `@jgengine/core/world/vegetation`'s `VEGETATION_DEFAULTS.density`, so an editor-placed grass volume and a bare `<GrassField>` agree on what "4" means. */
export const DEFAULT_GRASS_DENSITY = 4;

/**
 * Blade instance count for a patch: `density` (blades/m²) times the patch's
 * `area`, capped at `budget` (defaulting to `count`, the buffer's allocated
 * capacity) so a big field never exceeds the perf ceiling — it just renders
 * sparser than requested and logs a devtools warning when that happens.
  * @internal
  */
export function resolveGrassInstanceBudget(count: number, density: number, area: TerrainArea, budget?: number): number {
  const size = resolveTerrainSize(area);
  const areaSqMeters = Math.max(0, size.width) * Math.max(0, size.depth);
  const requested = Math.max(0, density) * areaSqMeters;
  const cap = budget === undefined ? count : Math.min(count, Math.max(0, Math.floor(budget)));
  if (requested > cap) {
    devtools.logs.push(
      "warn",
      `[jgengine:grass] density ${density} blades/m² over ${areaSqMeters.toFixed(0)}m² wants ${Math.floor(requested)} blades — clamped to budget ${cap}`,
    );
  }
  return Math.floor(Math.min(Math.max(0, cap), requested));
}
