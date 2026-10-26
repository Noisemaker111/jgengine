import * as THREE from "three";
import type { PointerHit, PointerVec3 } from "@jgengine/core/input/pointer";

export const POINTER_ENTITY_KEY = "jgEntityId";
export const POINTER_OBJECT_KEY = "jgObjectId";
/** Object-store identities indexed by the current compacted GPU instance slot. @internal */
export const POINTER_OBJECT_INSTANCES_KEY = "jgObjectInstances";
/** Entity identities indexed by the current compacted GPU batch slot. @internal */
export const POINTER_ENTITY_INSTANCES_KEY = "jgEntityInstances";

export type PointerHitFilter = (object: THREE.Object3D) => boolean;

interface PointerDeps {
  camera: THREE.Camera;
  scene: THREE.Scene;
  width: number;
  height: number;
  layers?: THREE.Layers;
  filter?: PointerHitFilter;
  /**
   * The world's terrain height at x/z (bound only for a world with a real terrain, not a flat
   * arena, so geometry below y=0 stays clickable there). When bound, a cursor over open ground lands on the ground
   * itself (terrain hills included) even where no ground mesh answers the raycast, and a mesh hit
   * farther away than the ground (a sky dome, a backdrop) loses to the ground in front of it.
   */
  groundHeightAt?: (x: number, z: number) => number;
}

/** Furthest the pointer looks for ground along the cursor ray, metres. */
const GROUND_REACH_M = 4000;
/** First march step along the ray before the crossing is refined by bisection, metres; steps grow with distance. */
const GROUND_STEP_M = 1;

/**
 * Where a ray first meets a height field: march forward until the ray dips below the ground, then
 * bisect the crossing. Null when it never does within `reach` (looking at the sky) or when the
 * ray starts under the ground.
 * @internal
 */
export function rayGroundHit(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  groundHeightAt: (x: number, z: number) => number,
  reach = GROUND_REACH_M,
): THREE.Vector3 | null {
  const above = (t: number) => origin.y + direction.y * t - groundHeightAt(origin.x + direction.x * t, origin.z + direction.z * t);
  if (!(above(0) >= 0)) return null;
  let previous = 0;
  for (let t = GROUND_STEP_M; t <= reach; t += Math.max(GROUND_STEP_M, t * 0.02)) {
    const height = above(t);
    if (!Number.isFinite(height)) return null;
    if (height > 0) {
      previous = t;
      continue;
    }
    let low = previous;
    let high = t;
    for (let step = 0; step < 24; step += 1) {
      const mid = (low + high) / 2;
      if (above(mid) > 0) low = mid;
      else high = mid;
    }
    return origin.clone().addScaledVector(direction, high);
  }
  return null;
}

/** Where the cursor is, in normalized device coordinates, and whether it is over the canvas at all. */
export interface PointerCursor {
  x: number;
  y: number;
  present: boolean;
}

export interface PointerService {
  /** Cast the current cursor into the world; null when the cursor is off-canvas. */
  worldHit(): PointerHit | null;
  /** Cast from the viewport center regardless of cursor presence (pointer-lock aim); null before the probe binds. */
  worldHitCenter(): PointerHit | null;
  /** Project a world point to CSS pixels for the marquee / HUD; null before the probe binds. */
  screenOf(world: PointerVec3): { x: number; y: number } | null;
  /** The world ray under the cursor, with no scene test; null when the cursor is off-canvas or nothing is bound. */
  cursorRay(): { origin: PointerVec3; direction: PointerVec3 } | null;
  bind(deps: PointerDeps | null): void;
  /** The cursor the casts read. */
  state(): PointerCursor;
  /** Move the cursor (a pointer event, a pointer-lock center, a restored session). */
  setState(cursor: PointerCursor): void;
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

function standardMaterialSample(
  material: THREE.Material | readonly THREE.Material[],
): { color: string; metalness?: number; roughness?: number } | null {
  const candidates = Array.isArray(material) ? material : [material];
  const standard = candidates.find((entry): entry is THREE.MeshStandardMaterial => entry instanceof THREE.MeshStandardMaterial);
  if (standard === undefined) return null;
  return { color: `#${standard.color.getHexString()}`, metalness: standard.metalness, roughness: standard.roughness };
}

export function createPointerService(): PointerService {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const centerNdc = new THREE.Vector2(0, 0);
  const scratch = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  const instanceMatrix = new THREE.Matrix4();
  const hitMatrix = new THREE.Matrix4();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let deps: PointerDeps | null = null;
  let cursorPresent = false;

  function hitAtNdc(target: THREE.Vector2): PointerHit | null {
    if (deps === null) return null;
    if (deps.layers !== undefined) raycaster.layers.mask = deps.layers.mask;
    else raycaster.layers.enableAll();
    raycaster.setFromCamera(target, deps.camera);
    const intersects = raycaster.intersectObjects(deps.scene.children, true);
    const ground = deps.groundHeightAt === undefined ? null : rayGroundHit(raycaster.ray.origin, raycaster.ray.direction, deps.groundHeightAt);
    const groundDistance = ground === null ? Infinity : ground.distanceTo(raycaster.ray.origin);
    for (const hit of intersects) {
      // Anything behind the ground (a sky dome, a far backdrop) is not what the cursor is over.
      if (hit.distance > groundDistance + 0.25) break;
      if (deps.filter !== undefined && !deps.filter(hit.object)) continue;
      const mesh = hit.object as THREE.Mesh;
      if (!mesh.isMesh) continue;
      const point: PointerVec3 = [hit.point.x, hit.point.y, hit.point.z];
      let normal: PointerVec3 = [0, 1, 0];
      if (hit.face !== null && hit.face !== undefined) {
        hitMatrix.copy(hit.object.matrixWorld);
        if ((mesh as THREE.InstancedMesh).isInstancedMesh && hit.instanceId !== undefined) {
          (mesh as THREE.InstancedMesh).getMatrixAt(hit.instanceId, instanceMatrix);
          hitMatrix.multiply(instanceMatrix);
        }
        normalMatrix.getNormalMatrix(hitMatrix);
        scratch.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize();
        normal = [scratch.x, scratch.y, scratch.z];
      }
      const uv = hit.uv !== undefined ? { u: hit.uv.x, v: hit.uv.y } : undefined;
      return {
        point,
        normal,
        entity: hit.instanceId === undefined ? tagOf(hit.object, POINTER_ENTITY_KEY) :
          (hit.object.userData[POINTER_ENTITY_INSTANCES_KEY] as readonly string[] | undefined)?.[hit.instanceId] ?? tagOf(hit.object, POINTER_ENTITY_KEY),
        object: hit.instanceId === undefined ? tagOf(hit.object, POINTER_OBJECT_KEY) :
          (hit.object.userData[POINTER_OBJECT_INSTANCES_KEY] as readonly string[] | undefined)?.[hit.instanceId] ?? tagOf(hit.object, POINTER_OBJECT_KEY),
        ...(uv !== undefined ? { uv } : {}),
        material: standardMaterialSample(mesh.material),
        ...(hit.instanceId !== undefined ? { instanceId: hit.instanceId } : {}),
      };
    }
    if (ground !== null) return { point: [ground.x, ground.y, ground.z], normal: [0, 1, 0], entity: null, object: null };
    const grounded = raycaster.ray.intersectPlane(groundPlane, scratch);
    if (grounded === null) return null;
    return { point: [grounded.x, grounded.y, grounded.z], normal: [0, 1, 0], entity: null, object: null };
  }

  return {
    bind: (next) => {
      deps = next;
    },
    state: () => ({ x: ndc.x, y: ndc.y, present: cursorPresent }),
    setState: (cursor) => {
      ndc.set(cursor.x, cursor.y);
      cursorPresent = cursor.present;
    },
    worldHit() {
      if (!cursorPresent) return null;
      return hitAtNdc(ndc);
    },
    worldHitCenter() {
      return hitAtNdc(centerNdc);
    },
    cursorRay() {
      if (!cursorPresent || deps === null) return null;
      raycaster.setFromCamera(ndc, deps.camera);
      const { origin, direction } = raycaster.ray;
      return { origin: [origin.x, origin.y, origin.z], direction: [direction.x, direction.y, direction.z] };
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
