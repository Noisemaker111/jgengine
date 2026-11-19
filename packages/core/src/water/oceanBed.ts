import type { OceanEnvironmentDescriptor, WorldBounds } from "@jgengine/core/world/features";

export type OceanBedBounds = readonly [number, number, number, number];

/** @internal */
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
