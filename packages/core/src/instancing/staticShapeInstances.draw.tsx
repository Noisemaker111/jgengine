import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";

import type { ModelShadowMode } from "@jgengine/core/lod/modelLod";
import { AuthoredSurfaceMaterial, authoredSurfaceKey, useAuthoredSurfaceMaterial, type AuthoredSurfaceConfig, type SurfaceShape } from "@jgengine/core/material/authoredSurfaceMaterial.draw";
import { ModelFallbackBoundary } from "@jgengine/core/model/SceneModels.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { composeInstance, uploadInstances } from "./instanceUpload.draw";

/** One editor-derived static primitive. A box spans one unit; a cylinder has unit radius and height before scale. */
export interface StaticShapeInstance {
  shape: SurfaceShape;
  position: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  scale: readonly [number, number, number];
  surface: AuthoredSurfaceConfig;
  shadows?: ModelShadowMode;
  /** Cylinder tessellation; default 16. */
  radialSegments?: number;
}

/** A compatible static draw group. @internal */
export interface StaticShapeBatch {
  key: string;
  shape: SurfaceShape;
  radialSegments: number;
  surface: AuthoredSurfaceConfig;
  shadows: ModelShadowMode;
  instances: readonly StaticShapeInstance[];
}

/** Plan compatible material/shape/shadow groups without changing authored transforms. @internal */
export function groupStaticShapeInstances(instances: readonly StaticShapeInstance[]): StaticShapeBatch[] {
  const groups = new Map<string, StaticShapeBatch>();
  for (const instance of instances) {
    if (![...instance.position, ...instance.scale, ...(instance.rotation ?? [])].every(Number.isFinite) || instance.scale.some(value => value <= 0)) throw new Error("Static shape transforms must be finite with positive scale");
    if ([instance.surface.displacementScale, instance.surface.displacementBias].some(value => value !== undefined && !Number.isFinite(value))) throw new Error("Static shape displacement must be finite");
    const radialSegments = instance.shape === "cylinder" ? instance.radialSegments ?? 16 : 0;
    if (instance.shape === "cylinder" && (!Number.isInteger(radialSegments) || radialSegments < 3)) throw new Error("Cylinder radialSegments must be an integer >= 3");
    const shadows = instance.shadows ?? "both";
    const key = JSON.stringify([instance.shape, radialSegments, shadows, authoredSurfaceKey(instance.surface)]);
    let group = groups.get(key);
    if (group === undefined) {
      group = { key, shape: instance.shape, radialSegments, surface: instance.surface, shadows, instances: [] };
      groups.set(key, group);
    }
    (group.instances as StaticShapeInstance[]).push(instance);
  }
  return [...groups.values()];
}

/** Upload static transforms and refresh conservative aggregate bounds after a prop change. @internal */
export function writeStaticShapeInstances(mesh: THREE.InstancedMesh, instances: readonly StaticShapeInstance[]): void {
  const surface = instances[0]?.surface;
  let pad = 0;
  if (surface?.maps?.height !== undefined) {
    const bias = surface.displacementBias ?? 0;
    const scale = surface.displacementScale ?? 1;
    const displacement = Math.max(Math.abs(bias), Math.abs(bias + scale));
    pad = displacement + Number.EPSILON * Math.max(1, displacement) * 8;
  }
  uploadInstances(
    mesh,
    { count: instances.length, at: (index, out) => composeInstance(out, instances[index]!.position, instances[index]!.rotation, instances[index]!.scale) },
    { bounds: "boxes", boundsPad: pad },
  );
}

/** One instanced batch as an {@link EngineDraw}; the material is owned by the caller's hook. */
export function staticShapeBatchDraw(batch: StaticShapeBatch, material: THREE.Material): EngineDraw {
  const geometry = batch.shape === "box" ? new THREE.BoxGeometry(1, 1, 1) : new THREE.CylinderGeometry(1, 1, 1, batch.radialSegments);
  let mesh: THREE.InstancedMesh | null = null;
  return {
    mount(state: EngineFrameState) {
      mesh = new THREE.InstancedMesh(geometry, material, batch.instances.length);
      mesh.castShadow = batch.shadows === "both" || batch.shadows === "cast";
      mesh.receiveShadow = batch.shadows === "both" || batch.shadows === "receive";
      writeStaticShapeInstances(mesh, batch.instances);
      state.scene.add(mesh);
    },
    dispose(state: EngineFrameState) {
      if (mesh !== null) {
        state.scene.remove(mesh);
        mesh.dispose();
      }
      geometry.dispose();
      mesh = null;
    },
  };
}

function ShapeBatch({ batch }: { batch: StaticShapeBatch }) {
  const material = useAuthoredSurfaceMaterial(batch.surface, batch.shape);
  const latest = useRef({ batch, material });
  latest.current = { batch, material };
  useEngineDraw(() => staticShapeBatchDraw(latest.current.batch, latest.current.material), [batch, material]);
  return null;
}

/**
 * Batch editor-derived boxes/cylinders by shape, PBR metadata and shadows. Uploads and bounds run only when instances change; map loading stays isolated per draw group.
 * @capability static-shape-instances render authored primitive transforms as static material-compatible instance batches
 */
export function StaticShapeInstances({ instances }: { instances: readonly StaticShapeInstance[] }) {
  const batches = useMemo(() => groupStaticShapeInstances(instances), [instances]);
  return <>{batches.map(batch => (
    <ModelFallbackBoundary key={batch.key} fallback={<AuthoredSurfaceMaterial surface={{ ...batch.surface, maps: undefined }} shape={batch.shape} />} url={Object.values(batch.surface.maps ?? {}).join(",")} seam="object">
      <Suspense fallback={<AuthoredSurfaceMaterial surface={{ ...batch.surface, maps: undefined }} shape={batch.shape} />}><ShapeBatch batch={batch} /></Suspense>
    </ModelFallbackBoundary>
  ))}</>;
}
