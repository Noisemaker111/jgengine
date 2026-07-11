import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import {
  building,
  environment,
  grass,
  sky,
  terrain,
  type EnvironmentWorldFeature,
} from "@jgengine/core/world/features";

export const world: EnvironmentWorldFeature = environment({
  terrain: terrain({
    bounds: { w: 140, d: 44 },
    height: 0,
    material: "grass",
    colors: { low: "#4d8f2f", high: "#a8e26a", waterline: "#2f6f8f" },
  }),
  sky: sky({ preset: "day", horizonColor: "#bfe6ff", zenithColor: "#4a9fe0" }),
  vegetation: grass({ area: { w: 130, d: 20 }, density: 3, colors: ["#4d9a33", "#83d654"] }),
  structures: building({
    count: 6,
    footprint: { w: 6, d: 6 },
    stories: [2, 5],
    storyHeight: 3,
    spacing: 10,
    style: "village",
    seed: "platform-hopper-skyline",
  }),
});

export const physics: PhysicsConfig = { gravity: -24 };
