import type { OceanEnvironmentDescriptor, WorldBounds } from "@jgengine/core/world/features";

/** A rect in an ocean sheet's local XZ: `[minX, minZ, maxX, maxZ]`. */
export type OceanBedBounds = readonly [number, number, number, number];

/**
 * The part of an ocean sheet worth baking a bed for, in its local XZ: the sheet, cut to the terrain
 * when there is one, since past the terrain's edge the bed is open sea floor.
 * @internal
 */
export function oceanBedBounds(ocean: Pick<OceanEnvironmentDescriptor, "bounds" | "position">, terrain: WorldBounds | undefined): OceanBedBounds {
  const [x, z] = ocean.position ?? [0, 0];
  let minX = -ocean.bounds.w / 2;
  let minZ = -ocean.bounds.d / 2;
  let maxX = ocean.bounds.w / 2;
  let maxZ = ocean.bounds.d / 2;
  if (terrain !== undefined) {
    minX = Math.max(minX, -terrain.w / 2 - x);
    maxX = Math.min(maxX, terrain.w / 2 - x);
    minZ = Math.max(minZ, -terrain.d / 2 - z);
    maxZ = Math.min(maxZ, terrain.d / 2 - z);
  }
  return maxX > minX && maxZ > minZ ? [minX, minZ, maxX, maxZ] : [0, 0, 1, 1];
}
