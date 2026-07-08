import { environment, terrain, type WorldFeature } from "@jgengine/core/world/features";

export const world: WorldFeature = environment({
  terrain: terrain({ bounds: { w: 340, d: 340 }, height: 0, seed: "speed-circuit-ground" }),
});
