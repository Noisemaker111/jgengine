import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { environment, terrain, type EnvironmentWorldFeature } from "@jgengine/core/world/features";

/** Gentle textured ground so the studios read against a real world, not a flat void. */
export const world: EnvironmentWorldFeature = environment({
  terrain: terrain({
    bounds: { w: 160, d: 160 },
    height: 2.2,
    frequency: 0.02,
    seed: "studio-showcase",
  }),
});

export const physics: PhysicsConfig = { gravity: -30 };
