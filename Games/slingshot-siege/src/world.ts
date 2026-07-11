import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { environment, grass, terrain, type WorldFeature } from "@jgengine/core/world/features";

export const world: WorldFeature = environment({
  terrain: terrain({
    bounds: { w: 100, d: 24 },
    height: 0,
    material: "grass",
    seed: "siege-range",
    colors: { low: "#5c4a2e", high: "#a8874f", waterline: "#1d4c6e" },
  }),
  vegetation: grass({
    area: { w: 100, d: 24 },
    density: 3,
    seed: "siege-range",
    colors: ["#8a9a3f", "#c9b45c"],
  }),
});

export const physics: PhysicsConfig = { gravity: -18 };
