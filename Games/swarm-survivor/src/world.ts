import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { building, environment, grass, rain, terrain, type WorldFeature } from "@jgengine/core/world/features";

export const world: WorldFeature = environment({
  terrain: terrain({
    bounds: { w: 96, d: 96 },
    height: 2.2,
    seed: "swarm-arena",
    frequency: 0.045,
    octaves: 3,
    ridged: true,
    baseHeight: -0.2,
  }),
  vegetation: grass({
    area: { w: 90, d: 90 },
    density: 5,
    bladeHeight: [0.3, 1.1],
    colors: ["#274a1f", "#3c7a2b", "#5aa23c"],
    seed: "swarm-grass",
  }),
  weather: rain({
    area: { w: 100, d: 100, h: 60 },
    density: 0.4,
    speed: 22,
    color: "#7fae7a",
  }),
  structures: building({
    count: 5,
    footprint: { w: 7, d: 7 },
    stories: [1, 2],
    storyHeight: 3,
    spacing: 10,
    style: "ruin",
    seed: "swarm-ruins",
  }),
});

export const physics: PhysicsConfig = { gravity: -20 };
