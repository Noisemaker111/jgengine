import type { EditorVec3 } from "@jgengine/core/editor/index";
import type { TerrainField } from "@jgengine/core/world/terrain";
import { editableTerrainFromSnapshot, type TerraformSnapshot } from "@jgengine/core/world/terraform";
import type { GizmoMode, SnapMode } from "./uiStore";

/** Compose authored sculpt offsets over the same base field as the terrain preview. @internal */
export function placementGround(terrain: TerraformSnapshot | undefined, base: TerrainField | null): TerrainField | null {
  return terrain === undefined ? base : editableTerrainFromSnapshot(terrain, base ?? undefined);
}

/** Snap XZ and resample the shared ground field; reject a nonfinite surface height. @internal */
export function snapPlacement(
  point: EditorVec3,
  mode: SnapMode,
  gridSize: number,
  groundHeightAt: (x: number, z: number) => number,
): EditorVec3 | null {
  if (mode !== "grid" || !Number.isFinite(gridSize) || gridSize <= 0) return point;
  const x = Math.round(point.x / gridSize) * gridSize;
  const z = Math.round(point.z / gridSize) * gridSize;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const y = groundHeightAt(x, z);
  return Number.isFinite(y) ? { x, y, z } : null;
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
