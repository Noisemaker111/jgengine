import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { seededStreams } from "@jgengine/core/random/rng";
import {
  building,
  environment,
  grass,
  ocean,
  terrain,
  type EnvironmentWorldFeature,
  type TerrainEnvironmentDescriptor,
} from "@jgengine/core/world/features";

import { settlements, WORLD_SEED } from "./game/settlements";

const gen = seededStreams(WORLD_SEED)("worldgen");

const TERRAIN_BOUNDS = { w: 900, d: 900 };

const settlementStructures = settlements.map((settlement) =>
  building({
    count: settlement.rank === "capital" ? Math.round(6 + gen() * 4) : Math.round(2 + gen() * 3),
    footprint: { w: 9, d: 9 },
    stories: settlement.rank === "capital" ? [3, 7] : [1, 3],
    storyHeight: 3.2,
    spacing: 5,
    style: settlement.rank,
    seed: `${WORLD_SEED}:structures:${settlement.id}`,
    position: [settlement.position.x, settlement.position.z],
  }),
);

export const terrainDescriptor: TerrainEnvironmentDescriptor = terrain({
  bounds: TERRAIN_BOUNDS,
  height: 22,
  seed: `${WORLD_SEED}:terrain`,
  frequency: 0.015 + gen() * 0.01,
  octaves: 4,
  ridged: false,
  material: "highland-turf",
});

export const world: EnvironmentWorldFeature = environment({
  terrain: terrainDescriptor,
  vegetation: grass({
    area: { w: 820, d: 820 },
    density: 3 + gen() * 1.5,
    colors: ["#3f7d2d", "#6bbf4a", "#8fc25a"],
    seed: `${WORLD_SEED}:grass`,
  }),
  water: ocean({
    bounds: { w: 260, d: 180 },
    level: 1.5,
    waveHeight: 0.4,
    waveScale: 24,
    waveSpeed: 0.3,
    color: "#2f7ea3",
  }),
  structures: settlementStructures,
});

export const physics: PhysicsConfig = { gravity: -22 };
