import { createMarkerSet, type MarkerKindStyle, type MarkerSet } from "@jgengine/core/world/markers";
import type { Vec3 } from "./canyonMath";
import { BORDER_NODE_INDEX, canyonBranches, mainPolyline } from "./canyon";

export const PLAYER_MARKER_ID = "survey-player";
export const TRUCK_MARKER_ID = "survey-truck";
export const BORDER_MARKER_ID = "survey-border";

export const MARKER_KIND_STYLES: Record<string, MarkerKindStyle> = {
  fork: { id: "fork", color: "#7d8c65", glyph: "▲", priority: 50 },
  shortcut: { id: "shortcut", color: "#ffc857", glyph: "◆", priority: 70 },
  deadend: { id: "deadend", color: "#e0546b", glyph: "✕", priority: 60 },
  border: { id: "border", color: "#e8d7c3", glyph: "█", priority: 90 },
  player: { id: "player", color: "#ffc857", glyph: "●", priority: 100 },
  truck: { id: "truck", color: "#9c3820", glyph: "■", priority: 95 },
};

export function createCanyonMarkerSet(): MarkerSet {
  const markers = createMarkerSet();
  for (const branch of canyonBranches) {
    markers.add({ id: branch.id, kind: branch.kind, position: branch.waypoints[0], label: branch.label });
  }
  markers.add({ id: BORDER_MARKER_ID, kind: "border", position: mainPolyline[BORDER_NODE_INDEX], label: "Border Arch" });
  return markers;
}

export function syncLiveMarkers(markers: MarkerSet, carPosition: Vec3, truckPosition: Vec3): void {
  markers.add({ id: PLAYER_MARKER_ID, kind: "player", position: carPosition, label: "You" });
  markers.add({ id: TRUCK_MARKER_ID, kind: "truck", position: truckPosition, label: "Target" });
}
