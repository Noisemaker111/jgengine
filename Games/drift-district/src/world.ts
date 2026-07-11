import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { building, environment, sky, terrain, type WorldFeature } from "@jgengine/core/world/features";

import { DISTRICTS } from "./game/district/districts";

const harbor = DISTRICTS[0]!;
const downtown = DISTRICTS[1]!;
const heights = DISTRICTS[2]!;

export const world: WorldFeature = environment({
  terrain: terrain({
    bounds: { w: 760, d: 760 },
    height: 1.6,
    frequency: 0.01,
    octaves: 2,
    baseHeight: 0,
    seed: "drift-district-asphalt",
    colors: { low: "#1a1a24", high: "#232333", waterline: "#1a1a24" },
  }),
  sky: sky({
    preset: "night",
    horizonColor: "#3a1030",
    zenithColor: "#050208",
    fog: { color: "#0d0a14", near: 70, far: 420 },
  }),
  structures: [
    building({
      count: 12,
      position: harbor.center,
      footprint: { w: 14, d: 14 },
      stories: [3, 8],
      storyHeight: 3.4,
      spacing: 7,
      style: "coastal",
      seed: "drift-district-harbor",
    }),
    building({
      count: 13,
      position: downtown.center,
      footprint: { w: 16, d: 16 },
      stories: [5, 12],
      storyHeight: 3.6,
      spacing: 6,
      style: "neon",
      seed: "drift-district-downtown",
    }),
    building({
      count: 11,
      position: heights.center,
      footprint: { w: 13, d: 13 },
      stories: [2, 6],
      storyHeight: 3.2,
      spacing: 8,
      style: "industrial",
      seed: "drift-district-heights",
    }),
  ],
});

export const physics: PhysicsConfig = { gravity: -24 };
