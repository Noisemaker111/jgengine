import type { Camera } from "three";
import { Raycaster, Vector2, Vector3 } from "three";

import type { BuilderResizeAxis } from "@llmville/game/builder/resize";

/** Project the mouse ray onto a world axis line for smooth 1D face dragging. */
export function projectPointerOntoAxis(
  pointerNdc: Vector2,
  camera: Camera,
  axis: BuilderResizeAxis,
  axisPoint: Vector3,
): number | null {
  const raycaster = new Raycaster();
  raycaster.setFromCamera(pointerNdc, camera);
  const axisDir = new Vector3(
    axis === "x" ? 1 : 0,
    axis === "y" ? 1 : 0,
    axis === "z" ? 1 : 0,
  );
  const rayOffset = raycaster.ray.origin.clone().sub(axisPoint);
  const d = raycaster.ray.direction;
  const rayAxisDot = axisDir.dot(d);
  const axisOffset = axisDir.dot(rayOffset);
  const rayOffsetAlongRay = d.dot(rayOffset);
  const denom = 1 - rayAxisDot * rayAxisDot;
  if (Math.abs(denom) < 1e-8) return null;
  const axisDistance = (axisOffset - rayAxisDot * rayOffsetAlongRay) / denom;
  if (axis === "x") return axisPoint.x + axisDistance;
  if (axis === "y") return axisPoint.y + axisDistance;
  return axisPoint.z + axisDistance;
}
