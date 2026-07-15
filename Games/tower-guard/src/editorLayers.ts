import type { EditorDocument, EditorMarker } from "@jgengine/core/editor/index";
import type { AvoidZone } from "@jgengine/core/world/geometry";
import { clearanceZonesFrom, SCATTER_PATH_KIND } from "@jgengine/core/world/scatterRegion";
import { createEditableTerrain, migrateTerrainSnapshot, type TerraformSnapshot } from "@jgengine/core/world/terraform";

import { BUILD_PLOT_XZ, PATH_WAYPOINTS_XZ } from "./game/world/layout";

const BOUNDS = { minX: -42, minZ: -42, maxX: 42, maxZ: 42 };

/**
 * Authored rolling terrain for the arena. The clearance zones (spawn, keep, plots, path) flatten
 * their own spots on top of this, so the mounds add relief everywhere gameplay isn't.
 */
function buildSculpt(): TerraformSnapshot {
  const terrain = createEditableTerrain({ bounds: BOUNDS, cellSize: 2 });
  const mounds: readonly [number, number, number, number][] = [
    [-32, 26, 12, 2.4],
    [-16, 34, 9, 1.5],
    [-38, 4, 9, 1.4],
    [32, -26, 12, 2.4],
    [16, -34, 9, 1.5],
    [38, -4, 9, 1.4],
    [-34, -34, 8, 1.2],
    [34, 34, 8, 1.2],
  ];
  for (const [cx, cz, radius, strength] of mounds) {
    terrain.apply({ mode: "raise", center: [cx, cz], radius, strength, falloff: "smooth" });
  }
  return migrateTerrainSnapshot(terrain.snapshot());
}

export const TERRAIN_SCULPT: TerraformSnapshot = buildSculpt();

// Gameplay spots authored as editor markers: each carries a clearance so foliage keeps off it and
// the ground is flattened under it. Spawn/keep auto-clear by kind; plots opt in via meta.clearance.
const GAMEPLAY_MARKERS: readonly EditorMarker[] = [
  { id: "creep-spawn", kind: "player_spawn", position: { x: PATH_WAYPOINTS_XZ[0]![0], y: 0, z: PATH_WAYPOINTS_XZ[0]![1] }, label: "Spawn", meta: { clearance: 5 } },
  { id: "keep", kind: "goal", position: { x: PATH_WAYPOINTS_XZ.at(-1)![0], y: 0, z: PATH_WAYPOINTS_XZ.at(-1)![1] }, label: "Keep", meta: { clearance: 6 } },
  ...BUILD_PLOT_XZ.map((plot): EditorMarker => ({
    id: plot.id,
    kind: "prop",
    position: { x: plot.xz[0], y: 0, z: plot.xz[1] },
    label: "Build plot",
    meta: { clearance: 3 },
  })),
];

/**
 * One arena-wide foliage region. It is NOT hand-carved around the path — `resolveScatter` clears the
 * gameplay markers and the creep path automatically (their clearance zones), so foliage fills the
 * whole arena except spawns, plots, and the corridor. Draw an area, set density, done.
 */
export const editorLayers: EditorDocument = {
  version: 1,
  markers: [...GAMEPLAY_MARKERS],
  volumes: [],
  paths: [
    {
      id: "creep-path",
      kind: "route",
      points: PATH_WAYPOINTS_XZ.map(([x, z]) => ({ x, y: 0, z })),
      width: 4,
      label: "Creep path",
      meta: { clearance: 2.5 },
    },
    {
      id: "arena-foliage",
      kind: SCATTER_PATH_KIND,
      points: [
        [-40, -40],
        [40, -40],
        [40, 40],
        [-40, 40],
      ].map(([x, z]) => ({ x: x!, y: 0, z: z! })),
      label: "Arena foliage",
      meta: {
        density: 0.16,
        minSpacing: 2,
        seed: "tower-guard-arena",
        maxSlope: 3,
        edgeFalloff: 5,
        minScale: 0.85,
        maxScale: 1.7,
        palette: [
          { item: "pine", weight: 3 },
          { item: "tree", weight: 2 },
          { item: "bush", weight: 2 },
          { item: "rock", weight: 1 },
        ],
        // autoAvoid defaults on — the region honors every gameplay clearance zone in this document.
      },
    },
  ],
  annotations: [],
  terrain: TERRAIN_SCULPT,
  prefabs: [],
  collections: [],
};

/** Clearance discs derived from the authored gameplay spots — flattened into the runtime ground. */
export const CLEARINGS: readonly AvoidZone[] = clearanceZonesFrom(editorLayers);
