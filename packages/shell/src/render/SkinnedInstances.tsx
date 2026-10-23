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
  /** The bone-matrix texture, or `null` for a rig with no clips: a static character needs no sampling. */
  texture: THREE.DataTexture | null;
  layout: BoneTextureLayout | null;
  /** Per clip: whether it loops. Same order as `layout.clips`. */
  loops: boolean[];
  clipIndex: ReadonlyMap<string, number>;
  /** Whether members play the baked clips; false for a static character, whose geometry never moves. */
  animated: boolean;
  /** Bind-pose bounds of every merged part, for placement that matches the per-entity path. */
  bounds: THREE.Box3;
  dispose(): void;
}

interface BoneSlot {
  node: THREE.Object3D;
  inverse: THREE.Matrix4;
}

const IDENTITY = new THREE.Matrix4();

function slotFor(slots: BoneSlot[], node: THREE.Object3D, inverse: THREE.Matrix4): number {
  const found = slots.findIndex((slot) => slot.node === node && slot.inverse.equals(inverse));
  if (found >= 0) return found;
  slots.push({ node, inverse: inverse.clone() });
  return slots.length - 1;
}

function firstMaterial(material: THREE.Material | THREE.Material[]): THREE.Material {
  return Array.isArray(material) ? material[0]! : material;
}

/** Node names any of the clips animate, so a rigid part rides the nearest one that carries it. */
function animatedNodeNames(clips: readonly THREE.AnimationClip[]): Set<string> {
  const names = new Set<string>();
  for (const clip of clips) {
    for (const track of clip.tracks) {
      const parsed = THREE.PropertyBinding.parseTrackName(track.name);
      if (parsed.nodeName !== undefined && parsed.nodeName.length > 0) names.add(parsed.nodeName);
    }
  }
  return names;
}

/** The nearest node (self included) a clip moves, or the root when nothing above this mesh is animated. */
function rigidSlotNode(mesh: THREE.Object3D, root: THREE.Object3D, animated: ReadonlySet<string>): THREE.Object3D {
  let node: THREE.Object3D | null = mesh;
  while (node !== null) {
    if (animated.has(node.name)) return node;
    if (node === root) break;
    node = node.parent;
  }
  return root;
}

/** Attribute layout two geometries must agree on before their vertices can share a draw. */
function layoutKey(geometry: THREE.BufferGeometry): string {
  const parts = [geometry.index === null ? "plain" : "indexed"];
  for (const name of Object.keys(geometry.attributes).sort()) {
    const attribute = geometry.attributes[name]!;
    parts.push(`${name}:${attribute.itemSize}:${attribute.normalized === true ? 1 : 0}`);
  }
  return parts.join(",");
}

/** Copies the attributes a batch can draw: the vertex, its normal and its texture coordinate. */
function bakePart(mesh: THREE.Mesh, relative: THREE.Matrix4): { geometry: THREE.BufferGeometry; layout: string; material: THREE.Material } {
  const source = mesh.geometry;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", source.getAttribute("position").clone());
  if (source.getAttribute("normal") !== undefined) geometry.setAttribute("normal", source.getAttribute("normal").clone());
  else geometry.setAttribute("normal", new THREE.Float32BufferAttribute(new Float32Array(source.getAttribute("position").count * 3), 3));
  const uv = source.getAttribute("uv");
  geometry.setAttribute("uv", uv !== undefined ? uv.clone() : new THREE.Float32BufferAttribute(new Float32Array(source.getAttribute("position").count * 2), 2));
  if (source.index !== null) geometry.setIndex(source.index.clone());
  geometry.applyMatrix4(relative);
  const layout = layoutKey(geometry);
  return { geometry, layout, material: firstMaterial(mesh.material) };
}

/**
 * Bakes a rig for {@link SkinnedInstances}: merges its meshes into one geometry per material, samples
 * every requested clip at `fps`, and writes each slot's model-space matrix into a float texture laid
 * out by `planBoneTexture`. A skinned mesh contributes its bones as slots; a rig-less part that a
 * clip moves contributes that node, with its vertices weighted fully to it, so a node-transform
 * character (a walking miniature with rotating limbs) batches through the same shader. A model with
 * no clips at all bakes to `animated: false`: one merged geometry per material and no texture.
 * Meshes with several materials keep only the first. Exported for tests and custom crowd renderers.
 */
export function bakeSkinnedCrowd(source: SkinnedCrowdSource, options: BakeSkinnedCrowdOptions = {}): BakedSkinnedCrowd {
  const root = cloneSkinned(source.scene);
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);

  const names = options.clips ?? source.animations.map((clip) => clip.name);
  const clips = names.map((name) => {
    const clip = THREE.AnimationClip.findByName(source.animations as THREE.AnimationClip[], name);
    if (clip === null) throw new Error(`bakeSkinnedCrowd: no clip named "${name}"`);
    return clip;
  });
  const animatedClips = clips.length > 0 ? clips : (source.animations as THREE.AnimationClip[]);
  const animatedNames = animatedNodeNames(animatedClips);
  const rootInverse = root.matrixWorld.clone().invert();

  const slots: BoneSlot[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const bounds = new THREE.Box3();
  const groups = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material }>();

  root.updateMatrixWorld(true);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true || Array.isArray(mesh.material) || mesh.material === undefined) return;
    if (Object.keys(mesh.geometry.morphAttributes).length > 0) throw new Error("bakeSkinnedCrowd: the rig has morph targets");
    if (mesh.geometry.getAttribute("position") === undefined) return;
    mesh.geometry.computeBoundingBox();
    if (mesh.geometry.boundingBox !== null) bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));

    const skinned = mesh as THREE.SkinnedMesh;
    let part: { geometry: THREE.BufferGeometry; layout: string; material: THREE.Material };
    if (skinned.isSkinnedMesh === true) {
      const source = mesh.geometry;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", source.getAttribute("position").clone());
      if (source.getAttribute("normal") !== undefined) geometry.setAttribute("normal", source.getAttribute("normal").clone());
      else geometry.setAttribute("normal", new THREE.Float32BufferAttribute(new Float32Array(source.getAttribute("position").count * 3), 3));
      const uv = source.getAttribute("uv");
      geometry.setAttribute("uv", uv !== undefined ? uv.clone() : new THREE.Float32BufferAttribute(new Float32Array(source.getAttribute("position").count * 2), 2));
      if (source.index !== null) geometry.setIndex(source.index.clone());
      geometry.applyMatrix4(skinned.bindMatrix);

      const skinIndex = source.getAttribute("skinIndex");
      const skinWeight = source.getAttribute("skinWeight");
      const remapped = new Float32Array(skinIndex.count * 4);
      const weights = new Float32Array(skinWeight.count * 4);
      const bySkeletonIndex = skinned.skeleton.bones.map((bone, index) => slotFor(slots, bone, skinned.skeleton.boneInverses[index]!));
      for (let v = 0; v < skinIndex.count; v += 1) {
        for (let c = 0; c < 4; c += 1) {
          remapped[v * 4 + c] = bySkeletonIndex[skinIndex.getComponent(v, c)] ?? 0;
          weights[v * 4 + c] = skinWeight.getComponent(v, c);
        }
      }
      geometry.setAttribute("skinIndex", new THREE.Float32BufferAttribute(remapped, 4));
      geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
      part = { geometry, layout: layoutKey(geometry), material: firstMaterial(mesh.material) };
    } else {
      const slotNode = rigidSlotNode(mesh, root, animatedNames);
      const nodeInverse = slotNode.matrixWorld.clone().invert();
      const slot = slotFor(slots, slotNode, IDENTITY);
      const relative = new THREE.Matrix4().multiplyMatrices(nodeInverse, mesh.matrixWorld);
      part = bakePart(mesh, relative);
      const count = part.geometry.getAttribute("position").count;
      const skinIndex = new Float32Array(count * 4);
      const skinWeight = new Float32Array(count * 4);
      for (let v = 0; v < count; v += 1) {
        skinIndex[v * 4] = slot;
        skinWeight[v * 4] = 1;
      }
      part.geometry.setAttribute("skinIndex", new THREE.Float32BufferAttribute(skinIndex, 4));
      part.geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));
      part.layout = layoutKey(part.geometry);
    }

    // Vertices are already in slot space, chosen per vertex by skinIndex, so parts that share a
    // material and a vertex layout merge into one draw whatever node moves them.
    const key = `${part.material.uuid}|${part.layout}`;
    const existing = groups.get(key);
    if (existing === undefined) groups.set(key, { geometry: part.geometry, material: part.material });
    else {
      const merged = mergeGeometries([existing.geometry, part.geometry], false);
      if (merged === null) {
        groups.set(`${key}|${groups.size}`, { geometry: part.geometry, material: part.material });
      } else {
        existing.geometry.dispose();
        part.geometry.dispose();
        existing.geometry = merged;
      }
    }
  });

  for (const group of groups.values()) {
    geometries.push(group.geometry);
    materials.push(group.material);
  }
  if (geometries.length === 0) throw new Error("bakeSkinnedCrowd: the source has no drawable mesh");
  // The shader transforms a normal by the slot matrix, which is only exact for uniform scale.
  const scale = new THREE.Vector3();
  for (const slot of slots) {
    slot.node.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    if (Math.abs(scale.x - scale.y) > 1e-4 || Math.abs(scale.y - scale.z) > 1e-4) {
      throw new Error("bakeSkinnedCrowd: the rig animates a node with non-uniform scale");
    }
  }
  const geometry = geometries.length === 1 ? geometries[0]! : mergeGeometries(geometries, true);
  if (geometries.length > 1) for (const part of geometries) part.dispose();
  if (geometry === null) throw new Error("bakeSkinnedCrowd: could not merge the rig's meshes");
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  if (clips.length === 0) {
    return {
      geometry,
      materials,
      texture: null,
      layout: null,
      loops: [],
      clipIndex: new Map(),
      animated: false,
      bounds,
      dispose() {
        geometry.dispose();
      },
    };
  }

  const layout = planBoneTexture({
    boneCount: slots.length,
    clips: clips.map((clip) => ({ name: clip.name, duration: clip.duration })),
    fps: options.fps,
    maxTextureSize: options.maxTextureSize,
  });

  const data = new Float32Array(layout.width * layout.height * 4);
  const mixer = new THREE.AnimationMixer(root);
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
        matrix.multiplyMatrices(rootInverse, slot.node.matrixWorld).multiply(slot.inverse);
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
    animated: true,
    bounds,
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
  const layout = baked.layout;
  if (baked.texture === null || layout === null) throw new Error("createCrowdUniforms: the rig is static and needs no crowd uniforms");
  return {
    crowdBones: { value: baked.texture },
    crowdTime: { value: 0 },
    crowdClips: {
      value: layout.clips.map((clip, index) => new THREE.Vector4(clip.startFrame, clip.frameCount, layout.fps, baked.loops[index] ? 1 : 0)),
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
  /** A baked clip name; a static rig draws bind pose whatever the member names. */
  clip?: string;
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

  const uniforms = useMemo(() => (baked.animated ? createCrowdUniforms(baked) : null), [baked]);
  const materials = useMemo(
    () => baked.materials.map((material) => (uniforms === null ? material.clone() : patchCrowdMaterial(material.clone(), uniforms))),
    [baked, uniforms],
  );
  const depthMaterial = useMemo(
    () => (uniforms === null ? null : patchCrowdMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), uniforms)),
    [uniforms],
  );
  useEffect(
    () => () => {
      for (const material of materials) material.dispose();
      depthMaterial?.dispose();
    },
    [materials, depthMaterial],
  );

  const capacity = Math.max(1, instances.length);
  const mesh = useMemo(() => {
    const instanced = new THREE.InstancedMesh(baked.geometry, materials.length === 1 ? materials[0]! : materials, capacity);
    if (depthMaterial !== null) instanced.customDepthMaterial = depthMaterial;
    if (uniforms !== null) instanced.geometry.setAttribute("crowdPlay", new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
    return instanced;
  }, [baked, materials, depthMaterial, uniforms, capacity]);
  useEffect(
    () => () => {
      mesh.dispose();
    },
    [mesh],
  );

  useLayoutEffect(() => {
    const play = uniforms === null ? null : (mesh.geometry.getAttribute("crowdPlay") as THREE.InstancedBufferAttribute);
    instances.forEach((instance, i) => {
      const scale = (instance.scale ?? 1) * modelScale;
      scratchQuaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, instance.rotationY ?? 0);
      scratchMatrix.compose(scratchPosition.set(instance.position[0], instance.position[1], instance.position[2]), scratchQuaternion, scratchScale.set(scale, scale, scale));
      mesh.setMatrixAt(i, scratchMatrix);
      play?.setXYZ(i, instance.clip === undefined ? 0 : baked.clipIndex.get(instance.clip) ?? 0, instance.timeOffset ?? 0, instance.speed ?? 1);
    });
    mesh.count = instances.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (play !== null) play.needsUpdate = true;
    mesh.computeBoundingSphere();
    // Poses reach past the bind-pose bounds (arms out, a lunge), so pad the cull sphere.
    if (mesh.boundingSphere !== null) mesh.boundingSphere.radius += (baked.geometry.boundingSphere?.radius ?? 0) * modelScale;
  }, [mesh, instances, baked, modelScale, uniforms]);

  useFrame((_three, delta) => {
    if (uniforms !== null) uniforms.crowdTime.value += delta * timeScale;
  });

  return <primitive object={mesh} castShadow={castShadow} receiveShadow={receiveShadow} />;
}
