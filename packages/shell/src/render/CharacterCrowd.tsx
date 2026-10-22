import { useFrame, useLoader } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { devtools } from "@jgengine/core/devtools/devtools";
import { warnOnce } from "@jgengine/core/devtools/warnOnce";
import type { ModelConfig } from "@jgengine/core/game/playableGame";

import {
  animationPhaseOf,
  characterLodProbe,
  clearCrowdKind,
  noteCharacterFrame,
  noteCrowdInstances,
} from "./characterLod";
import {
  CharacterCrowdRegistry,
  crowdClipForSpeed,
  crowdClipsOf,
  crowdKindOf,
  setCrowdKindReady,
  type CrowdMember,
} from "./crowdRegistry";
import { applyMaterialOverrideToMaterial } from "../materialOverride";
import { useRenderVisibility } from "../visibility/CullingProvider";
import { ModelFallbackBoundary } from "./SceneModels";
import { sharedGltfLoader } from "./modelLoad";
import {
  bakeSkinnedCrowd,
  createCrowdUniforms,
  patchCrowdMaterial,
} from "./SkinnedInstances";

/** Instances one crowd batch can draw; a batch skips past this rather than allocate mid-frame. */
const CROWD_CAPACITY = 128;

const scratchMatrix = new THREE.Matrix4();
const scratchOffset = new THREE.Matrix4();
const scratchQuaternion = new THREE.Quaternion();
const scratchPosition = new THREE.Vector3();
const scratchScale = new THREE.Vector3();

interface ClipPlayback {
  clip: number;
  offset: number;
}

/** A stable non-zero time offset for a member with no recorded pose, so a crowd is not in lockstep. */
function poseOffset(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return (Math.abs(hash) % 1000) / 1000 + 0.05;
}

function CrowdBatch({
  kind,
  model,
  registry,
  fps,
}: {
  kind: string;
  model: ModelConfig;
  registry: CharacterCrowdRegistry;
  fps: number;
}) {
  const gltf = useLoader(sharedGltfLoader, model.url);
  const clipNames = useMemo(() => gltf.animations.map((clip) => clip.name), [gltf]);
  const clips = useMemo(() => crowdClipsOf(model, clipNames), [model, clipNames]);
  const baked = useMemo(() => {
    if (clips.length === 0) return null;
    try {
      return bakeSkinnedCrowd({ scene: gltf.scene, animations: gltf.animations }, { clips, fps });
    } catch (error) {
      // A model can carry clips without a skin (a node-transform prop animation). It keeps its own
      // rig rather than entering the crowd path, which is what the readiness flag then reports.
      warnOnce(`character-crowd:${model.url}`, `[jgengine] character crowd: "${model.url}" cannot be baked (no skinned mesh) and stays on its own rig`);
      return null;
    }
  }, [gltf, clips, fps, model.url]);
  useEffect(() => () => baked?.dispose(), [baked]);

  const uniforms = useMemo(() => (baked === null ? null : createCrowdUniforms(baked)), [baked]);
  const materials = useMemo(() => {
    if (baked === null || uniforms === null) return [];
    return baked.materials.map((material) => {
      const tinted = model.material === undefined ? material.clone() : applyMaterialOverrideToMaterial(material.clone(), model.material, false, undefined);
      return patchCrowdMaterial(tinted, uniforms);
    });
  }, [baked, uniforms, model]);
  const depthMaterial = useMemo(
    () => (uniforms === null ? null : patchCrowdMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), uniforms)),
    [uniforms],
  );

  const mesh = useMemo(() => {
    if (baked === null || depthMaterial === null || materials.length === 0) return null;
    const instanced = new THREE.InstancedMesh(baked.geometry, materials, CROWD_CAPACITY);
    instanced.customDepthMaterial = depthMaterial;
    instanced.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0);
    instanced.count = 0;
    instanced.geometry.setAttribute("crowdPlay", new THREE.InstancedBufferAttribute(new Float32Array(CROWD_CAPACITY * 3), 3));
    instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return instanced;
  }, [baked, materials, depthMaterial]);

  useEffect(
    () => () => {
      for (const material of materials) material.dispose();
      depthMaterial?.dispose();
      mesh?.dispose();
    },
    [materials, depthMaterial, mesh],
  );

  useEffect(() => {
    // A kind without a bakeable locomotion clip set keeps every character on its own rig rather than
    // making them invisible past the crowd distance.
    setCrowdKindReady(kind, mesh !== null && clips.length > 0);
    return () => setCrowdKindReady(kind, false);
  }, [kind, mesh, clips]);

  /** The height and centering the full entity path gives this model, so a crowd copy stands in the same place. */
  const placement = useMemo(() => {
    if (baked === null) return null;
    const box = baked.geometry.boundingBox ?? (baked.geometry.computeBoundingBox(), baked.geometry.boundingBox)!;
    const height = box.max.y - box.min.y;
    const scale = (model.scale ?? 1) * (model.targetHeight !== undefined && height > 0 ? model.targetHeight / height : 1);
    return {
      scale,
      offset: new THREE.Vector3(-scale * (box.min.x + box.max.x) / 2, (model.y ?? 0) - scale * box.min.y, -scale * (box.min.z + box.max.z) / 2),
    };
  }, [baked, model]);

  const playback = useRef(new Map<string, ClipPlayback>());
  const visibleRef = useRenderVisibility();

  useFrame((_state, delta) => {
    if (mesh === null || baked === null || uniforms === null || placement === null) return;
    uniforms.crowdTime.value += delta;
    const play = mesh.geometry.getAttribute("crowdPlay") as THREE.InstancedBufferAttribute;
    const active = playback.current;
    let count = 0;
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    registry.forEach(kind, (id, member: CrowdMember) => {
      if (count >= CROWD_CAPACITY) return;
      if (!visibleRef.current(id)) return;
      const clipName = crowdClipForSpeed(clips, member.speed);
      const clip = clipName === undefined ? 0 : baked.clipIndex.get(clipName) ?? 0;
      let entry = active.get(id);
      if (entry === undefined || entry.clip !== clip) {
        // Hand the crowd the pose the rig was holding, so the swap continues the same gait instead
        // of restarting the clip at a different phase.
        const phase = animationPhaseOf(id);
        entry = {
          clip,
          offset: phase !== undefined && phase.clip === clipName ? phase.time - uniforms.crowdTime.value : poseOffset(id),
        };
        active.set(id, entry);
      }
      scratchQuaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, member.rotationY);
      scratchMatrix.compose(scratchPosition.set(member.x, member.y, member.z), scratchQuaternion, scratchScale.setScalar(placement.scale));
      scratchMatrix.multiply(scratchOffset.makeTranslation(placement.offset.x, placement.offset.y, placement.offset.z));
      mesh.setMatrixAt(count, scratchMatrix);
      play.setXYZ(count, entry.clip, entry.offset, 1);
      minX = Math.min(minX, member.x); maxX = Math.max(maxX, member.x);
      minY = Math.min(minY, member.y); maxY = Math.max(maxY, member.y);
      minZ = Math.min(minZ, member.z); maxZ = Math.max(maxZ, member.z);
      count += 1;
    });
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    play.needsUpdate = true;
    if (count > 0) {
      // One batch spans every drawn member, so its cull sphere has to follow them; three cannot cull
      // an InstancedMesh per instance.
      const sphere = mesh.boundingSphere ?? (mesh.boundingSphere = new THREE.Sphere());
      sphere.center.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
      sphere.radius = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2 + placement.scale * 1.2;
    }
    noteCrowdInstances(kind, count);
  });

  useEffect(() => () => clearCrowdKind(kind), [kind]);

  if (mesh === null) return null;
  return <primitive object={mesh} castShadow receiveShadow />;
}

/** Props for {@link CharacterCrowd}. */
export interface CharacterCrowdProps {
  /** Character models the world can draw; only models with a `lod` policy join the crowd path. */
  models: readonly ModelConfig[];
  /** Where entity markers record the characters the crowd is drawing. */
  registry: CharacterCrowdRegistry;
  /** Baked samples per second for the crowd clips. Default 24. */
  fps?: number;
}

/**
 * Draws far characters through the GPU crowd path: one baked rig per character kind, one instanced
 * draw per material, every member's clip, time offset and speed sampled in the vertex shader. The
 * entity markers decide who is far enough (their `lod` tiers) and write poses into `registry`; this
 * layer owns the bakes, the materials and the instance buffers. Mount it in the same canvas as the
 * entity markers; unmount it to fall back to per-entity rigs.
 * @capability character-crowd draw distant animated characters on the GPU instead of posing their skeletons
 */
export function CharacterCrowd({ models, registry, fps = 24 }: CharacterCrowdProps) {
  const kinds = useMemo(() => {
    const unique = new Map<string, ModelConfig>();
    for (const model of models) {
      const kind = crowdKindOf(model);
      if (!unique.has(kind)) unique.set(kind, model);
    }
    return [...unique.entries()];
  }, [models]);

  useEffect(() => {
    const dispose = devtools.probes.registerSystem("render/characters", characterLodProbe());
    return () => dispose();
  }, []);

  useFrame(() => {
    noteCharacterFrame();
  });

  useEffect(() => () => registry.clear(), [registry]);

  return (
    <>
      {kinds.map(([kind, model]) => (
        <ModelFallbackBoundary key={kind} fallback={null} url={model.url} seam="entity">
          <Suspense fallback={null}>
            <CrowdBatch kind={kind} model={model} registry={registry} fps={fps} />
          </Suspense>
        </ModelFallbackBoundary>
      ))}
    </>
  );
}

