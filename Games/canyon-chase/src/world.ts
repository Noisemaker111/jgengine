import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { building, environment, sky, terrain, type WorldFeature } from "@jgengine/core/world/features";
import { BORDER_NODE_INDEX, mainPolyline } from "./game/world/canyon";

export const world: WorldFeature = environment({
  terrain: terrain({
    bounds: { w: 420, d: 1720 },
    height: 18,
    material: "rock",
    segments: 160,
    seed: "canyon-chase-terrain-v1",
    frequency: 0.012,
    octaves: 4,
    baseHeight: -2,
    colors: { low: "#5c3323", high: "#c98a5e", waterline: "#3a2a22" },
  }),
  sky: sky({ preset: "dusk", horizonColor: "#b0603a", zenithColor: "#2c2140", fog: { color: "#4b3b63", near: 60, far: 420 } }),
  structures: [
    building({
      position: [mainPolyline[4][0] + 40, mainPolyline[4][2]],
      count: 3,
      footprint: { w: 6, d: 6 },
      stories: [1, 2],
      style: "frontier",
      seed: "canyon-chase-outpost-a",
    }),
    building({
      position: [mainPolyline[11][0] - 40, mainPolyline[11][2]],
      count: 2,
      footprint: { w: 6, d: 6 },
      stories: [1, 2],
      style: "frontier",
      seed: "canyon-chase-outpost-b",
    }),
  ],
});

export const physics: PhysicsConfig = { gravity: -24 };

export const BORDER_ARCH_POSITION = mainPolyline[BORDER_NODE_INDEX];
