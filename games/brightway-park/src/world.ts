import { libraryTerrainMaterial } from "@jgengine/assets/catalogs/materialLibrary";
import { editorLayers } from "./editorLayers";
import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import {
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
  // Colours, sun and haze come from the game's `mood`.
  sky: sky({ preset: "day" }),
});

export const physics: PhysicsConfig = { gravity: -20 };
