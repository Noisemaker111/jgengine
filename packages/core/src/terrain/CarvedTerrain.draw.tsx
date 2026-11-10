import { useRef } from "react";
import * as THREE from "three";

import { nextFrame } from "@jgengine/core/run/nextFrame.draw";
import { runSliced, SlicedWorkCancelled, type SlicedJob, type SlicedRun } from "@jgengine/core/run/slicedWork";

import type { TerrainField } from "@jgengine/core/terrain/terrain";

import { trackSceneWork } from "@jgengine/core/model/modelLoad.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw, type DrawAttachProps } from "@jgengine/core/frame/useEngineDraw.draw";
import { CHUNKED_GROUND_MIN_VERTICES, GroundChunks } from "./terrainChunks.draw";
import { fieldGroundGeometryJob, resolveFieldGroundGrid, type FieldGroundOptions } from "./terrainMath.draw";

/** Props for `CarvedTerrain`: the terrain field to mesh, its size, resolution, colouring and material settings. */
export interface CarvedTerrainProps extends DrawAttachProps {
  /** The terrain field to mesh — a `CarvableField` renders its craters and mounds. */
  field: TerrainField;
  size?: FieldGroundOptions["size"];
  segments?: FieldGroundOptions["segments"] | undefined;
  center?: FieldGroundOptions["center"] | undefined;
  colors?: FieldGroundOptions["colors"];
  heightRange?: FieldGroundOptions["heightRange"];
  paletteAt?: FieldGroundOptions["paletteAt"] | undefined;
  paintColorAt?: FieldGroundOptions["paintColorAt"] | undefined;
  roughness?: number;
  metalness?: number;
  /** Override the default vertex-colour material (e.g. a procedural detail material). The caller owns its lifecycle; it is not disposed here. */
  surfaceMaterial?: THREE.Material | undefined;
  /** Bump after a runtime carve/deposit to re-mesh the deformed surface. */
  epoch?: number;
}

/** Seconds between checks for a tile level the camera now needs. */
const REFINE_INTERVAL = 0.25;

const eyeScratch = new THREE.Vector3();

function* wrapInitial(chunks: GroundChunks, eye: () => THREE.Vector3) {
  yield* chunks.initialJob(eye);
  return chunks;
}

let standIn: THREE.BufferGeometry | null = null;

/** The ground mesh's attribute layout (see `groundGeometryJob`) on one degenerate triangle; shared, never disposed. */
function terrainStandIn(): THREE.BufferGeometry {
  if (standIn !== null) return standIn;
  standIn = new THREE.BufferGeometry();
  standIn.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
  standIn.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(6), 2));
  standIn.setAttribute("color", new THREE.BufferAttribute(new Float32Array(9).fill(1), 3));
  standIn.setAttribute("normal", new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  standIn.setIndex(new THREE.BufferAttribute(new Uint32Array([0, 1, 2]), 1));
  standIn.computeBoundingSphere();
  return standIn;
}

function applyVec3(target: THREE.Vector3 | THREE.Euler, value: unknown): void {
  if (Array.isArray(value)) target.set(value[0] as number, value[1] as number, value[2] as number);
  else if (value instanceof THREE.Vector3 || value instanceof THREE.Euler) target.copy(value as never);
}

interface SurfaceFlags {
  castShadow: boolean | undefined;
  frustumCulled: boolean | undefined;
}

function applyMeshProps(object: THREE.Object3D, props: CarvedTerrainProps, flags: SurfaceFlags): void {
  const position = props.position;
  if (position !== undefined) applyVec3(object.position, position);
  const rotation = props.rotation;
  if (rotation !== undefined) applyVec3(object.rotation, rotation);
  const scale = props.scale;
  if (scale !== undefined) applyVec3(object.scale, scale);
  if (props.visible !== undefined) object.visible = props.visible;
  // Traversing a chunked ground's tiles every frame is wasteful; only re-apply on change.
  if (props.castShadow !== flags.castShadow || props.frustumCulled !== flags.frustumCulled) {
    flags.castShadow = props.castShadow;
    flags.frustumCulled = props.frustumCulled;
    object.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (props.castShadow !== undefined) mesh.castShadow = props.castShadow;
      if (props.frustumCulled !== undefined) mesh.frustumCulled = props.frustumCulled;
    });
  }
}

/** Run a sliced job the way `useSlicedValue` did: scene work counted, result on done. */
function startSliced<T>(label: string, job: SlicedJob<T>, onResult: (value: T) => void): SlicedRun<T> {
  const done = trackSceneWork(label);
  const run = runSliced(job);
  run.done.then(
    (result) => {
      onResult(result);
      done();
    },
    (error: unknown) => {
      done();
      if (!(error instanceof SlicedWorkCancelled)) console.error(`[jgengine] ${label} failed to build`, error);
    },
  );
  return run;
}

/** {@link carvedTerrainDraw} plus its prop/material sync, shared by `frame` and `update`. @internal */
export interface CarvedTerrainDraw extends EngineDraw {
  syncSurface(): void;
}

/**
 * Renders a `TerrainField` as a deformed ground mesh — the crater/mound view for destructible terrain.
 * Because the geometry samples `field.sampleHeight`, a `CarvableField.carve(...)` shows as a real bowl
 * once `epoch` changes. Pair with `InstancedBodies` to see debris resting in the crater it blasted.
 */
export function carvedTerrainDraw(getProps: () => CarvedTerrainProps): CarvedTerrainDraw {
  let holder: THREE.Group | null = null;
  let mesh: THREE.Mesh | null = null;
  let standInMesh: THREE.Mesh | null = null;
  let chunks: GroundChunks | null = null;
  let run: SlicedRun<unknown> | null = null;
  let refining: SlicedRun<void> | null = null;
  let ready = false;
  let sinceCheck = 0;
  let disposed = false;
  let defaultMaterial: THREE.MeshStandardMaterial | null = null;
  let defaultKey = "";
  const holderFlags: SurfaceFlags = { castShadow: undefined, frustumCulled: undefined };
  const meshFlags: SurfaceFlags = { castShadow: undefined, frustumCulled: undefined };

  function currentMaterial(props: CarvedTerrainProps): THREE.Material {
    if (props.surfaceMaterial !== undefined) return props.surfaceMaterial;
    const roughness = props.roughness ?? 0.95;
    const metalness = props.metalness ?? 0;
    const key = `${roughness}|${metalness}`;
    if (defaultMaterial === null || defaultKey !== key) {
      defaultMaterial?.dispose();
      defaultMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness, metalness, vertexColors: true });
      defaultKey = key;
    }
    return defaultMaterial;
  }

  function mountChunked(state: EngineFrameState, props: CarvedTerrainProps, grid: ReturnType<typeof resolveFieldGroundGrid>, material: THREE.Material): void {
    chunks = new GroundChunks(grid, material, props.receiveShadow ?? true);
    holder = new THREE.Group();
    holder.add(chunks.root);
    applyMeshProps(holder, props, holderFlags);
    state.scene.add(holder);
    // Holds the ground's program in the warmup while the first tiles build (see WholeGround).
    standInMesh = new THREE.Mesh(terrainStandIn(), material);
    standInMesh.receiveShadow = props.receiveShadow ?? true;
    state.scene.add(standInMesh);
    const camera = state.camera;
    run = startSliced("terrain", wrapInitial(chunks, () => camera.getWorldPosition(new THREE.Vector3())), () => {
      ready = true;
      state.invalidate();
    }) as SlicedRun<unknown>;
  }

  function mountWhole(state: EngineFrameState, props: CarvedTerrainProps, material: THREE.Material): void {
    const { field, size, segments, center, colors, heightRange, paletteAt, paintColorAt } = props;
    const options: FieldGroundOptions = { size, segments, center, colors, heightRange, paletteAt, paintColorAt };
    mesh = new THREE.Mesh(terrainStandIn(), material);
    mesh.receiveShadow = props.receiveShadow ?? true;
    applyMeshProps(mesh, props, meshFlags);
    state.scene.add(mesh);
    run = startSliced("terrain", fieldGroundGeometryJob(field, options), (geometry) => {
      if (disposed || mesh === null) {
        geometry.dispose();
        return;
      }
      const previous = mesh.geometry;
      mesh.geometry = geometry;
      if (previous !== terrainStandIn()) previous.dispose();
      state.invalidate();
    }) as SlicedRun<unknown>;
  }

  return {
    mount(state: EngineFrameState) {
      disposed = false;
      const props = getProps();
      const grid = resolveFieldGroundGrid(props.field, {
        size: props.size,
        segments: props.segments,
        center: props.center,
        colors: props.colors,
        heightRange: props.heightRange,
        paletteAt: props.paletteAt,
        paintColorAt: props.paintColorAt,
      });
      const chunked = (grid.segments.x + 1) * (grid.segments.z + 1) > CHUNKED_GROUND_MIN_VERTICES;
      const material = currentMaterial(props);
      if (chunked) mountChunked(state, props, grid, material);
      else mountWhole(state, props, material);
    },
    syncSurface() {
      const props = getProps();
      const material = currentMaterial(props);
      const receiveShadow = props.receiveShadow ?? true;
      if (chunks !== null && holder !== null) {
        chunks.syncSurface(material, receiveShadow);
        applyMeshProps(holder, props, holderFlags);
        return;
      }
      if (mesh !== null) {
        mesh.material = material;
        mesh.receiveShadow = receiveShadow;
        applyMeshProps(mesh, props, meshFlags);
      }
    },
    frame(state: EngineFrameState) {
      this.syncSurface();
      if (chunks === null || holder === null || !ready || refining !== null) return;
      sinceCheck += state.delta;
      if (sinceCheck < REFINE_INTERVAL) return;
      sinceCheck = 0;
      const job = chunks.nextRefinement(state.camera.getWorldPosition(eyeScratch));
      if (job === null) return;
      const next = runSliced(job, { budgetMs: 1, yieldThread: nextFrame });
      refining = next;
      next.done.then(
        () => { if (refining === next) refining = null; },
        () => { if (refining === next) refining = null; },
      );
    },
    update() {
      this.syncSurface();
    },
    dispose(state: EngineFrameState) {
      disposed = true;
      run?.cancel();
      run = null;
      refining?.cancel();
      refining = null;
      chunks?.dispose();
      chunks = null;
      if (holder !== null) {
        state.scene.remove(holder);
        holder = null;
      }
      if (standInMesh !== null) {
        state.scene.remove(standInMesh);
        standInMesh = null;
      }
      if (mesh !== null) {
        const geometry = mesh.geometry;
        state.scene.remove(mesh);
        if (geometry !== terrainStandIn()) geometry.dispose();
        mesh = null;
      }
      defaultMaterial?.dispose();
      defaultMaterial = null;
      defaultKey = "";
      ready = false;
      sinceCheck = 0;
    },
  };
}

/**
 * Renders a `TerrainField` as a deformed ground mesh — the crater/mound view for destructible terrain.
 * Because the geometry samples `field.sampleHeight`, a `CarvableField.carve(...)` shows as a real bowl
 * once `epoch` changes. Pair with `InstancedBodies` to see debris resting in the crater it blasted.
 */
export function CarvedTerrain(props: CarvedTerrainProps) {
  const latest = useRef<CarvedTerrainProps>(props);
  latest.current = props;
  useEngineDraw(() => carvedTerrainDraw(() => latest.current), [
    props.field,
    props.size,
    props.segments,
    props.center,
    props.colors,
    props.heightRange,
    props.paletteAt,
    props.paintColorAt,
    props.epoch,
  ]);
  return null;
}
