import type { EditorVec3 } from "@jgengine/core/editor/index";
import type { GizmoMode, SnapMode } from "./uiStore";

/** Apply the toolbar grid to a placement hit without lifting it off the sampled surface. @internal */
export function snapPlacement(point: EditorVec3, mode: SnapMode, gridSize: number): EditorVec3 {
  if (mode !== "grid" || !Number.isFinite(gridSize) || gridSize <= 0) return point;
  return { x: Math.round(point.x / gridSize) * gridSize, y: point.y, z: Math.round(point.z / gridSize) * gridSize };
}

/** Distance from a pointer to a projected path segment, including either endpoint. @internal */
export function pathSegmentDistance(pointer: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((pointer.x - a.x) * dx + (pointer.y - a.y) * dy) / lengthSquared));
  return Math.hypot(pointer.x - a.x - t * dx, pointer.y - a.y - t * dy);
}

/** Group transforms use the translation command for every selected object. @internal */
export function selectionGizmoMode(mode: GizmoMode, kind: string, count: number): GizmoMode {
  if (count > 1) return "translate";
  if (kind === "marker") return mode === "scale" ? "translate" : mode;
  if (kind === "volume") return mode === "rotate" ? "translate" : mode;
  return "translate";
}
