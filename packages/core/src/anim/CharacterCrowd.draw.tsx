/** @jsxImportSource @jgengine/core/ui/jsx */
// @skill jgengine-world
import { useEffect, useMemo, useRef, type MutableRefObject } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import { devtools } from "@jgengine/core/devtools/devtools";
import { warnOnce } from "@jgengine/core/devtools/warnOnce";
import { reportFallbackSeam } from "@jgengine/core/devtools/fallbackSeams";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import type { GameContext } from "@jgengine/core/runtime/gameContextTypes";

import {
  characterLodPolicy,
  characterLodProbe,
  clearCrowdKind,
  noteCharacterFrame,
  noteCrowdInstances,
} from "@jgengine/core/lod/characterLod";
import {
  CharacterCrowdRegistry,
  crowdClipsOf,
  crowdSpeedBandsOf,
  crowdTintOf,
  setCrowdKindReady,
  stableCrowdKinds,
  type CrowdMember,
  type CrowdSpeedBands,
} from "./crowdRegistry.draw";
import { applyMaterialOverrideToMaterial, overrideTargets } from "@jgengine/core/material/materialOverride.draw";
import { useRenderVisibility } from "@jgengine/core/visibility/CullingProvider.draw";
import { useOptionalGameContext } from "@jgengine/react/provider";
import { POINTER_ENTITY_INSTANCES_KEY } from "@jgengine/core/input/pointerService.draw";
import { writeCrowdBatch, type CrowdPlayback } from "./crowdBatch.draw";
import { preloadSceneModel } from "@jgengine/core/model/entityModelDraw.draw";
import { modelPlacementTransform } from "@jgengine/core/model/modelRender.draw";
import {
  bakeSkinnedCrowd,
  createCrowdUniforms,
  patchCrowdMaterial,
} from "./SkinnedInstances.draw";
import { memoView } from "../ui/memoView.view";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";
import { joinFrameTask } from "@jgengine/core/frame/frameBoard.draw";
import { type EngineDraw, type EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

import type { VisiblePredicate } from "@jgengine/core/visibility/CullingProvider.draw";

interface CrowdBatchEnv {
  registry: CharacterCrowdRegistry;
  fps: number;
  onPick: ((id: string) => void) | undefined;
  ctx: GameContext | null;
  visible: MutableRefObject<VisiblePredicate>;
}

/**
 * One character kind's crowd batch as a draw: loads the model, bakes the crowd rig, builds the
 * instanced draws and materials, registers the kind's readiness and capacity, then writes every
 * visible member's clip sample into the instance buffers each frame — the draw-side `CrowdBatch`.
 */
function crowdBatchDraw(kind: string, model: ModelConfig, getEnv: () => CrowdBatchEnv): EngineDraw {
  let cancelled = false;
  let stateRef: EngineFrameState | null = null;
  let leaveWrite: (() => void) | null = null;
  let leavePick: (() => void) | null = null;

  // Everything the bake produces, owned by this draw once built.
  let baked: ReturnType<typeof bakeSkinnedCrowd> | null = null;
  let uniforms: ReturnType<typeof createCrowdUniforms> | null = null;
  let materials: THREE.Material[] = [];
  let depthMaterial: THREE.Material | null = null;
  let skipped: THREE.Material | null = null;
  let meshes: { main: THREE.InstancedMesh; mirrors: THREE.InstancedMesh[] } | null = null;
  let placement: { scale: number; offset: THREE.Vector3 } | null = null;
  let clips: ReturnType<typeof crowdClipsOf> = [];
  let bands: CrowdSpeedBands | undefined;
  let clipIndex: ReadonlyMap<string, number> | null = null;
  const playback = new Map<string, CrowdPlayback>();
  const drawnIds: string[] = [];
  const drawnMembers: { id: string; member: CrowdMember }[] = [];
  const pickRay = new THREE.Raycaster();
  const pickNdc = new THREE.Vector2();

  const cleanup = (state: EngineFrameState) => {
    leaveWrite?.();
    leaveWrite = null;
    leavePick?.();
    leavePick = null;
    for (const mesh of [meshes?.main, ...(meshes?.mirrors ?? [])]) {
      if (mesh === null || mesh === undefined) continue;
      state.scene.remove(mesh);
      mesh.dispose();
    }
    meshes = null;
    for (const material of materials) material.dispose();
    materials = [];
    depthMaterial?.dispose();
    depthMaterial = null;
    skipped?.dispose();
    skipped = null;
    baked?.dispose();
    baked = null;
    uniforms = null;
    clipIndex = null;
    playback.clear();
  };

  const build = async (state: EngineFrameState) => {
    const env = getEnv();
    const gltf = await preloadSceneModel(model.url);
    if (cancelled || stateRef === null) return;
    const clipNames = gltf.animations.map((clip) => clip.name);
    clips = crowdClipsOf(model, clipNames);
    bands = crowdSpeedBandsOf(model, clipNames);
    const capacity = characterLodPolicy(model.lod === false ? undefined : model.lod).crowdCapacity;
    // A model that plays clips but resolves none of them to locomotion keeps its own rig: batching it
    // would draw a frozen stance. A model with no clips at all is a static character, which batches.
    if (!(clipNames.length > 0 && clips.length === 0)) {
      try {
        baked = bakeSkinnedCrowd({ scene: gltf.scene, animations: gltf.animations }, { clips, fps: env.fps });
      } catch {
        // A model can carry clips without a skin (a node-transform prop animation). It keeps its own
        // rig rather than entering the crowd path, which is what the readiness flag then reports.
        warnOnce(`character-crowd:${model.url}`, `[jgengine] character crowd: "${model.url}" cannot be baked and stays on its own rig`);
        baked = null;
      }
    }
    if (baked === null) {
      setCrowdKindReady(kind, false);
      env.registry.setCapacity(kind, 0);
      return;
    }
    clipIndex = baked.clipIndex;
    const rig = baked;
    uniforms = rig.animated ? createCrowdUniforms(rig) : null;
    // A tinted kind (traffic resprayed per kind) shares one batch across its colours: the materials the
    // override names draw white, and each member's colour multiplies them per instance.
    const override = model.material;
    const painted = override === undefined || crowdTintOf(model) === undefined
      ? []
      : rig.materials.map((material) => overrideTargets(material, override));
    materials = rig.materials.map((material, index) => {
      const target = override === undefined ? material.clone() : applyMaterialOverrideToMaterial(material.clone(), override, false, undefined);
      if (painted[index] === true && "color" in target && target.color instanceof THREE.Color) target.color.set(0xffffff);
      return uniforms === null ? target : patchCrowdMaterial(target, uniforms);
    });
    depthMaterial = uniforms === null ? null : patchCrowdMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), uniforms);
    skipped = new THREE.MeshBasicMaterial({ visible: false });
    const build = (list: THREE.Material[]) => {
      const instanced = new THREE.InstancedMesh(rig.geometry, list.length === 1 ? list[0]! : list, capacity);
      if (depthMaterial !== null) instanced.customDepthMaterial = depthMaterial;
      instanced.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0);
      instanced.count = 0;
      instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return instanced;
    };
    if (uniforms !== null) rig.geometry.setAttribute("crowdPlay", new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
    const made = !painted.includes(true)
      ? { main: build(materials), mirrors: [] as THREE.InstancedMesh[] }
      : (() => {
          // The paint draws carry the per-instance colour; the rest (glass, tyres, trim) share the
          // same instance matrices without it, each material drawn by exactly one of the two.
          const main = build(materials.map((material, index) => painted[index] === true ? material : skipped!));
          main.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
          main.instanceColor.setUsage(THREE.DynamicDrawUsage);
          if (!painted.includes(false)) return { main, mirrors: [] as THREE.InstancedMesh[] };
          const rest = build(materials.map((material, index) => painted[index] === true ? skipped! : material));
          rest.instanceMatrix = main.instanceMatrix;
          rest.boundingSphere = main.boundingSphere;
          return { main, mirrors: [rest] };
        })();
    meshes = made;
    /** The height and centering the full entity path gives this model, so a crowd copy stands in the same place. */
    const next = modelPlacementTransform(new THREE.Group(), model, {
      min: rig.bounds.min.toArray() as [number, number, number],
      max: rig.bounds.max.toArray() as [number, number, number],
      meshCount: 1,
    });
    placement = { scale: next.scale, offset: new THREE.Vector3(next.position[0], next.position[1], next.position[2]) };
    const ready = meshes !== null && placement !== null;
    setCrowdKindReady(kind, ready);
    env.registry.setCapacity(kind, ready ? capacity : 0);
    if (ready && placement !== null) {
      env.registry.setGeometry(kind, { geometry: rig.geometry, position: placement.offset.toArray() as [number, number, number], scale: placement.scale });
    }
    if (meshes === null || !ready) return;
    for (const mesh of [made.main, ...made.mirrors]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      state.scene.add(mesh);
    }
  };

  return {
    mount(state: EngineFrameState) {
      stateRef = state;
      void build(state).then(() => {
        if (cancelled || stateRef === null || meshes === null || clipIndex === null) return;
        const env = getEnv();
        const active = meshes;
        const index = clipIndex;
        leaveWrite = joinFrameTask(0, (_frame, delta) => {
          if (baked === null || placement === null || active === null) return;
          // A crowd on a game clock stops when the game stops; an unbound preview advances on real time.
          if (uniforms !== null) {
            const advanced = env.ctx?.time.advancedSeconds?.();
            uniforms.crowdTime.value = advanced !== undefined && advanced > 0 ? advanced : uniforms.crowdTime.value + delta;
          }
          const batches = drawnMembers;
          let visible = 0;
          env.registry.forEach(kind, (id, member: CrowdMember) => {
            if (!env.visible.current(id)) return;
            const existing = batches[visible];
            if (existing === undefined) batches[visible] = { id, member };
            else {
              existing.id = id;
              existing.member = member;
            }
            visible += 1;
          });
          batches.length = visible;
          const count = writeCrowdBatch({
            mesh: active.main,
            play: uniforms === null ? null : (active.main.geometry.getAttribute("crowdPlay") as THREE.InstancedBufferAttribute),
            members: batches,
            placement,
            clips,
            bands,
            clipIndex: index,
            time: uniforms === null ? 0 : uniforms.crowdTime.value,
            playback,
            ids: drawnIds,
          });
          active.main.userData[ENTITY_INSTANCES_KEY] = drawnIds;
          for (const mirror of active.mirrors) {
            mirror.count = count;
            mirror.userData[ENTITY_INSTANCES_KEY] = drawnIds;
          }
          noteCrowdInstances(kind, count);
        });
        if (env.onPick !== undefined) {
          const dom = state.gl.domElement;
          const camera = state.camera;
          const onPointerDown = (event: PointerEvent) => {
            if (stateRef === null) return;
            const rect = dom.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            pickNdc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
            pickRay.setFromCamera(pickNdc, camera);
            const hits = pickRay.intersectObjects([active.main, ...active.mirrors], false);
            const hit = hits[0];
            if (hit === undefined || hit.instanceId === undefined) return;
            const id = drawnIds[hit.instanceId];
            if (id === undefined) return;
            event.stopPropagation();
            getEnv().onPick?.(id);
          };
          dom.addEventListener("pointerdown", onPointerDown);
          leavePick = () => dom.removeEventListener("pointerdown", onPointerDown);
        }
      }).catch((error) => {
        reportFallbackSeam("entity", "renderError");
        console.error("[jgengine:crowd] batch load failed", model.url, error);
      });
    },
    dispose(state: EngineFrameState) {
      cancelled = true;
      cleanup(state);
      const env = getEnv();
      setCrowdKindReady(kind, false);
      env.registry.setCapacity(kind, 0);
      env.registry.setGeometry(kind, undefined);
      clearCrowdKind(kind);
      stateRef = null;
    },
  };
}

/** Instance slot → entity id, so picking a batched character resolves like its own rig. @internal */
export const ENTITY_INSTANCES_KEY = POINTER_ENTITY_INSTANCES_KEY;

/** Props for {@link CharacterCrowd}. */
export interface CharacterCrowdProps {
  /** Character models the world can draw; only models with a `lod` policy join the crowd path. */
  models: readonly ModelConfig[];
  /** Where entity markers record the characters the crowd is drawing. */
  registry: CharacterCrowdRegistry;
  /** Baked samples per second for the crowd clips. Default 24. */
  fps?: number;
  /** Called when a batched character is clicked, with the entity a click on its own rig would select. */
  onPick?: (entityId: string) => void;
}

/**
 * Draws characters through the GPU batch path: one baked rig per character kind, one instanced draw
 * per material, every member's clip, time offset and speed sampled in the vertex shader. The entity
 * markers decide who is batched (their `lod` tiers and the batch capacity) and write poses into
 * `registry`; this layer owns the bakes, the materials and the instance buffers. Mount it in the same
 * canvas as the entity markers; unmount it to fall back to per-entity rigs.
 * @capability character-crowd draw animated or static characters as batched instanced draws instead of posing each skeleton
 */
export const CharacterCrowd = memoView("CharacterCrowd", function CharacterCrowd({ models, registry, fps = 24, onPick }: CharacterCrowdProps) {
  const held = useRef(new Map<string, ModelConfig>());
  const kinds = useMemo(() => stableCrowdKinds(models, held.current), [models]);
  const visible = useRenderVisibility();
  const ctx = useOptionalGameContext();
  const latest = useRef<CrowdBatchEnv>({ registry, fps, onPick, ctx, visible });
  latest.current = { registry, fps, onPick, ctx, visible };

  useEffect(() => {
    const dispose = devtools.probes.registerSystem("render/characters", characterLodProbe());
    return () => dispose();
  }, []);

  useFrameTask(() => {
    noteCharacterFrame();
  });

  useEffect(() => () => registry.clear(), [registry]);

  return (
    <>
      {kinds.map(([kind, model]) => (
        <CrowdBatchMount key={kind} kind={kind} model={model} latest={latest} />
      ))}
    </>
  );
});

/** One kind's crowd batch behind its own draw, so a failed bake cannot erase its siblings. */
function CrowdBatchMount({ kind, model, latest }: { kind: string; model: ModelConfig; latest: { current: CrowdBatchEnv } }) {
  useEngineDraw(() => crowdBatchDraw(kind, model, () => latest.current), [kind, model]);
  return null;
}
