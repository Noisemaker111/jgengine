import { editorMarkerXZ, seedEditorCatalogs, type EditorLayersInput } from "@jgengine/core/editor/index";
import { normalizeEditorLayers, type EditorDocument } from "@jgengine/shell/gameKit";
import type { AvoidZone } from "@jgengine/core/world/geometry";
import { clearanceZonesFrom } from "@jgengine/core/scatter/scatterRegion";

import { editorCatalogs } from "./editorCatalogs";
import sceneJson from "./editor.scene.json";
import { bindMap, sceneSet, type MapId } from "./maps";

type Vec2 = readonly [number, number];
type BuildingMarker = { id: string; xz: Vec2; rotationY: number; model: string; sign: string | null };

/**
 * The live map's scene document and what the game reads from it. Each map is its own document in the
 * scene set (`maps.ts`); `editor.scene.json` is Main Street and also carries the game's data
 * catalogs (worker numbers), which every map shares. These are live bindings: `bindScene` rebinds
 * them when the set switches maps, and every module importing them sees the new street.
 */
function layersFor(id: MapId): EditorDocument {
  const document = { ...(sceneSet.entry(id).document as object), catalogs: (sceneJson as { catalogs: unknown }).catalogs };
  return seedEditorCatalogs(normalizeEditorLayers(document as unknown as EditorLayersInput), editorCatalogs);
}

const roadOf = (layers: EditorDocument, id: string): readonly Vec2[] =>
  (layers.paths.find((path) => path.id === id)?.points ?? []).map((point) => [point.x, point.z] as const);

export let editorLayers: EditorDocument = layersFor(sceneSet.active());
export let TERRAIN_SCULPT = editorLayers.terrain;
/** Clearance discs derived from the authored gameplay spots — flattened into the runtime ground. */
export let CLEARINGS: readonly AvoidZone[] = clearanceZonesFrom(editorLayers);
/** The main road (XZ), read from the authored document — the single source for enemy nav. */
export let PATH_WAYPOINTS_XZ: readonly Vec2[] = roadOf(editorLayers, "creep-path");
/** The second road (XZ), when the document authors one. Empty when the scene has only the one road. */
export let FLANK_WAYPOINTS_XZ: readonly Vec2[] = roadOf(editorLayers, "creep-path-flank");
/** Build-plot centers (XZ), read from the authored plot markers — the single source for placement. */
export let BUILD_PLOT_XZ: readonly { id: string; xz: Vec2 }[] = [];
/**
 * The street's buildings and lamps, authored as `building` markers: each names the model it stands as
 * in `meta.model`, faces the street by its `rotationY`, and may carry a landmark `sign`.
 */
export let BUILDING_MARKERS: readonly BuildingMarker[] = [];

function derive(layers: EditorDocument): void {
  BUILD_PLOT_XZ = layers.markers.filter((marker) => marker.id.startsWith("plot-")).map((marker) => ({ id: marker.id, xz: editorMarkerXZ(marker) }));
  BUILDING_MARKERS = layers.markers
    .filter((marker) => marker.kind === "building" && typeof marker.meta?.["model"] === "string")
    .map((marker) => ({
      id: marker.id,
      xz: editorMarkerXZ(marker),
      rotationY: marker.rotationY ?? 0,
      model: marker.meta!["model"] as string,
      sign: typeof marker.meta?.["sign"] === "string" ? (marker.meta["sign"] as string) : null,
    }));
}
derive(editorLayers);

/**
 * Every plot id any map authors, in number order. The keep declares one slot per id so a worker can
 * stand on any map's plots; a map with fewer plots simply never offers the rest.
 */
export const ALL_PLOT_IDS: readonly string[] = [
  ...new Set(
    sceneSet.ids.flatMap((id) =>
      ((sceneSet.entry(id).document as { markers?: { id: string }[] }).markers ?? []).map((marker) => marker.id).filter((marker) => marker.startsWith("plot-")),
    ),
  ),
].sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));

/** Rebind everything above to another map's document (the scene set switched). */
export function bindScene(id: MapId): void {
  bindMap(id);
  editorLayers = layersFor(id);
  TERRAIN_SCULPT = editorLayers.terrain;
  CLEARINGS = clearanceZonesFrom(editorLayers);
  PATH_WAYPOINTS_XZ = roadOf(editorLayers, "creep-path");
  FLANK_WAYPOINTS_XZ = roadOf(editorLayers, "creep-path-flank");
  derive(editorLayers);
}
