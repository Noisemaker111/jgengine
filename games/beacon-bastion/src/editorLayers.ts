import { editorMarkerXZ, seedEditorCatalogs, type EditorLayersInput } from "@jgengine/core/editor/index";
import { normalizeEditorLayers, type EditorDocument } from "@jgengine/shell/gameKit";
import type { AvoidZone } from "@jgengine/core/world/geometry";
import { clearanceZonesFrom } from "@jgengine/core/world/scatterRegion";

import { editorCatalogs } from "./editorCatalogs";
import sceneJson from "./editor.scene.json";

type Vec2 = readonly [number, number];

export const editorLayers: EditorDocument = seedEditorCatalogs(
  normalizeEditorLayers(sceneJson as unknown as EditorLayersInput),
  editorCatalogs,
);

export const TERRAIN_SCULPT = editorLayers.terrain;

/** Clearance discs derived from the authored gameplay spots — flattened into the runtime ground. */
export const CLEARINGS: readonly AvoidZone[] = clearanceZonesFrom(editorLayers);

/** The creep-path polyline (XZ), read from the authored document — the single source for enemy nav. */
export const PATH_WAYPOINTS_XZ: readonly Vec2[] = (
  editorLayers.paths.find((path) => path.id === "creep-path")?.points ?? []
).map((point) => [point.x, point.z] as const);

/**
 * The flank track (XZ), when the document authors one: a second approach that joins the main road
 * near the keep. Empty when the scene has only the one road.
 */
export const FLANK_WAYPOINTS_XZ: readonly Vec2[] = (
  editorLayers.paths.find((path) => path.id === "creep-path-flank")?.points ?? []
).map((point) => [point.x, point.z] as const);

/** Build-plot centers (XZ), read from the authored plot markers — the single source for tower placement. */
export const BUILD_PLOT_XZ: readonly { id: string; xz: Vec2 }[] = editorLayers.markers
  .filter((marker) => marker.id.startsWith("plot-"))
  .map((marker) => ({ id: marker.id, xz: editorMarkerXZ(marker) }));
