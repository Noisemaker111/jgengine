import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { building, environment, ocean, sky, terrain } from "@jgengine/core/world/features";
import {
  BUILDING_CLUSTER_MASKS,
  BUILDING_CLUSTERS,
  ISLETS,
  TERRAIN_BOUNDS,
  WATER_LEVEL,
  WORLD_SEED,
} from "./game/course/track";

export const world = environment({
  terrain: terrain({
    bounds: TERRAIN_BOUNDS,
    seed: WORLD_SEED,
    material: "sand",
    baseHeight: -4.5,
    waterLevel: WATER_LEVEL,
    frequency: 0.012,
    octaves: 3,
    segments: 160,
    colors: { low: "#0e2a30", high: "#e6f2ef", waterline: "#c9b98a" },
    flatten: [...ISLETS, ...BUILDING_CLUSTER_MASKS].map((mask) => ({
      center: [mask.x, mask.z] as const,
      radius: mask.radius,
      height: WATER_LEVEL + mask.height,
      falloff: mask.falloff,
    })),
  }),
  sky: sky({
    preset: "day",
    horizonColor: "#e6f2ef",
    zenithColor: "#14505c",
    sunIntensity: 1.35,
    ambientIntensity: 0.75,
    fog: { color: "#e6f2ef", near: 140, far: 380 },
  }),
  water: ocean({
    bounds: TERRAIN_BOUNDS,
    level: WATER_LEVEL,
    waveHeight: 0.5,
    waveScale: 22,
    waveSpeed: 0.4,
    color: "#14505c",
  }),
  structures: BUILDING_CLUSTERS.map((cluster) =>
    building({
      position: cluster.position,
      count: cluster.count,
      footprint: cluster.footprint,
      stories: cluster.stories,
      storyHeight: 3,
      spacing: 3,
      style: "harbor",
      seed: `${WORLD_SEED}:${cluster.id}`,
    }),
  ),
});

export const physics: PhysicsConfig = { gravity: -24 };
