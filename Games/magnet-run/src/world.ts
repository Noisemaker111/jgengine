import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { building, environment, sky, terrain, type WorldFeature } from "@jgengine/core/world/features";

import { SECTOR_COUNT, SECTOR_LENGTH, TUNNEL_HALF_WIDTH, TUNNEL_START_Z, sectorWorldStart } from "./game/systems/constants";

const TUNNEL_LENGTH = SECTOR_COUNT * SECTOR_LENGTH;
const TUNNEL_CENTER_Z = TUNNEL_START_Z + TUNNEL_LENGTH / 2;

export const world: WorldFeature = environment({
  terrain: terrain({
    bounds: { w: TUNNEL_HALF_WIDTH * 2 + 6, d: TUNNEL_LENGTH + 100 },
    material: "rock",
    colors: { low: "#22262c", high: "#2b2f36", waterline: "#22262c" },
    segments: 48,
    baseHeight: 0,
    flatten: [{ center: [0, TUNNEL_CENTER_Z], radius: TUNNEL_LENGTH / 2 + 40, height: 0, falloff: 20 }],
  }),
  sky: sky({
    preset: "day",
    horizonColor: "#3a4048",
    zenithColor: "#161a1f",
    sunIntensity: 0.9,
    ambientIntensity: 0.75,
    fog: { color: "#20242a", near: 40, far: 150 },
  }),
  structures: [
    building({
      count: 2,
      position: [TUNNEL_HALF_WIDTH + 4, sectorWorldStart(0) + SECTOR_LENGTH / 2],
      footprint: { w: 5, d: 4 },
      stories: [1, 1],
      storyHeight: 2.6,
      spacing: 1.5,
      style: "industrial",
      palette: { wall: "#4b6b6f", roofProp: "#5fb3b8" },
      seed: "sector-1-substation",
    }),
    building({
      count: 2,
      position: [TUNNEL_HALF_WIDTH + 4, sectorWorldStart(1) + SECTOR_LENGTH / 2],
      footprint: { w: 5, d: 4 },
      stories: [1, 2],
      storyHeight: 2.6,
      spacing: 1.5,
      style: "industrial",
      palette: { wall: "#6b6238", awning: "#eab308", storeSign: "#eab308" },
      seed: "sector-2-substation",
    }),
    building({
      count: 2,
      position: [TUNNEL_HALF_WIDTH + 4, sectorWorldStart(2) + SECTOR_LENGTH / 2],
      footprint: { w: 5, d: 4 },
      stories: [1, 2],
      storyHeight: 2.6,
      spacing: 1.5,
      style: "industrial",
      palette: { wall: "#6b3838", roofProp: "#ef4444", guardrail: "#ef4444" },
      seed: "sector-3-substation",
    }),
  ],
});

export const physics: PhysicsConfig = { gravity: -24, jumpVelocity: 0 };
