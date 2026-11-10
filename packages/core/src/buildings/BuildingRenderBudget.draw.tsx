import { createContext, useContext, useMemo, useRef, type ReactNode, type RefObject } from "react";
import * as THREE from "three";

import type { VisibilityConfig } from "@jgengine/core/visibility/config";
import { culledByDistance } from "@jgengine/core/visibility/distance";
import { DEFAULT_CULLING_SETTINGS } from "@jgengine/core/visibility/settings";

import { CAMERA_POST_FRAME_PRIORITY } from "@jgengine/core/camera/cameraRigs.draw";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";

/** Resolved shell distance policy for generated facade batches. @internal */
export interface BuildingRenderPolicy {
  enabled: boolean;
  minDistance: number;
  maxDistance: number;
  hysteresis: number;
}

const UNLIMITED: BuildingRenderPolicy = { enabled: false, minDistance: 0, maxDistance: Infinity, hysteresis: 0 };
const BuildingRenderContext = createContext<BuildingRenderPolicy>(UNLIMITED);

/** The policy the most recently mounted {@link BuildingRenderBudget} resolved; draws read it without React context. @internal */
let currentPolicy: BuildingRenderPolicy = UNLIMITED;

/** The distance policy facade parts under the nearest budget follow, for draw-side chunks. @internal */
export function buildingRenderPolicy(): BuildingRenderPolicy {
  return currentPolicy;
}

/** Resolve existing visibility overrides over the already resolved graphics-tier distance. @internal */
export function resolveBuildingRenderPolicy(drawDistance: number, config?: VisibilityConfig, cullingDisabled = false): BuildingRenderPolicy {
  const culling = config?.culling;
  const scene = config?.scene;
  return {
    // Scene callbacks address visibility rows; generated parts have no row to evaluate safely.
    enabled: !cullingDisabled && config?.enabled !== false && culling?.enabled !== false && culling?.distanceCulling !== false
      && scene?.alwaysVisible !== true && scene?.cullingDisabled !== true && scene?.customVisibility === undefined,
    minDistance: scene?.minRenderDistance ?? culling?.defaultMinRenderDistance ?? DEFAULT_CULLING_SETTINGS.defaultMinRenderDistance,
    maxDistance: scene?.maxRenderDistance ?? culling?.defaultMaxRenderDistance ?? drawDistance,
    hysteresis: culling?.hysteresis ?? DEFAULT_CULLING_SETTINGS.hysteresis,
  };
}

/** Forward the shell's resolved graphics distance without registering generated parts as scene objects. @internal */
export function BuildingRenderBudget({ drawDistance, visibility, cullingDisabled = false, children }: {
  drawDistance: number;
  visibility?: VisibilityConfig | undefined;
  cullingDisabled?: boolean;
  children: ReactNode;
}) {
  const policy = useMemo(() => {
    const resolved = resolveBuildingRenderPolicy(drawDistance, visibility, cullingDisabled);
    currentPolicy = resolved;
    return resolved;
  }, [drawDistance, visibility, cullingDisabled]);
  return <BuildingRenderContext.Provider value={policy}>{children}</BuildingRenderContext.Provider>;
}

/** The distance policy facade parts under this budget follow. @internal */
export function useBuildingRenderPolicy(): BuildingRenderPolicy {
  return useContext(BuildingRenderContext);
}

/** Test world bounds; transforming the box first also conservatively encloses affine shear. @internal */
export function buildingChunkWithinBudget(
  bounds: THREE.Box3,
  matrixWorld: THREE.Matrix4,
  cameraPosition: THREE.Vector3,
  policy: BuildingRenderPolicy,
  previouslyVisible: boolean,
  worldBounds: THREE.Box3,
  worldSphere: THREE.Sphere,
  frustumSphere?: THREE.Sphere | null,
): boolean {
  worldBounds.copy(bounds).applyMatrix4(matrixWorld).getBoundingSphere(worldSphere);
  if (frustumSphere !== undefined && frustumSphere !== null) {
    bounds.getCenter(frustumSphere.center);
    const worldScale = matrixWorld.getMaxScaleOnAxis();
    // Three transforms this sphere using the largest matrix column, which can underbound shear.
    frustumSphere.radius = Math.max(bounds.min.distanceTo(bounds.max) / 2,
      worldScale === 0 ? 0 : worldSphere.radius / worldScale);
  }
  if (!policy.enabled) return true;
  const { center, radius } = worldSphere;
  return !culledByDistance(
    cameraPosition.x, cameraPosition.y, cameraPosition.z,
    center.x, center.y, center.z,
    policy.minDistance, policy.maxDistance, radius,
    previouslyVisible ? policy.hysteresis : 0,
  );
}

/**
 * Distance-gate chunks only; Three retains independent main-camera and shadow-camera frustum tests.
 * A chunk's world bounds are measured when it mounts and again only when the scene's own matrix pass
 * has moved it, so a still city costs one distance test per chunk a frame, not a walk up its parents.
 * @internal
 */
export function useBuildingChunkBudget(meshRef: RefObject<THREE.InstancedMesh | null>, bounds: THREE.Box3): void {
  const policy = useContext(BuildingRenderContext);
  const scratch = useRef({ box: new THREE.Box3(), sphere: new THREE.Sphere(), camera: new THREE.Vector3(), placed: new THREE.Matrix4(), mesh: null as THREE.InstancedMesh | null, bounds: null as THREE.Box3 | null, frustum: undefined as number | undefined });
  useFrameTask(({ camera }) => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    syncBuildingChunkBudget(mesh, bounds, camera, scratch.current, policy);
  }, CAMERA_POST_FRAME_PRIORITY);
}

/** Scratch state for {@link syncBuildingChunkBudget}; one per draw instance. @internal */
export interface BuildingChunkBudgetScratch {
  box: THREE.Box3;
  sphere: THREE.Sphere;
  camera: THREE.Vector3;
  placed: THREE.Matrix4;
  mesh: THREE.InstancedMesh | null;
  bounds: THREE.Box3 | null;
  frustum: number | undefined;
}

export function buildingChunkBudgetScratch(): BuildingChunkBudgetScratch {
  return { box: new THREE.Box3(), sphere: new THREE.Sphere(), camera: new THREE.Vector3(), placed: new THREE.Matrix4(), mesh: null, bounds: null, frustum: undefined };
}

/**
 * The draw-side form of {@link useBuildingChunkBudget}: the same one-distance-test-per-chunk frame
 * at camera-post priority, reading the policy from {@link buildingRenderPolicy} when `policy` is
 * omitted. Call once per frame from the owning draw.
 * @internal
 */
export function syncBuildingChunkBudget(
  mesh: THREE.InstancedMesh,
  bounds: THREE.Box3,
  camera: THREE.Camera,
  scratch: BuildingChunkBudgetScratch,
  policy: BuildingRenderPolicy = buildingRenderPolicy(),
): void {
  camera.getWorldPosition(scratch.camera);
  if (scratch.mesh !== mesh || scratch.bounds !== bounds || scratch.frustum !== mesh.boundingSphere?.radius || !scratch.placed.equals(mesh.matrixWorld)) {
    if (scratch.mesh !== mesh) mesh.updateWorldMatrix(true, false);
    scratch.mesh = mesh;
    scratch.bounds = bounds;
    scratch.placed.copy(mesh.matrixWorld);
    mesh.visible = buildingChunkWithinBudget(bounds, mesh.matrixWorld, scratch.camera, policy, mesh.visible, scratch.box, scratch.sphere, mesh.boundingSphere);
    scratch.frustum = mesh.boundingSphere?.radius;
    return;
  }
  if (!policy.enabled) return;
  const { center, radius } = scratch.sphere;
  mesh.visible = !culledByDistance(scratch.camera.x, scratch.camera.y, scratch.camera.z, center.x, center.y, center.z,
    policy.minDistance, policy.maxDistance, radius, mesh.visible ? policy.hysteresis : 0);
}
