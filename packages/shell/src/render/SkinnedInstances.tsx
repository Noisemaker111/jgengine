import { useFrame, useLoader } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import { planBoneTexture, type BoneTextureLayout } from "@jgengine/core/anim/boneTexture";

import { sharedGltfLoader } from "./modelLoad";

/** A rig to bake: a loaded scene with skinned meshes and its clips. */
export interface SkinnedCrowdSource {
  scene: THREE.Object3D;
  animations: readonly THREE.AnimationClip[];
}

/** Options for {@link bakeSkinnedCrowd}. */
export interface BakeSkinnedCrowdOptions {
  /** Clip names to bake, in order; default every clip on the rig. */
  clips?: readonly string[];
  /** Baked samples per second. Default 30. */
  fps?: number;
  /** Clips that hold their last pose instead of looping. */
  once?: readonly string[];
  maxTextureSize?: number;
}

/** A rig baked for instancing: one merged geometry, the bone-matrix texture and its layout. */
export interface BakedSkinnedCrowd {
  geometry: THREE.BufferGeometry;
  /** One material per merged mesh, in geometry-group order, not yet patched. */
  materials: THREE.Material[];
  texture: THREE.DataTexture;
  layout: BoneTextureLayout;
  /** Per clip: whether it loops. Same order as `layout.clips`. */
  loops: boolean[];
  clipIndex: ReadonlyMap<string, number>;
  dispose(): void;
}

interface BoneSlot {
  bone: THREE.Bone;
  inverse: THREE.Matrix4;
}

function slotFor(slots: BoneSlot[], bone: THREE.Bone, inverse: THREE.Matrix4): number {
  const found = slots.findIndex((slot) => slot.bone === bone && slot.inverse.equals(inverse));
  if (found >= 0) return found;
  slots.push({ bone, inverse: inverse.clone() });
  return slots.length - 1;
}

function firstMaterial(material: THREE.Material | THREE.Material[]): THREE.Material {
  return Array.isArray(material) ? material[0]! : material;
}

/**
 * Bakes a rig for {@link SkinnedInstances}: merges its skinned meshes into one geometry in bind
 * space, samples every requested clip at `fps`, and writes each bone's model-space skinning matrix
 * into a float texture laid out by `planBoneTexture`. Meshes with several materials keep only the
 * first. Exported for tests and custom crowd renderers.
 */
export function bakeSkinnedCrowd(source: SkinnedCrowdSource, options: BakeSkinnedCrowdOptions = {}): BakedSkinnedCrowd {
  const root = cloneSkinned(source.scene);
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);

  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh === true) meshes.push(object as THREE.SkinnedMesh);
  });
  if (meshes.length === 0) throw new Error("bakeSkinnedCrowd: the source has no skinned mesh");

  const slots: BoneSlot[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  for (const mesh of meshes) {
    const source = mesh.geometry;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", source.getAttribute("position").clone());
    if (source.getAttribute("normal") !== undefined) geometry.setAttribute("normal", source.getAttribute("normal").clone());
    else geometry.setAttribute("normal", new THREE.Float32BufferAttribute(new Float32Array(source.getAttribute("position").count * 3), 3));
    const uv = source.getAttribute("uv");
    geometry.setAttribute("uv", uv !== undefined ? uv.clone() : new THREE.Float32BufferAttribute(new Float32Array(source.getAttribute("position").count * 2), 2));
    if (source.index !== null) geometry.setIndex(source.index.clone());
    geometry.applyMatrix4(mesh.bindMatrix);

    const skinIndex = source.getAttribute("skinIndex");
    const skinWeight = source.getAttribute("skinWeight");
    const remapped = new Float32Array(skinIndex.count * 4);
    const weights = new Float32Array(skinWeight.count * 4);
    const bySkeletonIndex = mesh.skeleton.bones.map((bone, i) => slotFor(slots, bone, mesh.skeleton.boneInverses[i]!));
    for (let v = 0; v < skinIndex.count; v += 1) {
      for (let c = 0; c < 4; c += 1) {
        remapped[v * 4 + c] = bySkeletonIndex[skinIndex.getComponent(v, c)] ?? 0;
        weights[v * 4 + c] = skinWeight.getComponent(v, c);
      }
    }
    geometry.setAttribute("skinIndex", new THREE.Float32BufferAttribute(remapped, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
    geometries.push(geometry);
    materials.push(firstMaterial(mesh.material));
  }
  const geometry = mergeGeometries(geometries, true);
  for (const part of geometries) part.dispose();
  if (geometry === null) throw new Error("bakeSkinnedCrowd: could not merge the rig's meshes");
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const names = options.clips ?? source.animations.map((clip) => clip.name);
  const clips = names.map((name) => {
    const clip = THREE.AnimationClip.findByName(source.animations as THREE.AnimationClip[], name);
    if (clip === null) throw new Error(`bakeSkinnedCrowd: no clip named "${name}"`);
    return clip;
  });
  const layout = planBoneTexture({
    boneCount: slots.length,
    clips: clips.map((clip) => ({ name: clip.name, duration: clip.duration })),
    fps: options.fps,
    maxTextureSize: options.maxTextureSize,
  });

  const data = new Float32Array(layout.width * layout.height * 4);
  const mixer = new THREE.AnimationMixer(root);
  const rootInverse = root.matrixWorld.clone().invert();
  const matrix = new THREE.Matrix4();
  clips.forEach((clip, clipIndex) => {
    const baked = layout.clips[clipIndex]!;
    const action = mixer.clipAction(clip);
    action.play();
    for (let frame = 0; frame < baked.frameCount; frame += 1) {
      action.time = Math.min(frame / layout.fps, clip.duration);
      mixer.update(0);
      root.updateMatrixWorld(true);
      const rowOffset = (baked.startFrame + frame) * layout.width * 4;
      slots.forEach((slot, s) => {
        matrix.multiplyMatrices(rootInverse, slot.bone.matrixWorld).multiply(slot.inverse);
        data.set(matrix.elements, rowOffset + s * 16);
      });
    }
    action.stop();
  });
  mixer.uncacheRoot(root);

  const texture = new THREE.DataTexture(data, layout.width, layout.height, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  const once = new Set(options.once ?? []);
  return {
    geometry,
    materials,
    texture,
    layout,
    loops: layout.clips.map((clip) => !once.has(clip.name)),
    clipIndex: new Map(layout.clips.map((clip, index) => [clip.name, index])),
    dispose() {
      geometry.dispose();
      texture.dispose();
    },
  };
}

/** Uniforms shared by every material of one crowd; `crowdTime` advances once per frame. */
export interface CrowdUniforms {
  crowdBones: { value: THREE.DataTexture };
  crowdTime: { value: number };
  crowdClips: { value: THREE.Vector4[] };
}

/** Builds the uniforms a crowd material reads: the texture and per-clip start, frames, fps and loop. */
export function createCrowdUniforms(baked: BakedSkinnedCrowd): CrowdUniforms {
  return {
    crowdBones: { value: baked.texture },
    crowdTime: { value: 0 },
    crowdClips: {
      value: baked.layout.clips.map((clip, index) => new THREE.Vector4(clip.startFrame, clip.frameCount, baked.layout.fps, baked.loops[index] ? 1 : 0)),
    },
  };
}

const CROWD_HEADER = /* glsl */ `
uniform highp sampler2D crowdBones;
uniform float crowdTime;
uniform vec4 crowdClips[CROWD_CLIP_COUNT];
attribute vec4 skinIndex;
attribute vec4 skinWeight;
attribute vec3 crowdPlay;
mat4 crowdMatrix;
bool crowdReady = false;
mat4 crowdBone(float slot, float row) {
  int x = int(slot + 0.5) * 4;
  int y = int(row + 0.5);
  return mat4(
    texelFetch(crowdBones, ivec2(x, y), 0),
    texelFetch(crowdBones, ivec2(x + 1, y), 0),
    texelFetch(crowdBones, ivec2(x + 2, y), 0),
    texelFetch(crowdBones, ivec2(x + 3, y), 0));
}
mat4 crowdSkin() {
  if (crowdReady) return crowdMatrix;
  vec4 clip = crowdClips[int(crowdPlay.x + 0.5)];
  float span = clip.y - 1.0;
  float raw = (crowdTime * crowdPlay.z + crowdPlay.y) * clip.z;
  float frame = clip.w > 0.5 ? mod(raw, span) : clamp(raw, 0.0, span);
  float a = floor(frame);
  float t = frame - a;
  float rowA = clip.x + a;
  float rowB = clip.x + min(a + 1.0, span);
  crowdMatrix = mat4(0.0);
  for (int i = 0; i < 4; i++) {
    float w = skinWeight[i];
    if (w > 0.0) crowdMatrix += w * ((1.0 - t) * crowdBone(skinIndex[i], rowA) + t * crowdBone(skinIndex[i], rowB));
  }
  crowdReady = true;
  return crowdMatrix;
}
`;

/**
 * Patches a material so each instance skins itself from the crowd texture: per-instance `crowdPlay`
 * is (clip index, time offset, speed). Works on any built-in material, the depth material for
 * shadows included.
 */
export function patchCrowdMaterial<T extends THREE.Material>(material: T, uniforms: CrowdUniforms): T {
  const clipCount = Math.max(1, uniforms.crowdClips.value.length);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n#define CROWD_CLIP_COUNT ${clipCount}\n${CROWD_HEADER}`)
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nobjectNormal = mat3(crowdSkin()) * objectNormal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed = (crowdSkin() * vec4(transformed, 1.0)).xyz;");
  };
  material.customProgramCacheKey = () => `jg-crowd-${clipCount}`;
  return material;
}

/** One crowd member: where it stands and what it plays. */
export interface CrowdInstance {
  position: readonly [number, number, number];
  rotationY?: number;
  scale?: number;
  /** A baked clip name. */
  clip: string;
  /** Seconds into the clip at crowd time zero, so members do not move in lockstep. */
  timeOffset?: number;
  /** Playback rate. Default 1. */
  speed?: number;
}

/** Props for {@link SkinnedInstances}. */
export interface SkinnedInstancesProps {
  url: string;
  instances: readonly CrowdInstance[];
  /** Clip names to bake; default every clip on the rig. */
  clips?: readonly string[];
  /** Clips that hold their last pose instead of looping. */
  once?: readonly string[];
  fps?: number;
  /** Uniform scale applied to every member, e.g. to normalize a rig to a height. */
  modelScale?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Multiplies crowd time; `0` freezes every member. Default 1. */
  timeScale?: number;
}

const scratchMatrix = new THREE.Matrix4();
const scratchQuaternion = new THREE.Quaternion();
const scratchPosition = new THREE.Vector3();
const scratchScale = new THREE.Vector3();

/**
 * Renders many animated copies of one rigged model in a single instanced draw per material: the
 * rig's clips are baked to a bone-matrix texture once, and each instance samples its own clip, time
 * offset and speed on the GPU. For crowds, spectators and distant NPCs; a character that needs
 * blending, IK or attachments stays an entity model.
 */
export function SkinnedInstances({
  url,
  instances,
  clips,
  once,
  fps,
  modelScale = 1,
  castShadow = true,
  receiveShadow = true,
  timeScale = 1,
}: SkinnedInstancesProps) {
  const gltf = useLoader(sharedGltfLoader, url);
  const clipKey = clips?.join("\u0000");
  const onceKey = once?.join("\u0000");
  const baked = useMemo(
    () => bakeSkinnedCrowd({ scene: gltf.scene, animations: gltf.animations }, { clips, once, fps }),
    [gltf, clipKey, onceKey, fps],
  );
  useEffect(() => () => baked.dispose(), [baked]);

  const uniforms = useMemo(() => createCrowdUniforms(baked), [baked]);
  const materials = useMemo(() => baked.materials.map((material) => patchCrowdMaterial(material.clone(), uniforms)), [baked, uniforms]);
  const depthMaterial = useMemo(() => patchCrowdMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), uniforms), [uniforms]);
  useEffect(
    () => () => {
      for (const material of materials) material.dispose();
      depthMaterial.dispose();
    },
    [materials, depthMaterial],
  );

  const capacity = Math.max(1, instances.length);
  const mesh = useMemo(() => {
    const instanced = new THREE.InstancedMesh(baked.geometry, materials, capacity);
    instanced.customDepthMaterial = depthMaterial;
    instanced.geometry.setAttribute("crowdPlay", new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
    return instanced;
  }, [baked, materials, depthMaterial, capacity]);
  useEffect(
    () => () => {
      mesh.dispose();
    },
    [mesh],
  );

  useLayoutEffect(() => {
    const play = mesh.geometry.getAttribute("crowdPlay") as THREE.InstancedBufferAttribute;
    instances.forEach((instance, i) => {
      const scale = (instance.scale ?? 1) * modelScale;
      scratchQuaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, instance.rotationY ?? 0);
      scratchMatrix.compose(scratchPosition.set(instance.position[0], instance.position[1], instance.position[2]), scratchQuaternion, scratchScale.set(scale, scale, scale));
      mesh.setMatrixAt(i, scratchMatrix);
      play.setXYZ(i, baked.clipIndex.get(instance.clip) ?? 0, instance.timeOffset ?? 0, instance.speed ?? 1);
    });
    mesh.count = instances.length;
    mesh.instanceMatrix.needsUpdate = true;
    play.needsUpdate = true;
    mesh.computeBoundingSphere();
    // Poses reach past the bind-pose bounds (arms out, a lunge), so pad the cull sphere.
    if (mesh.boundingSphere !== null) mesh.boundingSphere.radius += (baked.geometry.boundingSphere?.radius ?? 0) * modelScale;
  }, [mesh, instances, baked, modelScale]);

  useFrame((_three, delta) => {
    uniforms.crowdTime.value += delta * timeScale;
  });

  return <primitive object={mesh} castShadow={castShadow} receiveShadow={receiveShadow} />;
}
