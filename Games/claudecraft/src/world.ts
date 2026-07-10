import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import {
  building,
  environment,
  grass,
  rain,
  sky,
  snow,
  terrain,
  type EnvironmentWorldFeature,
} from "@jgengine/core/world/features";

import { DUNGEONS } from "./game/dungeons/catalog";
import { CRYPT, WORLD_DEPTH, WORLD_WIDTH, ZONES } from "./game/world/zones";

const [vale, marsh, peaks] = ZONES;
const compounds = DUNGEONS.filter((dungeon) => dungeon.id !== "hollow_crypt");

export const world: EnvironmentWorldFeature = environment({
  terrain: terrain({
    bounds: { w: WORLD_WIDTH, d: WORLD_DEPTH },
    seed: "woc-20061",
    material: "grass",
    colors: { low: "#4d6b3c", high: "#9aa3b0", waterline: "#3d5c4f" },
    height: 16,
    frequency: 0.012,
    octaves: 4,
    baseHeight: 9,
    waterLevel: -1.5,
    segments: 220,
    flatten: [
      { center: [vale.hub.x, vale.hub.z], radius: vale.hub.radius, falloff: 18 },
      { center: [marsh.hub.x, marsh.hub.z], radius: marsh.hub.radius, falloff: 16 },
      { center: [peaks.hub.x, peaks.hub.z], radius: peaks.hub.radius, falloff: 16 },
      { center: [vale.graveyard.x, vale.graveyard.z], radius: 8, falloff: 6 },
      { center: [marsh.graveyard.x, marsh.graveyard.z], radius: 8, falloff: 6 },
      { center: [peaks.graveyard.x, peaks.graveyard.z], radius: 8, falloff: 6 },
      { center: [CRYPT.x, CRYPT.z], radius: CRYPT.radius, falloff: 14 },
      ...compounds.map((dungeon) => ({
        center: dungeon.center,
        radius: dungeon.radius,
        falloff: 12,
      })),
    ],
  }),
  sky: sky({
    preset: "day",
    horizonColor: "#d9e4ec",
    zenithColor: "#5f83b8",
    sunIntensity: 1.35,
    ambientIntensity: 1.1,
    fog: { color: "#c3d2dc", near: 180, far: 620 },
  }),
  weather: [
    rain({
      area: {
        w: WORLD_WIDTH,
        d: marsh.zMax - marsh.zMin,
        h: 60,
        position: [0, (marsh.zMin + marsh.zMax) / 2],
      },
      density: 0.5,
    }),
    snow({
      area: {
        w: WORLD_WIDTH,
        d: peaks.zMax - (peaks.zMin + 60),
        h: 70,
        position: [0, (peaks.zMin + 60 + peaks.zMax) / 2],
      },
      density: 0.6,
    }),
  ],
  vegetation: [
    grass({
      area: {
        w: WORLD_WIDTH,
        d: vale.zMax - vale.zMin,
        position: [0, (vale.zMin + vale.zMax) / 2],
      },
      density: 0.3,
      colors: ["#6b8f4e", "#7da35b", "#5c7d43"],
      seed: "vale-grass",
    }),
  ],
  structures: [
    building({ position: [vale.hub.x, vale.hub.z], count: 9, seed: "eastbrook", stories: [1, 2] }),
    building({ position: [marsh.hub.x, marsh.hub.z], count: 7, seed: "fenbridge", stories: [1, 2] }),
    building({ position: [peaks.hub.x, peaks.hub.z], count: 7, seed: "highwatch", stories: [1, 3] }),
    building({ position: [CRYPT.x, CRYPT.z], count: 3, seed: "hollow-crypt", stories: [1, 1] }),
    ...compounds.map((dungeon) =>
      building({
        position: [dungeon.center[0], dungeon.center[1]],
        count: dungeon.raid === true ? 6 : 4,
        seed: dungeon.id,
        stories: [1, 2],
      }),
    ),
  ],
});

export const physics: PhysicsConfig = { gravity: -16, jumpVelocity: 6 };
