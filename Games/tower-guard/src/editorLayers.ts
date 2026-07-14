import type { EditorDocument } from "@jgengine/core/editor/index";
import { SCATTER_PATH_KIND } from "@jgengine/core/world/scatterRegion";
import { createEditableTerrain, migrateTerrainSnapshot, type TerraformSnapshot } from "@jgengine/core/world/terraform";

const BOUNDS = { minX: -42, minZ: -42, maxX: 42, maxZ: 42 };

/**
 * Authored heightfield for the arena: gentle perimeter mounds raised away from the central creep
 * path and build plots. Consumed at runtime as `environment({ sculpt })` (so ground render + collision
 * agree) and shown in the editor as `document.terrain`.
 */
function buildSculpt(): TerraformSnapshot {
  const terrain = createEditableTerrain({ bounds: BOUNDS, cellSize: 2 });
  const mounds: readonly [number, number, number][] = [
    [-33, -33, 2.6],
    [33, -33, 2.4],
    [-33, 33, 2.4],
    [33, 33, 2.6],
    [0, -37, 1.8],
    [0, 37, 1.8],
    [-38, 0, 1.6],
    [38, 0, 1.6],
  ];
  for (const [cx, cz, strength] of mounds) {
    terrain.apply({ mode: "raise", center: [cx, cz], radius: 13, strength, falloff: "smooth" });
  }
  // migrate seeds an (empty) material layer stack so the snapshot is 2.0-shaped from the start.
  return migrateTerrainSnapshot(terrain.snapshot());
}

export const TERRAIN_SCULPT: TerraformSnapshot = buildSculpt();

/** Corner + edge foliage bands, kept off the central path so gameplay reads unchanged. */
const FOLIAGE_REGIONS: readonly (readonly [number, number][])[] = [
  [
    [-42, -42],
    [-16, -42],
    [-16, -18],
    [-42, -18],
  ],
  [
    [16, 18],
    [42, 18],
    [42, 42],
    [16, 42],
  ],
  [
    [-42, 16],
    [-18, 16],
    [-18, 42],
    [-42, 42],
  ],
  [
    [18, -42],
    [42, -42],
    [42, -18],
    [18, -18],
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
      density: 0.34,
      minSpacing: 1.6,
      seed: `tower-guard-${index}`,
      maxSlope: 3,
      minScale: 0.9,
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
