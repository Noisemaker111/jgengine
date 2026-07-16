import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import {
  building,
  environment,
  grass,
  ocean,
  rain,
  road,
  sky,
  terrain,
  type EnvironmentWorldFeature,
  type TerrainMaterialRegion,
} from "@jgengine/core/world/features";
import { DISTRICTS, ROADS, SHORE_X, WORLD_D, WORLD_W } from "./game/world/districts";

export const streets = ROADS.map((segment) =>
  road({
    path: [segment.from, segment.to],
    width: 9,
    color: "#3d414c",
    markingColor: "#f3c53d",
    elevation: segment.from[0] === segment.to[0] ? 0.08 : 0.16,
  }),
);

const shoreRegions: TerrainMaterialRegion[] = Array.from({ length: 20 }, (_, i) => ({
  center: [SHORE_X + 8, -300 + i * 30] as const,
  radius: 26,
  falloff: 14,
  colors: { low: "#efd9a0", high: "#e8c886" },
}));

const cityFlatten = DISTRICTS.map((d) => ({
  center: d.center,
  radius: d.radius,
  height: d.id === "palm_heights" ? 14 : 1.2,
  falloff: d.radius * 0.6,
}));

function coastalHeight(x: number, z: number): number {
  const shoreFall = x < SHORE_X ? (x - SHORE_X) * 0.22 : 0;
  const hills = Math.max(0, -(z + 150)) * 0.09;
  const roll = Math.sin(x * 0.021) * Math.cos(z * 0.017) * 2.2;
  return 1.5 + roll + hills + shoreFall;
}

export const world: EnvironmentWorldFeature = environment({
  terrain: terrain({
    bounds: { w: WORLD_W, d: WORLD_D },
    segments: 300,
    seed: "vice-isle-06",
    heightField: coastalHeight,
    waterLevel: -0.6,
    colors: { low: "#a8c065", high: "#6f9a4a", waterline: "#2fc6da" },
    materialRegions: shoreRegions,
    flatten: cityFlatten,
  }),
  sky: sky({ preset: "day", timeOfDay: true }),
  weather: rain({
    area: { w: 70, d: 70, h: 45, position: [-170, 0] },
    density: 0.9,
    speed: 17,
    dropLength: 1.4,
    wind: [1.5, 0.5],
    color: "#4a6f96",
  }),
  roads: streets,
  water: [
    ocean({
      bounds: { w: 400, d: 700 },
      position: [-440, 0],
      level: -0.4,
      color: "#1d9fc4",
      waveHeight: 0.8,
    }),
  ],
  vegetation: [
    grass({
      area: { w: 160, d: 160, position: [70, -240] },
      density: 0.12,
      seed: "vice-palms",
    }),
  ],
  structures: [
    building({
      count: 10,
      position: [-118, -70],
      footprint: { w: 12, d: 12 },
      stories: [2, 4],
      storyHeight: 3.4,
      spacing: 9,
      style: "coastal",
      palette: { wall: "#f4a7c3", window: "#22262e" },
      seed: "vice-beach",
    }),
    building({
      count: 14,
      position: [40, -60],
      footprint: { w: 16, d: 16 },
      stories: [6, 14],
      storyHeight: 3.6,
      spacing: 8,
      style: "neon",
      palette: { window: "#1b1e26" },
      seed: "vice-downtown",
    }),
    building({
      count: 10,
      position: [130, 190],
      footprint: { w: 18, d: 14 },
      stories: [1, 3],
      storyHeight: 4,
      spacing: 10,
      style: "industrial",
      palette: { wall: "#b3552f", window: "#23262c" },
      seed: "vice-docks",
    }),
    building({
      count: 8,
      position: [70, -240],
      footprint: { w: 13, d: 13 },
      stories: [1, 2],
      storyHeight: 3.4,
      spacing: 14,
      style: "village",
      palette: { wall: "#f0e3c0", window: "#2a2d34" },
      seed: "vice-heights",
    }),
  ],
});

export const physics: PhysicsConfig = { gravity: -28, jumpVelocity: 7.4 };
