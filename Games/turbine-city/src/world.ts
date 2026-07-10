import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { building, environment, sky, terrain, type WorldFeature } from "@jgengine/core/world/features";

import { BUILDING_ZONES } from "./game/world/zones";

export const world: WorldFeature = environment({
  terrain: terrain({
    bounds: { w: 1000, d: 1000 },
    height: 12,
    frequency: 0.006,
    octaves: 2,
    baseHeight: -55,
    seed: "turbine-city-cloud-floor",
    colors: { low: "#c9d6d9", high: "#f4f7f9", waterline: "#4ecdc4" },
  }),
  sky: sky({
    preset: "day",
    horizonColor: "#dff3f1",
    zenithColor: "#4ecdc4",
    sunIntensity: 1.35,
    ambientIntensity: 0.85,
    fog: { color: "#eef7f8", near: 260, far: 820 },
  }),
  structures: BUILDING_ZONES.map((zone) =>
    building({
      count: zone.count,
      position: zone.position,
      footprint: zone.footprint,
      stories: zone.stories,
      storyHeight: 3.4,
      spacing: 7,
      style: "aerodrome",
      seed: zone.seed,
    }),
  ),
});

export const physics: PhysicsConfig = { gravity: -20 };
