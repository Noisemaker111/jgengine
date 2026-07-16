import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { environment, sky, terrain, type EnvironmentWorldFeature } from "@jgengine/core/world/features";

/** Gentle textured ground so the studios read against a real world, not a flat void. */
export const world: EnvironmentWorldFeature = environment({
  terrain: terrain({
    bounds: { w: 160, d: 160 },
    height: 2.2,
    frequency: 0.02,
    seed: "studio-showcase",
  }),
  sky: sky({
    preset: "day",
    volumetricClouds: {
      coverage: 0.4,
      density: 1.6,
      height: 82,
      thickness: 58,
      speed: 1.1,
      scale: 140,
      sunScatter: 0.95,
      seed: "showcase-clouds",
    },
  }),
});

export const physics: PhysicsConfig = { gravity: -30 };
