/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

import { CAMERA_POST_FRAME_PRIORITY } from "@jgengine/core/camera/cameraRigs.draw";
import { staticDrawPoolFor, type PooledPlacement, type StaticDrawSlot } from "@jgengine/core/instancing/staticDrawPool.draw";
import { staticPoolCellAt } from "@jgengine/core/instancing/staticObjectBatches.draw";
import { culledByDistance } from "@jgengine/core/visibility/distance";

import type { MaterialAsset } from "@jgengine/core/material/materialAsset";
import { modelMaterialTextures } from "@jgengine/core/material/materialAsset.draw";
import { preloadSceneModel } from "@jgengine/core/model/entityModelDraw.draw";
import {
  buildScatterModelSources,
  disposeScatterModelSources,
  type ScatterModelSource,
} from "@jgengine/core/scatter/scatterModels.draw";
import {
  measureBuildingKitModel,
  type BuildingKitInstance,
} from "./buildingKitFit.draw";
import { buildingSurfaceTextures } from "./buildingSurface.draw";
import { groupBuildingKitInstances, buildBuildingKitSources, validateBuildingKitSource, type BuildingKitStyleGroup } from "./buildingKitMaterials.draw";
import { buildingChunkBudgetScratch, buildingRenderPolicy, syncBuildingChunkBudget, type BuildingChunkBudgetScratch } from "./BuildingRenderBudget.draw";
import { partitionInstances, type InstanceChunk } from "@jgengine/core/instancing/instanceChunks.draw";
import { uploadInstances } from "@jgengine/core/instancing/instanceUpload.draw";
import { freezeStaticTransforms } from "@jgengine/core/model/staticTransforms.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";

/** Props for {@link BuildingKitBatch}: one resolved model URL and every kit instance bound to it. @internal */
export interface BuildingKitBatchProps {
  url: string;
  instances: readonly BuildingKitInstance[];
  materialAssets?: readonly MaterialAsset[] | undefined;
}

/** One kit part instance as a shared-batch placement, with its world matrix. @internal */
export interface KitPlacement extends PooledPlacement {
  readonly index: number;
  readonly matrix: THREE.Matrix4;
}

/**
 * A chunk's instances in world space, for the shared static batches: `anchor` is the world matrix of
 * the group the chunk's matrices are relative to. `cell` is the batch cell its bounds centre falls in;
 * `sphere` is its world bounds, for the distance budget. @internal
 */
export function kitChunkPlacements(anchor: THREE.Matrix4, chunk: InstanceChunk): { members: KitPlacement[]; cell: string; sphere: THREE.Sphere } {
  const members = chunk.matrices.map((matrix, index) => ({ instanceId: "", index, matrix: new THREE.Matrix4().multiplyMatrices(anchor, matrix) }));
  const sphere = chunk.bounds.clone().applyMatrix4(anchor).getBoundingSphere(new THREE.Sphere());
  const cell = staticPoolCellAt(sphere.center.x, sphere.center.z);
  return { members, cell, sphere };
}

const NO_PLACEMENTS: readonly KitPlacement[] = [];
const kitSlotOf = (member: KitPlacement): number => member.index;
const kitMatrixOf = (member: KitPlacement, out: THREE.Matrix4): THREE.Matrix4 => out.copy(member.matrix);

/** Shows a pooled chunk while the building distance budget keeps it, and hides it past that. */
function pooledKitChunkDraw(slot: StaticDrawSlot, members: readonly KitPlacement[], sphere: THREE.Sphere): EngineDraw {
  const state = { eye: new THREE.Vector3(), shown: null as boolean | null };
  return {
    frame(frameState: EngineFrameState) {
      frameState.camera.getWorldPosition(state.eye);
      const policy = buildingRenderPolicy();
      const { center, radius } = sphere;
      const shown = !policy.enabled || !culledByDistance(state.eye.x, state.eye.y, state.eye.z, center.x, center.y, center.z,
        policy.minDistance, policy.maxDistance, radius, state.shown === true ? policy.hysteresis : 0);
      if (shown === state.shown) return;
      state.shown = shown;
      slot.sync(shown ? members : NO_PLACEMENTS, kitSlotOf, kitMatrixOf);
    },
  };
}

/**
 * One chunk of one kit source: joins the shared static batch for its material and cell when the pool
 * accepts it (several materials on one mesh or a see-through material keeps its own instanced draw),
 * then follows the building distance budget either way.
 */
function kitSourceChunkDraw(source: ScatterModelSource, material: THREE.Material | THREE.Material[], chunk: InstanceChunk): EngineDraw {
  let pooled: EngineDraw | null = null;
  let instanced: EngineDraw | null = null;
  let mesh: THREE.InstancedMesh | null = null;
  let scratch: BuildingChunkBudgetScratch | null = null;
  let disposed = false;
  return {
    mount(state: EngineFrameState) {
      // Same measuring frame the anchor groups had: the scoped parent's world matrix.
      state.scene.updateWorldMatrix(true, false);
      const { members, cell, sphere } = kitChunkPlacements(state.scene.matrixWorld, chunk);
      const pool = staticDrawPoolFor(state.rootScene ?? state.scene);
      const slot = pool.acquire({ geometry: source.geometry, material, castShadow: true, receiveShadow: true }, cell, members.length);
      if (slot !== null) {
        slot.place(members, kitSlotOf, kitMatrixOf);
        pooled = pooledKitChunkDraw(slot, members, sphere);
        pooled.mount?.(state);
        return;
      }
      mesh = new THREE.InstancedMesh(source.geometry, material as THREE.Material, chunk.matrices.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      uploadInstances(mesh, chunk.matrices, { bounds: chunk.bounds });
      freezeStaticTransforms(mesh);
      state.scene.add(mesh);
      scratch = buildingChunkBudgetScratch();
      instanced = {
        frame(frameState: EngineFrameState) {
          if (mesh !== null) syncBuildingChunkBudget(mesh, chunk.bounds, frameState.camera, scratch!, buildingRenderPolicy());
        },
      };
      instanced.mount?.(state);
    },
    frame(state: EngineFrameState) {
      if (disposed) return;
      (pooled ?? instanced)?.frame?.(state, state.delta);
    },
    dispose(state: EngineFrameState) {
      disposed = true;
      pooled?.dispose?.(state);
      pooled = null;
      instanced?.dispose?.(state);
      instanced = null;
      if (mesh !== null) {
        state.scene.remove(mesh);
        // Release only this chunk's instance buffers; geometry and materials are shared.
        mesh.dispose();
        mesh = null;
      }
      scratch = null;
    },
  };
}

/** One source's chunk draws under the batch's scoped parent; frames forward in mount order. */
function kitSourceInstancesDraw(source: ScatterModelSource, material: THREE.Material | THREE.Material[], matrices: readonly THREE.Matrix4[]): EngineDraw {
  const chunks = partitionInstances(source.geometry, matrices, { localMatrix: source.localMatrix });
  const children = chunks.map((chunk) => kitSourceChunkDraw(source, material, chunk));
  return {
    priority: CAMERA_POST_FRAME_PRIORITY,
    mount(state: EngineFrameState) {
      for (const child of children) child.mount?.(state);
    },
    frame(state: EngineFrameState) {
      for (const child of children) child.frame?.(state, state.delta);
    },
    dispose(state: EngineFrameState) {
      for (const child of children) child.dispose?.(state);
    },
  };
}

/**
 * A styled kit group's draw: loads its surface and material-asset map views, builds the styled
 * sources once they land, and mounts one {@link kitSourceInstancesDraw} per source. A rebuild or
 * dispose drops the pending load's leases; sources dispose with the group.
 */
function styledKitSourcesDraw(scene: THREE.Object3D, materialAssets: readonly MaterialAsset[] | undefined, group: BuildingKitStyleGroup, renderer: THREE.WebGLRenderer | null): EngineDraw {
  const inner: EngineDraw[] = [];
  const roots: THREE.Object3D[] = [];
  const leases: { dispose(): void }[] = [];
  let state: EngineFrameState | null = null;
  let disposed = false;
  let generation = 0;
  const clearInner = () => {
    if (state !== null) for (const draw of inner.splice(0)) draw.dispose?.(state);
    for (const root of roots.splice(0)) disposeScatterModelSources(root);
    for (const lease of leases.splice(0)) lease.dispose();
  };
  return {
    priority: CAMERA_POST_FRAME_PRIORITY,
    mount(mountState: EngineFrameState) {
      state = mountState;
      const attempt = ++generation;
      try {
        validateBuildingKitSource(scene, group.part, materialAssets);
      } catch (error) {
        console.error(`[jgengine] building kit style ${group.key} failed to validate`, error);
        return;
      }
      void Promise.all([
        buildingSurfaceTextures(group.part.material),
        modelMaterialTextures({ materialAssets, materialAssignments: group.part.materialAssignments }, renderer),
      ]).then(([surfaceLease, materialLease]) => {
        if (disposed || attempt !== generation) {
          surfaceLease.dispose();
          materialLease.dispose();
          return;
        }
        const current = state;
        if (current === null) {
          surfaceLease.dispose();
          materialLease.dispose();
          return;
        }
        leases.push(surfaceLease, materialLease);
        const { sources, root } = buildBuildingKitSources(scene, group.part, materialAssets, surfaceLease.textures, materialLease.assets);
        roots.push(root);
        for (const source of sources) {
          const draw = kitSourceInstancesDraw(source, source.material, group.matrices);
          inner.push(draw);
          draw.mount?.(current);
        }
      }).catch((error: unknown) => {
        console.error(`[jgengine] building kit style ${group.key} failed to load`, error);
      });
    },
    frame(frameState: EngineFrameState) {
      for (const draw of inner) draw.frame?.(frameState, frameState.delta);
    },
    dispose() {
      disposed = true;
      generation += 1;
      clearInner();
      state = null;
    },
  };
}

/**
 * The draw-side form of {@link BuildingKitBatch}: loads the GLB once through the shared per-url
 * cache, harvests instanceable sources, and mounts chunk draws per style group. Prop identity
 * changes rebuild groups and styled sources without reloading the model; a URL change reloads.
 */
export function buildingKitBatchDraw(getProps: () => BuildingKitBatchProps): EngineDraw {
  const groupDraws: EngineDraw[] = [];
  let state: EngineFrameState | null = null;
  let disposed = false;
  let generation = 0;
  let gltf: GLTF | null = null;
  let sources: ScatterModelSource[] = [];
  let root: THREE.Object3D | null = null;
  let bounds: ReturnType<typeof measureBuildingKitModel> | null = null;
  let built: { url: string; instances: readonly BuildingKitInstance[]; materialAssets: readonly MaterialAsset[] | undefined } | null = null;
  const mountGroups = (mountState: EngineFrameState, groups: readonly BuildingKitStyleGroup[], sourceList: readonly ScatterModelSource[], materialAssets: readonly MaterialAsset[] | undefined) => {
    for (const styleGroup of groups) {
      const plain = (styleGroup.part.tint ?? "") === "" && styleGroup.part.material === undefined && !styleGroup.part.materialAssignments?.length;
      if (plain) {
        for (const source of sourceList) {
          const draw = kitSourceInstancesDraw(source, source.material, styleGroup.matrices);
          groupDraws.push(draw);
          draw.mount?.(mountState);
        }
      } else {
        const draw = styledKitSourcesDraw(mountState.scene, materialAssets, styleGroup, mountState.gl ?? null);
        groupDraws.push(draw);
        draw.mount?.(mountState);
      }
    }
  };

  const validateInstances = (scene: THREE.Object3D, instances: readonly BuildingKitInstance[], materialAssets: readonly MaterialAsset[] | undefined) => {
    const checked = new Set<BuildingKitInstance["part"]>();
    for (const instance of instances) {
      if (!checked.has(instance.part)) {
        validateBuildingKitSource(scene, instance.part, materialAssets);
        checked.add(instance.part);
      }
    }
  };

  const clearBase = () => {
    if (root !== null) {
      disposeScatterModelSources(root);
      root = null;
    }
    sources = [];
    bounds = null;
    gltf = null;
  };

  const loadUrl = (url: string) => {
    const attempt = ++generation;
    void preloadSceneModel(url).then((loaded) => {
      if (disposed || attempt !== generation) return;
      try {
        const props = getProps();
        validateInstances(loaded.scene, props.instances, props.materialAssets);
        const builtSources = buildScatterModelSources(loaded.scene, { url });
        const measured = measureBuildingKitModel(builtSources.root);
        if (state === null) {
          disposeScatterModelSources(builtSources.root);
          return;
        }
        gltf = loaded;
        sources = builtSources.sources;
        root = builtSources.root;
        bounds = measured;
        mountGroups(state, groupBuildingKitInstances(props.instances, measured, props.materialAssets), sources, props.materialAssets);
        built = { url, instances: props.instances, materialAssets: props.materialAssets };
      } catch (error) {
        console.error(`[jgengine] building kit model ${url} failed to build`, error);
      }
    }).catch((error: unknown) => {
      console.error(`[jgengine] building kit model ${url} failed to load`, error);
    });
  };

  const rebuildGroups = (mountState: EngineFrameState) => {
    if (gltf === null || root === null || bounds === null) return;
    for (const draw of groupDraws.splice(0)) draw.dispose?.(mountState);
    const props = getProps();
    try {
      validateInstances(gltf.scene, props.instances, props.materialAssets);
    } catch (error) {
      console.error("[jgengine] building kit instances failed to validate", error);
      return;
    }
    mountGroups(mountState, groupBuildingKitInstances(props.instances, bounds, props.materialAssets), sources, props.materialAssets);
    built = { url: built?.url ?? "", instances: props.instances, materialAssets: props.materialAssets };
  };

  return {
    priority: CAMERA_POST_FRAME_PRIORITY,
    mount(mountState: EngineFrameState) {
      state = mountState;
      disposed = false;
      const props = getProps();
      built = { url: props.url, instances: props.instances, materialAssets: props.materialAssets };
      loadUrl(props.url);
    },
    update(mountState: EngineFrameState) {
      const props = getProps();
      if (built === null) return;
      if (props.url !== built.url) {
        generation += 1;
        for (const draw of groupDraws.splice(0)) draw.dispose?.(mountState);
        clearBase();
        built = { url: props.url, instances: props.instances, materialAssets: props.materialAssets };
        loadUrl(props.url);
        return;
      }
      if (props.instances !== built.instances || props.materialAssets !== built.materialAssets) {
        rebuildGroups(mountState);
      }
    },
    frame(frameState: EngineFrameState) {
      for (const draw of groupDraws) draw.frame?.(frameState, frameState.delta);
    },
    dispose(disposeState: EngineFrameState) {
      disposed = true;
      generation += 1;
      for (const draw of groupDraws.splice(0)) draw.dispose?.(disposeState);
      clearBase();
      state = null;
    },
  };
}

/**
 * GPU-instances one kit model across every building part bound to it: the GLB loads once through the
 * shared cache, its meshes are harvested into instanceable draw sources, and each part's slot box
 * drives the fit scale. Content appears as loads land â€” no Suspense boundary required.
 * @internal
 */
export function BuildingKitBatch({ url, instances, materialAssets }: BuildingKitBatchProps) {
  const latest = useRef<BuildingKitBatchProps>({ url, instances, materialAssets });
  latest.current = { url, instances, materialAssets };
  return <EngineDrawMount create={() => buildingKitBatchDraw(() => latest.current)} deps={[url]} />;
}
