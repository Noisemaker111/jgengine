import { libraryTerrainMaterial } from "@jgengine/assets/catalogs/materialLibrary";
import { editorLayers } from "./editorLayers";
import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import {
  building,
  environment,
  sky,
  terrain,
  type WorldFeature,
} from "@jgengine/core/world/features";

export const world: WorldFeature = environment({
  sculpt: editorLayers.terrain,
  terrain: terrain({
    bounds: { w: 220, d: 220 },
    height: 0,
    material: "grass",
    colors: { low: "#79a383", high: "#a9c6a0", waterline: "#77b8c8" },
    segments: 80,
    detail: {
      strength: 1,
      macroScale: 22,
      detailScale: 3,
      material: libraryTerrainMaterial("foliage/grass-macro"),
    },
  }),
  // Colours, sun and haze come from the game's `mood: "day"`.
  sky: sky({ preset: "day" }),
  structures: [
    building({
      count: 6,
      position: [0, -92],
      footprint: { w: 12, d: 10 },
      stories: [2, 5],
      spacing: 6,
      style: "coastal",
      palette: { wall: "#ecdcc0", roof: "#c85a44" },
      seed: "brightway-park-town",
    }),
    building({
      count: 4,
      position: [-78, -30],
      footprint: { w: 10, d: 10 },
      stories: [1, 3],
      spacing: 6,
      style: "village",
      palette: { wall: "#f0e3c8", roof: "#5a86b0" },
      seed: "brightway-park-west",
    }),
    building({
      count: 4,
      position: [78, -30],
      footprint: { w: 10, d: 10 },
      stories: [1, 3],
      spacing: 6,
      style: "village",
      palette: { wall: "#f0e3c8", roof: "#c8a24a" },
      seed: "brightway-park-east",
    }),
  ],
});

export const physics: PhysicsConfig = { gravity: -20 };
