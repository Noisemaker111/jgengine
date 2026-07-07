import * as THREE from "three";
import type { PointerHit, PointerVec3 } from "@jgengine/core/input/pointer";

export const POINTER_ENTITY_KEY = "jgEntityId";
export const POINTER_OBJECT_KEY = "jgObjectId";

interface PointerDeps {
  camera: THREE.Camera;
  scene: THREE.Scene;
  width: number;
  height: number;
}

export interface PointerService {
  /** Cast the current cursor into the world; null when the cursor is off-canvas. */
  worldHit(): PointerHit | null;
  /** Project a world point to CSS pixels for the marquee / HUD; null before the probe binds. */
  screenOf(world: PointerVec3): { x: number; y: number } | null;
  hasCursor(): boolean;
  bind(deps: PointerDeps | null): void;
  setCursor(ndcX: number, ndcY: number, present: boolean): void;
}

function tagOf(object: THREE.Object3D, key: string): string | null {
  let cursor: THREE.Object3D | null = object;
  while (cursor !== null) {
    const value = cursor.userData[key];
    if (typeof value === "string") return value;
    cursor = cursor.parent;
  }
  return null;
}

export function createPointerService(): PointerService {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const scratch = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let deps: PointerDeps | null = null;
  let cursorPresent = false;

  return {
    hasCursor: () => cursorPresent,
    bind: (next) => {
      deps = next;
    },
    setCursor: (ndcX, ndcY, present) => {
      ndc.set(ndcX, ndcY);
      cursorPresent = present;
    },
    worldHit() {
      if (deps === null || !cursorPresent) return null;
      raycaster.setFromCamera(ndc, deps.camera);
      const intersects = raycaster.intersectObjects(deps.scene.children, true);
      for (const hit of intersects) {
        if (!(hit.object as THREE.Mesh).isMesh) continue;
        const point: PointerVec3 = [hit.point.x, hit.point.y, hit.point.z];
        let normal: PointerVec3 = [0, 1, 0];
        if (hit.face !== null && hit.face !== undefined) {
          normalMatrix.getNormalMatrix(hit.object.matrixWorld);
          scratch.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize();
          normal = [scratch.x, scratch.y, scratch.z];
        }
        return {
          point,
          normal,
          entity: tagOf(hit.object, POINTER_ENTITY_KEY),
          object: tagOf(hit.object, POINTER_OBJECT_KEY),
        };
      }
      const grounded = raycaster.ray.intersectPlane(groundPlane, scratch);
      if (grounded === null) return null;
      return { point: [grounded.x, grounded.y, grounded.z], normal: [0, 1, 0], entity: null, object: null };
    },
    screenOf(world) {
      if (deps === null) return null;
      scratch.set(world[0], world[1], world[2]).project(deps.camera);
      return {
        x: (scratch.x * 0.5 + 0.5) * deps.width,
        y: (-scratch.y * 0.5 + 0.5) * deps.height,
      };
    },
  };
}
