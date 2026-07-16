import type { InspectionCameraConfig, InspectionZoomAnchor } from "@jgengine/core/game/playableGame";

import type { Vec3 } from "./orbitCameraMath";

export type { InspectionCameraConfig, InspectionZoomAnchor };

export interface ResolvedInspectionCameraConfig {
  anchor: InspectionZoomAnchor;
  target: Vec3;
  initialDistance: number;
  initialPosition: Vec3 | null;
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  pan: boolean;
  rotateSpeed: number;
  zoomSpeed: number;
  dampingFactor: number;
}

/** @internal */
export function resolveInspectionCameraConfig(config?: InspectionCameraConfig): ResolvedInspectionCameraConfig {
  return {
    anchor: config?.anchor ?? "target",
    target: {
      x: config?.target?.x ?? 0,
      y: config?.target?.y ?? 0,
      z: config?.target?.z ?? 0,
    },
    initialDistance: config?.initialDistance ?? 6,
    initialPosition:
      config?.initialPosition === undefined
        ? null
        : {
            x: config.initialPosition.x ?? 0,
            y: config.initialPosition.y ?? 0,
            z: config.initialPosition.z ?? 0,
          },
    minDistance: config?.minDistance ?? 2,
    maxDistance: config?.maxDistance ?? 20,
    minPolarAngle: config?.minPolarAngle ?? 0,
    maxPolarAngle: config?.maxPolarAngle ?? Math.PI,
    pan: config?.pan ?? true,
    rotateSpeed: config?.rotateSpeed ?? 0.6,
    zoomSpeed: config?.zoomSpeed ?? 0.6,
    dampingFactor: config?.dampingFactor ?? 0.08,
  };
}

/** Seeds the camera/target world position before OrbitControls mounts. Falls back to `initialDistance` behind `target` on the -Z axis, raised by 40% of that distance, when `initialPosition` is unset.
 * @internal
 */
export function seedInspectionCamera(config: ResolvedInspectionCameraConfig): { camera: Vec3; target: Vec3 } {
  if (config.initialPosition !== null) {
    return { camera: config.initialPosition, target: config.target };
  }
  return {
    camera: {
      x: config.target.x,
      y: config.target.y + config.initialDistance * 0.4,
      z: config.target.z - config.initialDistance,
    },
    target: config.target,
  };
}

/** Maps the anchor mode onto three-stdlib OrbitControls' native `zoomToCursor` flag.
 * @internal
 */
export function resolveInspectionZoomToCursor(anchor: InspectionZoomAnchor): boolean {
  return anchor === "cursor";
}
