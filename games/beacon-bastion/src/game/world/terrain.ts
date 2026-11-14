import { terrain, type TerrainEnvironmentDescriptor } from "@jgengine/core/world/features";


export const TERRAIN: TerrainEnvironmentDescriptor = terrain({
  // Wider than the 84 m street map so the tilted camera sees the rest of town past the edge, not sky.
  bounds: { w: 220, d: 220 },
  height: 1.2,
  frequency: 0.05,
  octaves: 4,
  seed: "do-not-disturb",
  baseHeight: 0,
  segments: 300,
  material: "highland",
  // A mown small-town green, gently rolling: the lawns between the houses, not open country.
  colors: { low: "#5a9a3e", high: "#8cc254", waterline: "#3d6a70" },
  // Subtle noise-driven ground surface — mostly grass, with rock breaking through only on the steep
  // mound flanks. The sand band is pushed below the world (no water here) so the meadow stays green;
  // low strength lets the grass base read through instead of the flat vertex-colour ground it shipped with.
  detail: {
    rockColor: "#9a9488",
    sandColor: "#a8c45e",
    rockSlopeStart: 0.9,
    snowHeight: 200,
    detailScale: 3,
    macroScale: 30,
    roughness: 0.95,
    strength: 0.4,
  },
});
