// @skill jgengine-world
import { useLoader } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { devtools } from "@jgengine/core/devtools/devtools";
import { warnOnce } from "@jgengine/core/devtools/warnOnce";
import type { ModelConfig } from "@jgengine/core/game/playableGame";

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
} from "./crowdRegistry.draw";
import { applyMaterialOverrideToMaterial, overrideTargets } from "@jgengine/core/material/materialOverride.draw";
import { useRenderVisibility } from "@jgengine/core/visibility/CullingProvider.draw";
import { useOptionalGameContext } from "@jgengine/react/provider";
import { POINTER_ENTITY_INSTANCES_KEY } from "@jgengine/core/input/pointerService.draw";
import { writeCrowdBatch, type CrowdPlayback } from "./crowdBatch.draw";
import { ModelFallbackBoundary } from "@jgengine/core/model/SceneModels.draw";
import { sharedGltfLoader } from "@jgengine/core/model/modelLoad.draw";
import { modelPlacementTransform } from "@jgengine/core/model/modelRender.draw";
import {
  bakeSkinnedCrowd,
  createCrowdUniforms,
  patchCrowdMaterial,
} from "./SkinnedInstances.draw";
import { memoView } from "../ui/memoView.view";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";

function CrowdBatch({
  kind,
  model,
  registry,
  fps,
  onPick,
}: {
  kind: string;
  model: ModelConfig;
  registry: CharacterCrowdRegistry;
  fps: number;
  onPick: ((id: string) => void) | undefined;
}) {
  const gltf = useLoader(sharedGltfLoader, model.url);
  const clipNames = useMemo(() => gltf.animations.map((clip) => clip.name), [gltf]);
  const clips = useMemo(() => crowdClipsOf(model, clipNames), [model, clipNames]);
  const bands = useMemo(() => crowdSpeedBandsOf(model, clipNames), [model, clipNames]);
  const capacity = useMemo(() => characterLodPolicy(model.lod === false ? undefined : model.lod).crowdCapacity, [model.lod]);
  const baked = useMemo(() => {
    // A model that plays clips but resolves none of them to locomotion keeps its own rig: batching it
    // would draw a frozen stance. A model with no clips at all is a static character, which batches.
    if (clipNames.length > 0 && clips.length === 0) return null;
    try {
      return bakeSkinnedCrowd({ scene: gltf.scene, animations: gltf.animations }, { clips, fps });
    } catch (error) {
      // A model can carry clips without a skin (a node-transform prop animation). It keeps its own
      // rig rather than entering the crowd path, which is what the readiness flag then reports.
      warnOnce(`character-crowd:${model.url}`, `[jgengine] character crowd: "${model.url}" cannot be baked and stays on its own rig`);
      return null;
    }
  }, [gltf, clips, clipNames.length, fps, model.url]);
  useEffect(() => () => baked?.dispose(), [baked]);

  const uniforms = useMemo(() => (baked === null || !baked.animated ? null : createCrowdUniforms(baked)), [baked]);
  // A tinted kind (traffic resprayed per kind) shares one batch across its colours: the materials the
  // override names draw white, and each member's colour multiplies them per instance.
  const painted = useMemo(() => {
    const override = model.material;
    if (baked === null || override === undefined || crowdTintOf(model) === undefined) return [];
    return baked.materials.map((material) => overrideTargets(material, override));
  }, [baked, model]);
  const materials = useMemo(() => {
    if (baked === null) return [];
    return baked.materials.map((material, index) => {
      const target = model.material === undefined ? material.clone() : applyMaterialOverrideToMaterial(material.clone(), model.material, false, undefined);
      if (painted[index] === true && "color" in target && target.color instanceof THREE.Color) target.color.set(0xffffff);
      return uniforms === null ? target : patchCrowdMaterial(target, uniforms);
    });
  }, [baked, uniforms, model, painted]);
  const depthMaterial = useMemo(
    () => (uniforms === null ? null : patchCrowdMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), uniforms)),
    [uniforms],
  );
  const skipped = useMemo(() => new THREE.MeshBasicMaterial({ visible: false }), []);

  const meshes = useMemo(() => {
    if (baked === null || materials.length === 0) return null;
    const build = (list: THREE.Material[]) => {
      const instanced = new THREE.InstancedMesh(baked.geometry, list.length === 1 ? list[0]! : list, capacity);
      if (depthMaterial !== null) instanced.customDepthMaterial = depthMaterial;
      instanced.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0);
      instanced.count = 0;
      instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return instanced;
    };
    if (uniforms !== null) baked.geometry.setAttribute("crowdPlay", new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
    if (!painted.includes(true)) return { main: build(materials), mirrors: [] };
    // The paint draws carry the per-instance colour; the rest (glass, tyres, trim) share the same
    // instance matrices without it, each material drawn by exactly one of the two.
    const main = build(materials.map((material, index) => painted[index] === true ? material : skipped));
    main.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    main.instanceColor.setUsage(THREE.DynamicDrawUsage);
    if (!painted.includes(false)) return { main, mirrors: [] };
    const rest = build(materials.map((material, index) => painted[index] === true ? skipped : material));
    rest.instanceMatrix = main.instanceMatrix;
    rest.boundingSphere = main.boundingSphere;
    return { main, mirrors: [rest] };
  }, [baked, materials, painted, skipped, depthMaterial, uniforms, capacity]);
  const mesh = meshes?.main ?? null;

  useEffect(
    () => () => {
      for (const material of materials) material.dispose();
      depthMaterial?.dispose();
      meshes?.main.dispose();
      for (const mirror of meshes?.mirrors ?? []) mirror.dispose();
    },
    [materials, depthMaterial, meshes],
  );
  useEffect(() => () => skipped.dispose(), [skipped]);

  /** The height and centering the full entity path gives this model, so a crowd copy stands in the same place. */
  const placement = useMemo(() => {
    if (baked === null) return null;
    const next = modelPlacementTransform(new THREE.Group(), model, {
      min: baked.bounds.min.toArray() as [number, number, number],
      max: baked.bounds.max.toArray() as [number, number, number],
      meshCount: 1,
    });
    return {
      scale: next.scale,
      offset: new THREE.Vector3(next.position[0], next.position[1], next.position[2]),
    };
  }, [baked, model]);

  useEffect(() => {
    // A kind without a bakeable set keeps every character on its own rig rather than making them
    // invisible past the crowd distance.
    const ready = mesh !== null && placement !== null;
    setCrowdKindReady(kind, ready);
    registry.setCapacity(kind, ready ? capacity : 0);
    if (ready && baked !== null && placement !== null) {
      registry.setGeometry(kind, { geometry: baked.geometry, position: placement.offset.toArray() as [number, number, number], scale: placement.scale });
    }
    return () => {
      setCrowdKindReady(kind, false);
      registry.setCapacity(kind, 0);
      registry.setGeometry(kind, undefined);
    };
  }, [kind, mesh, placement, registry, capacity, baked]);

  const playback = useRef(new Map<string, CrowdPlayback>());
  const visibleRef = useRenderVisibility();
  const ctx = useOptionalGameContext();
  const drawnIds = useRef<string[]>([]);
  const drawnMembers = useRef<{ id: string; member: CrowdMember }[]>([]);

  useFrameTask((_state, delta) => {
    if (mesh === null || baked === null || placement === null) return;
    // A crowd on a game clock stops when the game stops; an unbound preview advances on real time.
    if (uniforms !== null) {
      const advanced = ctx?.time.advancedSeconds?.();
      uniforms.crowdTime.value = advanced !== undefined && advanced > 0 ? advanced : uniforms.crowdTime.value + delta;
    }
    const batches = drawnMembers.current;
    let visible = 0;
    registry.forEach(kind, (id, member: CrowdMember) => {
      if (!visibleRef.current(id)) return;
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
      mesh,
      play: uniforms === null ? null : (mesh.geometry.getAttribute("crowdPlay") as THREE.InstancedBufferAttribute),
      members: batches,
      placement,
      clips,
      bands,
      clipIndex: baked.clipIndex,
      time: uniforms === null ? 0 : uniforms.crowdTime.value,
      playback: playback.current,
      ids: drawnIds.current,
    });
    mesh.userData[ENTITY_INSTANCES_KEY] = drawnIds.current;
    for (const mirror of meshes?.mirrors ?? []) {
      mirror.count = count;
      mirror.userData[ENTITY_INSTANCES_KEY] = drawnIds.current;
    }
    noteCrowdInstances(kind, count);
  });

  useEffect(() => () => clearCrowdKind(kind), [kind]);
  // A member removed while its matrix is still in the buffer must not linger on screen.
  useEffect(() => () => {
    playback.current.clear();
  }, []);

  if (meshes === null) return null;
  const pick = onPick === undefined
    ? undefined
    : (event: ThreeEvent<PointerEvent>) => {
        if (event.instanceId === undefined) return;
        const id = drawnIds.current[event.instanceId];
        if (id === undefined) return;
        event.stopPropagation();
        onPick(id);
      };
  return <>
    {[meshes.main, ...meshes.mirrors].map((drawn) => <primitive key={drawn.uuid} object={drawn} castShadow receiveShadow onPointerDown={pick} />)}
  </>;
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
        <ModelFallbackBoundary key={kind} fallback={null} url={model.url} seam="entity">
          <Suspense fallback={null}>
            <CrowdBatch kind={kind} model={model} registry={registry} fps={fps} onPick={onPick} />
          </Suspense>
        </ModelFallbackBoundary>
      ))}
    </>
  );
});
