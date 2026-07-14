import type { EditorDocument } from "@jgengine/core/editor/index";
import { SCATTER_PATH_KIND } from "@jgengine/core/world/scatterRegion";
import { createEditableTerrain, migrateTerrainSnapshot, type TerraformSnapshot } from "@jgengine/core/world/terraform";

const BOUNDS = { minX: -42, minZ: -42, maxX: 42, maxZ: 42 };

/**
 * Authored heightfield for the arena: gentle perimeter mounds raised away from the central creep
 * path and build plots. Consumed at runtime as `environment({ sculpt })` (so ground render + collision
 * agree) and shown in the editor as `document.terrain`.
 */
// Gentle rolling mounds, only in the two open triangles the creep staircase never crosses
// (upper-left and lower-right) — kept clear of the path corridor and build plots so the flat
// path ribbon never clips through raised ground.
function buildSculpt(): TerraformSnapshot {
  const terrain = createEditableTerrain({ bounds: BOUNDS, cellSize: 2 });
  const mounds: readonly [number, number, number, number][] = [
    // [cx, cz, radius, strength] — upper-left
    [-32, 26, 11, 2.2],
    [-18, 34, 9, 1.5],
    [-36, 12, 8, 1.2],
    // lower-right
    [32, -26, 11, 2.2],
    [18, -34, 9, 1.5],
    [36, -12, 8, 1.2],
  ];
  for (const [cx, cz, radius, strength] of mounds) {
    terrain.apply({ mode: "raise", center: [cx, cz], radius, strength, falloff: "smooth" });
  }
  // migrate seeds an (empty) material layer stack so the snapshot is 2.0-shaped from the start.
  return migrateTerrainSnapshot(terrain.snapshot());
}

export const TERRAIN_SCULPT: TerraformSnapshot = buildSculpt();

// Organic foliage groves in the two open triangles the creep path never crosses — irregular
// outlines (not squared blocks) so the field reads natural, and clear of the path + build plots.
const FOLIAGE_REGIONS: readonly (readonly [number, number][])[] = [
  // upper-left grove
  [
    [-42, 8],
    [-24, 6],
    [-12, 16],
    [-14, 30],
    [-24, 42],
    [-42, 42],
  ],
  // lower-right grove
  [
    [8, -42],
    [24, -42],
    [42, -30],
    [40, -14],
    [26, -8],
    [12, -18],
  ],
];

/**
 * The game's authored editor document — the sculpted arena plus foliage scatter regions. A runtime
 * scene layer consumes `resolveScatter(this)` to instance the foliage, proving the editor
 * authoring-to-runtime seam end to end. Open F2+E to edit it live.
 */
export const editorLayers: EditorDocument = {
  version: 1,
  markers: [],
  volumes: [],
  paths: FOLIAGE_REGIONS.map((points, index) => ({
    id: `foliage_${index}`,
    kind: SCATTER_PATH_KIND,
    points: points.map(([x, z]) => ({ x, y: 0, z })),
    label: "arena foliage",
    meta: {
      density: 0.2,
      minSpacing: 2,
      seed: `tower-guard-${index}`,
      maxSlope: 3,
      edgeFalloff: 4,
      minScale: 0.85,
      maxScale: 1.7,
      palette: [
        { item: "pine", weight: 3 },
        { item: "tree", weight: 2 },
        { item: "bush", weight: 2 },
        { item: "rock", weight: 1 },
      ],
    },
  })),
  annotations: [],
  terrain: TERRAIN_SCULPT,
  prefabs: [],
  collections: [],
};
