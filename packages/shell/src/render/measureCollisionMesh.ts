import * as THREE from "three";

import type { CollisionMeshSource } from "@jgengine/core/scene/collisionMesh";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { MEASURE_EXCLUDE_KEY } from "./measureBounds";

/** Above this the model is too dense to double as its own hitbox — keep the fitted box instead of
 * paying BVH build + per-ray traversal on a hero-detail mesh. Game-ready low-poly assets sit far under it. */
const MAX_COLLISION_TRIANGLES = 60_000;

/** Entity-local triangle soup of the meshes under a measured root, plus the contributing mesh count
 * (same async fill-in detection as measured bounds). Satisfies {@link CollisionMeshSource}. */
export interface MeasuredCollisionTriangles extends CollisionMeshSource {
  positions: Float32Array;
  indices: Uint32Array;
  triangleCount: number;
  meshCount: number;
}

const IDENTITY = new THREE.Matrix4();
const tmpVec = new THREE.Vector3();

interface TriangleSink {
  positions: number[];
  indices: number[];
  meshCount: number;
  triangleCount: number;
  overflow: boolean;
}

function collectTriangles(object: THREE.Object3D, parentMatrix: THREE.Matrix4 | null, sink: TriangleSink): void {
  if (sink.overflow) return;
  if (parentMatrix !== null) {
    if (!object.visible) return;
    if ((object as { isSprite?: boolean }).isSprite === true) return;
    if (object.userData[MEASURE_EXCLUDE_KEY] === true) return;
  }
  let matrix: THREE.Matrix4 | null = null;
  if (parentMatrix !== null) {
    if (object.matrixAutoUpdate) object.updateMatrix();
    matrix = new THREE.Matrix4().multiplyMatrices(parentMatrix, object.matrix);
  }
  const mesh = object as THREE.Mesh;
  if (mesh.isMesh === true && mesh.geometry !== undefined) {
    const geometry = mesh.geometry;
    const positionAttribute = geometry.getAttribute("position");
    if (positionAttribute !== undefined && positionAttribute.itemSize === 3 && positionAttribute.count >= 3) {
      const base = sink.positions.length / 3;
      const applied = matrix ?? IDENTITY;
      for (let v = 0; v < positionAttribute.count; v += 1) {
        tmpVec.fromBufferAttribute(positionAttribute, v).applyMatrix4(applied);
        sink.positions.push(tmpVec.x, tmpVec.y, tmpVec.z);
      }
      const index = geometry.getIndex();
      const triangleCount = index !== null ? Math.floor(index.count / 3) : Math.floor(positionAttribute.count / 3);
      if (sink.triangleCount + triangleCount > MAX_COLLISION_TRIANGLES) {
        sink.overflow = true;
        return;
      }
      if (index !== null) {
        for (let i = 0; i + 2 < index.count; i += 3) {
          sink.indices.push(base + index.getX(i), base + index.getX(i + 1), base + index.getX(i + 2));
        }
      } else {
        for (let i = 0; i + 2 < positionAttribute.count; i += 3) {
          sink.indices.push(base + i, base + i + 1, base + i + 2);
        }
      }
      sink.triangleCount += triangleCount;
      sink.meshCount += 1;
    }
  }
  const childMatrix = matrix ?? IDENTITY;
  for (const child of object.children) collectTriangles(child, childMatrix, sink);
}

/**
 * Collect the triangle soup of the meshes under `root` in `root`'s own frame — the mesh-accurate
 * counterpart to `measureLocalBounds`, with the same visibility/sprite/{@link MEASURE_EXCLUDE_KEY}
 * exclusions (skinned meshes contribute their bind pose). An optional uniform `scale` + `offset`
 * maps the result into entity-local space when the caller mounts the root scaled/translated (the
 * model-primitive path). Returns `null` when nothing is measurable or the soup exceeds the
 * triangle budget — callers keep their box fallback.
 */
export function measureLocalCollisionTriangles(
  root: THREE.Object3D,
  transform?: { scale: number; offset: readonly [number, number, number] },
): MeasuredCollisionTriangles | null {
  const sink: TriangleSink = { positions: [], indices: [], meshCount: 0, triangleCount: 0, overflow: false };
  collectTriangles(root, null, sink);
  if (sink.overflow || sink.meshCount === 0 || sink.triangleCount === 0) return null;
  const positions = new Float32Array(sink.positions);
  if (transform !== undefined) {
    const { scale, offset } = transform;
    for (let v = 0; v < positions.length; v += 3) {
      positions[v] = positions[v]! * scale + offset[0];
      positions[v + 1] = positions[v + 1]! * scale + offset[1];
      positions[v + 2] = positions[v + 2]! * scale + offset[2];
    }
  }
  return {
    positions,
    indices: new Uint32Array(sink.indices),
    triangleCount: sink.triangleCount,
    meshCount: sink.meshCount,
  };
}

const reportedByContext = new WeakMap<object, Map<string, { meshCount: number; triangleCount: number }>>();

/** Forward measured triangles into the context (entity kind or object catalog id), deduping repeat
 * reports of the same soup so remounts and multi-instance kinds don't rebuild the BVH. */
export function reportMeasuredCollisionMesh(
  ctx: GameContext,
  target: "entity" | "object",
  key: string,
  triangles: MeasuredCollisionTriangles,
): void {
  let map = reportedByContext.get(ctx);
  if (map === undefined) {
    map = new Map();
    reportedByContext.set(ctx, map);
  }
  const registryKey = `${target}:${key}`;
  const prev = map.get(registryKey);
  if (prev !== undefined && prev.meshCount === triangles.meshCount && prev.triangleCount === triangles.triangleCount) {
    return;
  }
  const accepted =
    target === "entity"
      ? ctx.scene.entity.reportCollisionMesh(key, triangles)
      : ctx.scene.object.reportCollisionMesh(key, triangles);
  if (accepted) map.set(registryKey, { meshCount: triangles.meshCount, triangleCount: triangles.triangleCount });
}
