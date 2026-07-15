import { terrain, type TerrainEnvironmentDescriptor, type TerrainMaterialRegion } from "@jgengine/core/world/features";

import { PATH_WAYPOINTS_XZ } from "../../editorLayers";

/** Mossy stone crowns on the biggest sculpted mounds — just the peaks read as highland rock, not bare dirt. */
const ROCK_OUTCROPS: readonly TerrainMaterialRegion[] = (
  [
    [-32, 26, 6],
    [32, -26, 6],
    [-38, 4, 5],
    [38, -4, 5],
  ] as const
).map(([x, z, radius]) => ({
  shape: "circle" as const,
  center: [x, z] as const,
  radius,
  falloff: radius * 1.2,
  colors: { low: "#5c6647", high: "#8a8c6e" },
}));

/** A trampled-earth band under the authored creep path — the ground reads as worn where the raiders march. */
const WORN_TRAIL: TerrainMaterialRegion = {
  shape: "polyline",
  points: PATH_WAYPOINTS_XZ.map(([x, z]) => [x, z] as const),
  width: 7,
  falloff: 4,
  colors: { low: "#7a6440", high: "#93794c" },
};

export const TERRAIN: TerrainEnvironmentDescriptor = terrain({
  bounds: { w: 84, d: 84 },
  height: 3,
  frequency: 0.05,
  octaves: 4,
  seed: "tower-guard",
  baseHeight: 0,
  segments: 130,
  material: "highland",
  // Lush grass valleys rising to sunlit ridges — kept green, not yellow.
  colors: { low: "#4d6a33", high: "#7f9a45", waterline: "#3d6a70" },
  materialRegions: [...ROCK_OUTCROPS, WORN_TRAIL],
  // Subtle noise-driven ground surface — mostly grass, with rock breaking through only on the steep
  // mound flanks. The sand band is pushed below the world (no water here) so the meadow stays green;
  // low strength lets the grass base read through instead of the flat vertex-colour ground it shipped with.
  detail: {
    rockColor: "#7c7862",
    sandColor: "#8f9f4e",
    rockSlopeStart: 0.66,
    snowHeight: 200,
    waterLevel: -40,
    detailScale: 3,
    macroScale: 30,
    roughness: 0.95,
    strength: 0.4,
  },
});
