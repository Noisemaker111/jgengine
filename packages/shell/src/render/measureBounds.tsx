import { useFrame } from "@react-three/fiber";
import { useRef, type ReactNode } from "react";
import * as THREE from "three";

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useGameContext } from "@jgengine/react/provider";

import { measureLocalCollisionTriangles, reportMeasuredCollisionMesh } from "./measureCollisionMesh";

/** Subtrees flagged with this userData key are excluded from bounds measurement — debug gizmos,
 * selection quads, effect billboards that should not inflate the hitbox. Sprites and invisible
 * subtrees are always excluded. */
export const MEASURE_EXCLUDE_KEY = "jgMeasureExclude";

/** Entity-local AABB of the meshes under a measured root, plus how many meshes contributed — the
 * count lets callers detect async subtree fill-in without diffing bounds. */
export interface MeasuredLocalBounds {
  min: [number, number, number];
  max: [number, number, number];
  meshCount: number;
}

const IDENTITY = new THREE.Matrix4();
const tmpBox = new THREE.Box3();

/**
 * Measure the meshes under `root` in `root`'s own frame (root's transform is the measuring frame,
 * children compose their local matrices below it). Returns `null` when nothing measurable is
 * mounted. Skinned meshes measure at bind pose — the standard engine approximation.
 */
export function measureLocalBounds(root: THREE.Object3D): MeasuredLocalBounds | null {
  const box = new THREE.Box3();
  box.makeEmpty();
  const meshCount = collectBounds(root, null, box);
  if (meshCount === 0 || box.isEmpty()) return null;
  return {
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z],
    meshCount,
  };
}

function collectBounds(object: THREE.Object3D, parentMatrix: THREE.Matrix4 | null, into: THREE.Box3): number {
  if (parentMatrix !== null) {
    if (!object.visible) return 0;
    if ((object as { isSprite?: boolean }).isSprite === true) return 0;
    if (object.userData[MEASURE_EXCLUDE_KEY] === true) return 0;
  }
  let matrix: THREE.Matrix4 | null = null;
  if (parentMatrix !== null) {
    if (object.matrixAutoUpdate) object.updateMatrix();
    matrix = new THREE.Matrix4().multiplyMatrices(parentMatrix, object.matrix);
  }
  let count = 0;
  const mesh = object as THREE.Mesh;
  if (mesh.isMesh === true && mesh.geometry !== undefined) {
    const geometry = mesh.geometry;
    if (geometry.boundingBox === null) geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (bounds !== null && !bounds.isEmpty()) {
      tmpBox.copy(bounds);
      if (matrix !== null) tmpBox.applyMatrix4(matrix);
      into.union(tmpBox);
      count += 1;
    }
  }
  const childMatrix = matrix ?? IDENTITY;
  for (const child of object.children) count += collectBounds(child, childMatrix, into);
  return count;
}

const reportedByContext = new WeakMap<object, Map<string, MeasuredLocalBounds>>();
const EPSILON = 0.01;

function boundsClose(a: MeasuredLocalBounds, b: MeasuredLocalBounds): boolean {
  for (let axis = 0; axis < 3; axis += 1) {
    if (Math.abs(a.min[axis]! - b.min[axis]!) > EPSILON) return false;
    if (Math.abs(a.max[axis]! - b.max[axis]!) > EPSILON) return false;
  }
  return true;
}

/** Forward a measured result into the context (entity kind or object catalog id), deduping repeat
 * reports of the same shape so remounts and multi-instance kinds don't churn collider resolution. */
export function reportMeasuredBounds(
  ctx: GameContext,
  target: "entity" | "object",
  key: string,
  bounds: MeasuredLocalBounds,
): void {
  let map = reportedByContext.get(ctx);
  if (map === undefined) {
    map = new Map();
    reportedByContext.set(ctx, map);
  }
  const registryKey = `${target}:${key}`;
  const prev = map.get(registryKey);
  if (prev !== undefined && prev.meshCount === bounds.meshCount && boundsClose(prev, bounds)) return;
  const accepted =
    target === "entity"
      ? ctx.scene.entity.reportBounds(key, bounds)
      : ctx.scene.object.reportBounds(key, bounds);
  if (accepted) map.set(registryKey, bounds);
}

/** Frames-since-mount at which a marker re-measures — bounded retries catch content that fills in
 * asynchronously after first mount without paying a traversal every frame forever. */
const MEASURE_FRAMES: readonly number[] = [1, 15, 30, 60];

/**
 * Wraps custom-rendered actor content (`renderEntity` / `renderObject`) and reports its measured
 * entity-local bounds into collider resolution, so the hitbox wraps what is actually on screen
 * instead of the fixed-size fallback box. A successful measure re-reports only when the subtree
 * gained or lost meshes (async fill-in), not when idle animation nudges the same meshes.
 */
export function MeasuredBoundsGroup({
  target,
  measureKey,
  children,
}: {
  target: "entity" | "object";
  measureKey: string;
  children: ReactNode;
}) {
  const ctx = useGameContext();
  const groupRef = useRef<THREE.Group>(null);
  const frameRef = useRef(0);
  const attemptRef = useRef(0);
  const lastMeshCountRef = useRef<number | null>(null);

  useFrame(() => {
    if (attemptRef.current >= MEASURE_FRAMES.length) return;
    frameRef.current += 1;
    if (frameRef.current < MEASURE_FRAMES[attemptRef.current]!) return;
    attemptRef.current += 1;
    const group = groupRef.current;
    if (group === null) return;
    const measured = measureLocalBounds(group);
    if (measured === null) return;
    if (lastMeshCountRef.current === measured.meshCount) return;
    lastMeshCountRef.current = measured.meshCount;
    reportMeasuredBounds(ctx, target, measureKey, measured);
    const triangles = measureLocalCollisionTriangles(group);
    if (triangles !== null) reportMeasuredCollisionMesh(ctx, target, measureKey, triangles);
  });

  return <group ref={groupRef}>{children}</group>;
}
