import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { building, environment, sky, terrain, type EnvironmentWorldFeature } from "@jgengine/core/world/features";

import { GRAVITY, JUMP_VELOCITY } from "./game/tuning";

export const TERRAIN_BOUNDS = { w: 200, d: 500 } as const;

export const DECORATIVE_BUILDING_CLUSTERS = [
  { seed: "district-a", position: [-30, 20] as const, count: 4, stories: [2, 4] as const },
  { seed: "district-b", position: [30, 60] as const, count: 4, stories: [2, 4] as const },
  { seed: "district-c", position: [-35, 110] as const, count: 4, stories: [3, 6] as const },
  { seed: "district-d", position: [35, 150] as const, count: 4, stories: [3, 6] as const },
  { seed: "district-e", position: [-30, 200] as const, count: 4, stories: [4, 8] as const },
] as const;

export const world: EnvironmentWorldFeature = environment({
  terrain: terrain({
    bounds: TERRAIN_BOUNDS,
    height: 0,
    material: "ash",
    colors: { low: "#2b2320", high: "#332a26", waterline: "#2b2320" },
    segments: 24,
  }),
  sky: sky({
    preset: "day",
    horizonColor: "#f2b950",
    zenithColor: "#b8a9d9",
    sunIntensity: 1.4,
    ambientIntensity: 1.25,
    fog: { color: "#e8c79a", near: 220, far: 480 },
  }),
  structures: DECORATIVE_BUILDING_CLUSTERS.map((cluster) =>
    building({
      count: cluster.count,
      footprint: { w: 9, d: 9 },
      stories: cluster.stories,
      storyHeight: 3,
      spacing: 3,
      style: "industrial",
      palette: { wall: "#8f4a35", storefront: "#5c2f22" },
      seed: cluster.seed,
      position: cluster.position,
    }),
  ),
});

export const physics: PhysicsConfig = { gravity: GRAVITY, jumpVelocity: JUMP_VELOCITY };
