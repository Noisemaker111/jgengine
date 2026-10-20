import * as THREE from "three";

import type { TerrainEnvironmentDescriptor } from "@jgengine/core/world/features";
import { createTerrainPaletteSampler, resolveTerrainPalette, type TerrainField } from "@jgengine/core/world/terrain";
import { editableTerrainFromSnapshot, type TerraformSnapshot } from "@jgengine/core/world/terraform";
import { createTerrainPaintColorSampler } from "../terrain/terrainPaintColor";

/**
 * Terrain base color at a world XZ — authored paint first, otherwise the regional palette lerped
 * by ground height. Grass roots and soil-patch borders share the painted color with ground vertices.
 * Descriptor surface mottling and fragment detail are presentation overlays, not sampled here.
 * @internal
 */
export function terrainGroundColorSampler(
  terrain: Omit<TerrainEnvironmentDescriptor, "kind"> | undefined,
  field: TerrainField,
  sculpt?: TerraformSnapshot,
): ((x: number, z: number) => string) | undefined {
  if (terrain === undefined && sculpt === undefined) return undefined;
  const palette = resolveTerrainPalette(terrain);
  const paletteAt = terrain === undefined ? undefined : createTerrainPaletteSampler(terrain);
  const paintColorAt = sculpt === undefined ? undefined : createTerrainPaintColorSampler(editableTerrainFromSnapshot(sculpt));
  const low = new THREE.Color(palette.low);
  const high = new THREE.Color(palette.high);
  const base = terrain?.baseHeight ?? 0;
  const swing = (terrain?.height ?? 0) * 1.2;
  const scratch = new THREE.Color();
  return (x: number, z: number) => {
    const regional = paletteAt?.(x, z);
    if (regional !== undefined) { low.set(regional.low); high.set(regional.high); }
    const t = swing <= 0 ? 0.5 : THREE.MathUtils.clamp((field.sampleHeight(x, z) - (base - swing)) / (swing * 2), 0, 1);
    scratch.copy(low).lerp(high, t);
    paintColorAt?.(x, z, scratch);
    return `#${scratch.getHexString()}`;
  };
}
