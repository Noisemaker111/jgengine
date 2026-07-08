import { terrain, type TerrainEnvironmentDescriptor } from "@jgengine/core/world/features";

export const TERRAIN: TerrainEnvironmentDescriptor = terrain({
  bounds: { w: 84, d: 84 },
  height: 2.4,
  frequency: 0.045,
  octaves: 3,
  seed: "tower-guard",
  baseHeight: 0,
});
