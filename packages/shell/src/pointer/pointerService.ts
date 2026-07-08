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

export interface SurfaceSample {
  color: string;
  metalness?: number;
  roughness?: number;
}

export interface PointerService {
  /** Cast the current cursor into the world; null when the cursor is off-canvas. */
  worldHit(): PointerHit | null;
  /** Cast from the viewport center regardless of cursor presence (pointer-lock aim); null before the probe binds. */
  worldHitCenter(): PointerHit | null;
  /** Project a world point to CSS pixels for the marquee / HUD; null before the probe binds. */
  screenOf(world: PointerVec3): { x: number; y: number } | null;
  hasCursor(): boolean;
  bind(deps: PointerDeps | null): void;
  setCursor(ndcX: number, ndcY: number, present: boolean): void;
  /** Reads the last `worldHit`/`worldHitCenter` intersection's material; null when there was no hit or it isn't a standard material. */
  sampleSurface(): SurfaceSample | null;
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
  const centerNdc = new THREE.Vector2(0, 0);
  const scratch = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let deps: PointerDeps | null = null;
  let cursorPresent = false;
  let lastIntersection: THREE.Intersection | null = null;

  function hitAtNdc(target: THREE.Vector2): PointerHit | null {
    if (deps === null) return null;
    raycaster.setFromCamera(target, deps.camera);
    const intersects = raycaster.intersectObjects(deps.scene.children, true);
    for (const hit of intersects) {
      if (!(hit.object as THREE.Mesh).isMesh) continue;
      lastIntersection = hit;
      const point: PointerVec3 = [hit.point.x, hit.point.y, hit.point.z];
      let normal: PointerVec3 = [0, 1, 0];
      if (hit.face !== null && hit.face !== undefined) {
        normalMatrix.getNormalMatrix(hit.object.matrixWorld);
        scratch.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize();
        normal = [scratch.x, scratch.y, scratch.z];
      }
      const uv = hit.uv !== undefined ? { u: hit.uv.x, v: hit.uv.y } : undefined;
      return {
        point,
        normal,
        entity: tagOf(hit.object, POINTER_ENTITY_KEY),
        object: tagOf(hit.object, POINTER_OBJECT_KEY),
        ...(uv !== undefined ? { uv } : {}),
      };
    }
    lastIntersection = null;
    const grounded = raycaster.ray.intersectPlane(groundPlane, scratch);
    if (grounded === null) return null;
    return { point: [grounded.x, grounded.y, grounded.z], normal: [0, 1, 0], entity: null, object: null };
  }

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
      if (!cursorPresent) return null;
      return hitAtNdc(ndc);
    },
    worldHitCenter() {
      return hitAtNdc(centerNdc);
    },
    screenOf(world) {
      if (deps === null) return null;
      scratch.set(world[0], world[1], world[2]).project(deps.camera);
      return {
        x: (scratch.x * 0.5 + 0.5) * deps.width,
        y: (-scratch.y * 0.5 + 0.5) * deps.height,
      };
    },
    sampleSurface() {
      if (lastIntersection === null) return null;
      const mesh = lastIntersection.object as THREE.Mesh;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const material = materials[lastIntersection.face?.materialIndex ?? 0];
      if (material === undefined || !(material as THREE.MeshStandardMaterial).isMeshStandardMaterial) return null;
      const standard = material as THREE.MeshStandardMaterial;
      return {
        color: `#${standard.color.getHexString()}`,
        metalness: standard.metalness,
        roughness: standard.roughness,
      };
    },
  };
}
