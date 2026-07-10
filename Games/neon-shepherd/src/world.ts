import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import {
  building,
  environment,
  ocean,
  pad,
  rain,
  sky,
  terrain,
  type EnvironmentWorldFeature,
} from "@jgengine/core/world/features";
import { CORRIDOR_HALF_WIDTH, PALETTE, PARK_Z, ROAD_Z, SANCTUARY_Z, TRAVEL_SPAN_HALF } from "./game/constants";
import { ROADS } from "./game/roads/catalog";

const WORLD_HALF_WIDTH = TRAVEL_SPAN_HALF + 8;
const WORLD_HALF_DEPTH = Math.abs(PARK_Z) + 20;

const BUILDING_Z_BANDS: readonly number[] = [(PARK_Z + ROAD_Z[0]!) / 2, 0, (ROAD_Z[5]! + SANCTUARY_Z) / 2];

const roadPads = ROADS.map((road) =>
  pad({
    center: [0, road.z],
    size: [WORLD_HALF_WIDTH * 2 - 4, road.halfDepth * 2],
    color: "#15181d",
  }),
);

const zonePads = [
  pad({ center: [0, PARK_Z], size: { radius: CORRIDOR_HALF_WIDTH }, color: "#182420", height: 0.06 }),
  pad({ center: [0, SANCTUARY_Z], size: { radius: CORRIDOR_HALF_WIDTH }, color: "#221a24", height: 0.06 }),
];

const buildingClusters = BUILDING_Z_BANDS.flatMap((z, bandIndex) =>
  ([-1, 1] as const).map((side) =>
    building({
      count: 3,
      footprint: { w: 9, d: 9 },
      stories: [2, 6],
      storyHeight: 3.1,
      spacing: 2.5,
      style: side > 0 ? "east-block" : "west-block",
      seed: `neon-shepherd-buildings-${bandIndex}-${side}`,
      position: [side * (WORLD_HALF_WIDTH - 4), z],
    }),
  ),
);

export const world: EnvironmentWorldFeature = environment({
  terrain: terrain({
    bounds: { w: WORLD_HALF_WIDTH * 2, d: WORLD_HALF_DEPTH * 2 },
    height: 1.4,
    frequency: 0.02,
    octaves: 2,
    material: "ash",
    colors: { low: PALETTE.nightAsphalt, high: "#1c222c", waterline: "#0c3d38" },
    seed: "neon-shepherd-terrain",
  }),
  sky: sky({
    preset: "night",
    horizonColor: "#2a2438",
    zenithColor: "#05060a",
    fog: { color: PALETTE.nightAsphalt, near: 50, far: 165 },
  }),
  weather: rain({
    area: { w: WORLD_HALF_WIDTH * 2, d: WORLD_HALF_DEPTH * 2, h: 60 },
    density: 0.22,
    speed: 13,
    dropLength: 0.6,
    color: "#7ef9c8",
  }),
  water: ocean({
    bounds: { w: 11, d: 8 },
    position: [0, SANCTUARY_Z + 3],
    level: 0.08,
    waveHeight: 0.12,
    waveScale: 6,
    waveSpeed: 0.3,
    color: "#3fc9a4",
  }),
  structures: buildingClusters,
  pads: [...roadPads, ...zonePads],
});

export const physics: PhysicsConfig = { gravity: -26, jumpVelocity: 0 };
