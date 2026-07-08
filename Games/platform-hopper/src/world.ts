import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import {
  building,
  environment,
  grass,
  terrain,
  type EnvironmentWorldFeature,
} from "@jgengine/core/world/features";

export const world: EnvironmentWorldFeature = environment({
  terrain: terrain({ bounds: { w: 140, d: 44 }, height: 0, material: "grassland" }),
  vegetation: grass({ area: { w: 130, d: 20 }, density: 3, colors: ["#3f7d2d", "#6bbf4a"] }),
  structures: building({
    count: 6,
    footprint: { w: 6, d: 6 },
    stories: [2, 5],
    storyHeight: 3,
    spacing: 10,
    style: "town",
    seed: "platform-hopper-skyline",
  }),
});

export const physics: PhysicsConfig = { gravity: -24 };
