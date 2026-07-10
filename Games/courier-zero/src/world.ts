import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { building, environment, ocean, sky, terrain, type EnvironmentWorldFeature } from "@jgengine/core/world/features";
import { TIDE_STAGES } from "./game/tide/catalog";
import { VILLAGES, terrainFlattenMasks } from "./game/world/villages";

export const ISLAND_SEED = "courier-zero-island";

export const world: EnvironmentWorldFeature = environment({
  terrain: terrain({
    bounds: { w: 240, d: 240 },
    height: 3,
    seed: ISLAND_SEED,
    frequency: 0.018,
    octaves: 4,
    baseHeight: -0.6,
    material: "sand",
    waterLevel: TIDE_STAGES[0]!.level,
    flatten: terrainFlattenMasks(),
  }),
  sky: sky({
    preset: "day",
    horizonColor: "#f4e2b8",
    zenithColor: "#8fd0c9",
    sunIntensity: 1.15,
    ambientIntensity: 0.65,
  }),
  water: ocean({
    bounds: { w: 480, d: 480 },
    level: TIDE_STAGES[0]!.level,
    color: "#2a9d8f",
    waveHeight: 0.6,
    waveScale: 22,
  }),
  structures: VILLAGES.map((village) =>
    building({
      position: village.position,
      count: village.buildingCount,
      footprint: { w: 5, d: 5 },
      stories: [1, village.maxStories],
      storyHeight: 3,
      spacing: 2.5,
      style: "coastal",
      seed: `${ISLAND_SEED}-${village.id}`,
    }),
  ),
});

export const physics: PhysicsConfig = { gravity: -22, jumpVelocity: 6.4 };
