import type { EditorVec3 } from "@jgengine/core/editor/index";

import type { GizmoPivot } from "./uiStore";

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function meanOf(positions: readonly EditorVec3[]): EditorVec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const point of positions) {
    x += point.x;
    y += point.y;
    z += point.z;
  }
  const n = Math.max(1, positions.length);
  return { x: x / n, y: y / n, z: z / n };
}

/** Aggregate a list of positions into a pivot according to the toolbar pivot mode. */
export function resolvePivotPosition(
  positions: readonly EditorVec3[],
  pivot: GizmoPivot,
  primary: EditorVec3 | null,
): EditorVec3 | null {
  if (positions.length === 0) return primary;
  if (positions.length === 1 || pivot === "origin") return primary ?? positions[0]!;
  if (pivot === "median") {
    return {
      x: medianOf(positions.map((p) => p.x)),
      y: medianOf(positions.map((p) => p.y)),
      z: medianOf(positions.map((p) => p.z)),
    };
  }
  return meanOf(positions);
}
