import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import {
  building,
  environment,
  snow,
  terrain,
  type EnvironmentWorldFeature,
} from "@jgengine/core/world/features";

export const world: EnvironmentWorldFeature = environment({
  terrain: terrain({
    bounds: { w: 220, d: 220 },
    height: 6,
    seed: "block-stacker-arena",
    frequency: 0.02,
    octaves: 3,
    material: "slate",
  }),
  structures: [
    building({ count: 6, footprint: { w: 10, d: 10 }, stories: [3, 9], spacing: 6, style: "tower", seed: "stacks" }),
  ],
  weather: snow({ density: 0.4, speed: 3 }),
});

export const physics: PhysicsConfig = { gravity: -20 };
