import { environment, terrain, type WorldFeature } from "@jgengine/core/world/features";

export const world: WorldFeature = environment({
  terrain: terrain({
    bounds: { w: 340, d: 340 },
    height: 3.4,
    frequency: 0.014,
    octaves: 3,
    baseHeight: -1.2,
    seed: "speed-circuit-ground",
  }),
});
