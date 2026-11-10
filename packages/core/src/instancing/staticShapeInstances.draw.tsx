/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import type { ModelShadowMode } from "@jgengine/core/lod/modelLod";
import { authoredSurfaceKey, authoredSurfaceMaterial, type AuthoredSurfaceConfig, type AuthoredSurfaceMaterialLease, type SurfaceShape } from "@jgengine/core/material/authoredSurfaceMaterial.draw";
import { childFrameState, type EngineDraw, type EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
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

/** One instanced batch as an {@link EngineDraw}; `sync` retunes matrices in place when only instances change. @internal */
export interface StaticShapeBatchDraw extends EngineDraw {
  sync(batch: StaticShapeBatch): void;
}

/**
 * One instanced batch as an {@link EngineDraw}. The flat (map-less) material lands first — the old
 * Suspense fallback — then the declared maps swap in; a failed map load keeps the flat material,
 * matching the old ModelFallbackBoundary.
 */
export function staticShapeBatchDraw(batch: StaticShapeBatch): StaticShapeBatchDraw {
  const geometry = batch.shape === "box" ? new THREE.BoxGeometry(1, 1, 1) : new THREE.CylinderGeometry(1, 1, 1, batch.radialSegments);
  const group = new THREE.Group();
  let mesh: THREE.InstancedMesh | null = null;
  let placeholder: THREE.MeshStandardMaterial | null = null;
  let lease: AuthoredSurfaceMaterialLease | null = null;
  let cancelled = false;
  let current = batch;
  const apply = (next: AuthoredSurfaceMaterialLease) => {
    if (cancelled || mesh === null) {
      next.dispose();
      return;
    }
    lease?.dispose();
    lease = next;
    const previous = mesh.material;
    mesh.material = next.material;
    if (previous === placeholder) placeholder?.dispose();
  };
  const flat = { ...batch.surface, maps: undefined };
  const hasMaps = Object.keys(batch.surface.maps ?? {}).length > 0;
  return {
    mount(state: EngineFrameState) {
      placeholder = new THREE.MeshStandardMaterial();
      mesh = new THREE.InstancedMesh(geometry, placeholder, current.instances.length);
      mesh.castShadow = batch.shadows === "both" || batch.shadows === "cast";
      mesh.receiveShadow = batch.shadows === "both" || batch.shadows === "receive";
      writeStaticShapeInstances(mesh, current.instances);
      group.add(mesh);
      state.scene.add(group);
      void authoredSurfaceMaterial(flat, batch.shape).then(apply).catch(() => {})
        .then(() => hasMaps ? authoredSurfaceMaterial(batch.surface, batch.shape).then(apply).catch(() => {}) : undefined);
    },
    sync(next: StaticShapeBatch) {
      current = next;
      if (mesh !== null) writeStaticShapeInstances(mesh, next.instances);
    },
    dispose(state: EngineFrameState) {
      cancelled = true;
      state.scene.remove(group);
      group.clear();
      lease?.dispose();
      lease = null;
      if (mesh !== null) {
        if (mesh.material === placeholder) placeholder?.dispose();
        mesh.dispose();
        mesh = null;
      }
      placeholder = null;
      geometry.dispose();
    },
  };
}

/**
 * The whole instance set as one draw. Batches keyed by shape/surface/shadow keep their mesh and
 * retune matrices in place; only genuinely new or removed groups mount and dispose.
 * @internal
 */
export function staticShapeInstancesDraw(getInstances: () => readonly StaticShapeInstance[]): EngineDraw {
  const group = new THREE.Group();
  const entries = new Map<string, { draw: StaticShapeBatchDraw; state: EngineFrameState }>();
  let instances: readonly StaticShapeInstance[] | null = null;
  const rebuild = (state: EngineFrameState) => {
    const batches = groupStaticShapeInstances(getInstances());
    const seen = new Set<string>();
    for (const batch of batches) {
      seen.add(batch.key);
      const entry = entries.get(batch.key);
      if (entry === undefined) {
        const draw = staticShapeBatchDraw(batch);
        const childState = childFrameState(state, group);
        draw.mount?.(childState);
        entries.set(batch.key, { draw, state: childState });
      } else {
        entry.draw.sync(batch);
      }
    }
    for (const [key, entry] of entries) {
      if (seen.has(key)) continue;
      entry.draw.dispose?.(entry.state);
      entries.delete(key);
    }
  };
  const sync = (state: EngineFrameState) => {
    const next = getInstances();
    if (next === instances) return;
    instances = next;
    rebuild(state);
  };
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      instances = getInstances();
      rebuild(state);
    },
    frame: sync,
    update: sync,
    dispose(state: EngineFrameState) {
      for (const entry of entries.values()) entry.draw.dispose?.(entry.state);
      entries.clear();
      state.scene.remove(group);
      group.clear();
    },
  };
}

/**
 * Batch editor-derived boxes/cylinders by shape, PBR metadata and shadows. Uploads and bounds run only when instances change; map loading stays isolated per draw group.
 * @capability static-shape-instances render authored primitive transforms as static material-compatible instance batches
 */
export function StaticShapeInstances({ instances }: { instances: readonly StaticShapeInstance[] }) {
  const latest = useRef<readonly StaticShapeInstance[]>(instances);
  latest.current = instances;
  return <EngineDrawMount create={() => staticShapeInstancesDraw(() => latest.current)} deps={[]} />;
}
