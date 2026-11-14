import { libraryTerrainSurface } from "@jgengine/assets/catalogs/materialLibrary";
import { clearanceZonesFrom } from "@jgengine/core/scatter/scatterRegion";
import { editorLayers } from "./editorLayers";
import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { environment, sky, terrain, type EnvironmentWorldFeature } from "@jgengine/core/world/features";

export const world: EnvironmentWorldFeature = environment({
  sculpt: editorLayers.terrain,
  clearings: clearanceZonesFrom(editorLayers),
  terrain: terrain({
    // Far wider than the 92 m playable box so the RTS camera sees more lawn past the edge, not sky.
    bounds: { w: 260, d: 260 },
    // A mown lawn is nearly flat to us; to an ant it still rolls in soft hummocks.
    height: 1.1,
    frequency: 0.05,
    octaves: 3,
    seed: "lawn-order-backyard",
    segments: 240,
    material: "grass",
    colors: { low: "#4f9a2c", high: "#7cc23c", waterline: "#2f6f3a" },
    // Snow is pushed off-world so the detail shader reads as lawn → bare soil → pebbly patches.
    detail: {
      rockColor: "#8a6a4a",
      sandColor: "#a07a4e",
      rockSlopeStart: 0.62,
      snowHeight: 400,
      detailScale: 2.4,
      macroScale: 22,
      roughness: 0.9,
      strength: 0.5,
      // Macro scans for an ant's-eye ground: grass blades as big as the ants, packed soil on the paths.
      surfaces: {
        ground: libraryTerrainSurface("foliage/grass-macro", { tile: 3, tint: 0.35 }),
        sand: libraryTerrainSurface("ground/dirt-macro", { tile: 3, tint: 0.45 }),
        rock: libraryTerrainSurface("ground/gravel", { tile: 4 }),
      },
    },
  }),
  // Colours, sun and haze come from the game's `mood`.
  sky: sky({ preset: "day", hazeStrength: 0.3, sunGlowStrength: 0.7 }),
});

export const physics: PhysicsConfig = { gravity: -24 };
