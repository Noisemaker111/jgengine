import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { environment, grass, terrain, type WorldFeature } from "@jgengine/core/world/features";

export const world: WorldFeature = environment({
  terrain: terrain({ bounds: { w: 100, d: 24 }, height: 0, material: "grass", seed: "siege-range" }),
  vegetation: grass({ area: { w: 100, d: 24 }, density: 3, seed: "siege-range" }),
});

export const physics: PhysicsConfig = { gravity: -18 };
