import { createContext, useContext, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import type { VisibilityConfig } from "@jgengine/core/visibility/config";
import { culledByDistance } from "@jgengine/core/visibility/distance";
import { DEFAULT_CULLING_SETTINGS } from "@jgengine/core/visibility/settings";

import { CAMERA_POST_FRAME_PRIORITY } from "../camera/cameraRigs";

/** Resolved shell distance policy for generated facade batches. @internal */
export interface BuildingRenderPolicy {
  enabled: boolean;
  minDistance: number;
  maxDistance: number;
  hysteresis: number;
}

const UNLIMITED: BuildingRenderPolicy = { enabled: false, minDistance: 0, maxDistance: Infinity, hysteresis: 0 };
const BuildingRenderContext = createContext<BuildingRenderPolicy>(UNLIMITED);

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
  visibility?: VisibilityConfig;
  cullingDisabled?: boolean;
  children: ReactNode;
}) {
  const policy = useMemo(() => resolveBuildingRenderPolicy(drawDistance, visibility, cullingDisabled), [drawDistance, visibility, cullingDisabled]);
  return <BuildingRenderContext.Provider value={policy}>{children}</BuildingRenderContext.Provider>;
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

/** Distance-gate chunks only; Three retains independent main-camera and shadow-camera frustum tests. @internal */
export function useBuildingChunkBudget(meshRef: RefObject<THREE.InstancedMesh | null>, bounds: THREE.Box3): void {
  const policy = useContext(BuildingRenderContext);
  const scratch = useRef({ box: new THREE.Box3(), sphere: new THREE.Sphere(), camera: new THREE.Vector3() });
  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    mesh.updateWorldMatrix(true, false);
    camera.getWorldPosition(scratch.current.camera);
    mesh.visible = buildingChunkWithinBudget(bounds, mesh.matrixWorld, scratch.current.camera, policy, mesh.visible,
      scratch.current.box, scratch.current.sphere, mesh.boundingSphere);
  }, CAMERA_POST_FRAME_PRIORITY);
}
