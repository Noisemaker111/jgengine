import * as THREE from "three";

import type { TerrainEnvironmentDescriptor } from "@jgengine/core/world/features";
import { resolveTerrainPalette, type TerrainField } from "@jgengine/core/world/terrain";

/**
 * Terrain surface color at a world XZ — the palette low/high lerped by the sampled ground height,
 * mirroring how `CarvedTerrain` shades its vertices. The seam that lets everything planted on the
 * ground (grass roots, soil-patch borders) blend into the exact color it stands on.
 * @internal
 */
export function terrainGroundColorSampler(
  terrain: Omit<TerrainEnvironmentDescriptor, "kind"> | undefined,
  field: TerrainField,
): ((x: number, z: number) => string) | undefined {
  if (terrain === undefined) return undefined;
  const palette = resolveTerrainPalette(terrain);
  const low = new THREE.Color(palette.low);
  const high = new THREE.Color(palette.high);
  const base = terrain.baseHeight ?? 0;
  const swing = terrain.height * 1.2;
  const scratch = new THREE.Color();
  return (x: number, z: number) => {
    const t = swing <= 0 ? 0.5 : THREE.MathUtils.clamp((field.sampleHeight(x, z) - (base - swing)) / (swing * 2), 0, 1);
    return `#${scratch.copy(low).lerp(high, t).getHexString()}`;
  };
}
