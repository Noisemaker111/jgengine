import { type MinimapView, type WorldXZ, projectToMinimap } from "@jgengine/core/world/minimap";
import { BORDER_NODE_INDEX, TOTAL_MAIN_LENGTH, canyonEdges, mainPolyline } from "./canyon";

export const MAP_CENTER: WorldXZ = [
  (mainPolyline[0][0] + mainPolyline[BORDER_NODE_INDEX][0]) / 2,
  (mainPolyline[0][2] + mainPolyline[BORDER_NODE_INDEX][2]) / 2,
];
export const LARGE_MAP_WORLD_RADIUS = TOTAL_MAIN_LENGTH / 2 + 160;
export const CORNER_MAP_WORLD_RADIUS = 140;
export const CORNER_MAP_SIZE = 176;
export const LARGE_MAP_SIZE = 640;

export interface ProjectedEdge {
  readonly id: string;
  readonly kind: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export function projectCanyonEdges(view: MinimapView): readonly ProjectedEdge[] {
  return canyonEdges.map((edge) => {
    const a = projectToMinimap(edge.a, view);
    const b = projectToMinimap(edge.b, view);
    return { id: edge.id, kind: edge.kind, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  });
}
