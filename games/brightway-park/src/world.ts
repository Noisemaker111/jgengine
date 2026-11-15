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
    // Moonlit turf: blue-green low ground, a paler crest, black-teal water at the line.
    colors: { low: "#22332f", high: "#34433d", waterline: "#1f4a58" },
    segments: 80,
    detail: {
      strength: 1,
      macroScale: 22,
      detailScale: 3,
      material: libraryTerrainMaterial("foliage/grass-macro"),
    },
  }),
  // Colours, moon and haze come from the game's night `mood`, and the sky follows the haunt's clock: it
  // starts at noon (`dayOffset` 0.5), so the living arrive under a sunset and leave in a pale dawn, and
  // the mood's moonlight is the floor the small hours keep (`nightLight`).
  sky: sky({ preset: "night", timeOfDay: true, dayOffset: 0.5, nightLight: 0.85 }),
});

export const physics: PhysicsConfig = { gravity: -20 };
