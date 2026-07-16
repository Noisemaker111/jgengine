import {
  normalizeEditorLayers,
  seedEditorCatalogs,
  type EditorDocument,
  type EditorLayersInput,
} from "@jgengine/core/editor/index";
import type { AvoidZone } from "@jgengine/core/world/geometry";
import { clearanceZonesFrom } from "@jgengine/core/world/scatterRegion";
import { createEditableTerrain, migrateTerrainSnapshot, type TerraformSnapshot } from "@jgengine/core/world/terraform";

import { editorCatalogs } from "./game/editorCatalogs";
import sceneJson from "./editor.scene.json";

type Vec2 = readonly [number, number];

const BOUNDS = { minX: -42, minZ: -42, maxX: 42, maxZ: 42 };

/**
 * Sculpted arena relief. Authored with the terraform API (equivalent to editor brush strokes); the
 * clearance zones flatten their own spots on top, so the mounds add relief everywhere gameplay isn't.
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

/**
 * The game's scene — the `editor.scene.json` authored in the 3D editor (creep path, build plots,
 * spawn/keep, arena foliage) plus the sculpted terrain. Everything downstream (enemy pathing, plot
 * placement, path + foliage rendering) reads from this one document; nothing is hardcoded in game
 * code. Open F2+E to edit it live and Ctrl+S to save it back.
 */
/** The sculpted heightfield layered into the runtime ground via `environment({ sculpt })`. */
export const TERRAIN_SCULPT: TerraformSnapshot = buildSculpt();

export const editorLayers: EditorDocument = seedEditorCatalogs(
  {
    ...normalizeEditorLayers(sceneJson as unknown as EditorLayersInput),
    terrain: TERRAIN_SCULPT,
  },
  editorCatalogs,
);

/** Clearance discs derived from the authored gameplay spots — flattened into the runtime ground. */
export const CLEARINGS: readonly AvoidZone[] = clearanceZonesFrom(editorLayers);

/** The creep-path polyline (XZ), read from the authored document — the single source for enemy nav. */
export const PATH_WAYPOINTS_XZ: readonly Vec2[] = (
  editorLayers.paths.find((path) => path.id === "creep-path")?.points ?? []
).map((point) => [point.x, point.z] as const);

/** Build-plot centers (XZ), read from the authored plot markers — the single source for tower placement. */
export const BUILD_PLOT_XZ: readonly { id: string; xz: Vec2 }[] = editorLayers.markers
  .filter((marker) => marker.id.startsWith("plot-"))
  .map((marker) => ({ id: marker.id, xz: [marker.position.x, marker.position.z] as const }));
