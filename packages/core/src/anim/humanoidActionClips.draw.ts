import * as THREE from "three";

import { classifyClip } from "@jgengine/core/game/clipRoles";
import {
  HUMANOID_ACTION_NAMES,
  HUMANOID_ACTION_SLOTS,
  HUMANOID_ACTIONS,
  HUMANOID_FIRST_PERSON_CARRY,
  type HumanoidActionClip,
  type HumanoidActionName,
} from "./humanoidActions";
import { detectHumanoidRig, type SkeletonMap, type SkeletonSlot } from "./skeletonStandard";

const DEG = Math.PI / 180;

interface BaseNode {
  node: THREE.Object3D;
  quaternion: THREE.Quaternion;
  position: THREE.Vector3;
  /** Model-space matrix in the base pose, relative to the scene root. */
  world: THREE.Matrix4;
  /** Model-space rotation in the base pose. */
  rotation: THREE.Quaternion;
}

function firstValue(clip: THREE.AnimationClip | null, name: string, size: number): number[] | undefined {
  const track = clip?.tracks.find((candidate) => candidate.name === name);
  return track === undefined || track.values.length < size ? undefined : Array.from(track.values.subarray(0, size));
}

/** Every node's local and model-space transform in the base pose: the idle clip's first frame, else the bind pose. */
function basePose(scene: THREE.Object3D, base: THREE.AnimationClip | null): Map<string, BaseNode> {
  const nodes = new Map<string, BaseNode>();
  const scale = new THREE.Vector3();
  const visit = (node: THREE.Object3D, parent: THREE.Matrix4): void => {
    const q = firstValue(base, `${node.name}.quaternion`, 4);
    const p = firstValue(base, `${node.name}.position`, 3);
    const quaternion = q === undefined ? node.quaternion.clone() : new THREE.Quaternion(q[0], q[1], q[2], q[3]).normalize();
    const position = p === undefined ? node.position.clone() : new THREE.Vector3(p[0], p[1], p[2]);
    const world = node === scene ? new THREE.Matrix4() : parent.clone().multiply(new THREE.Matrix4().compose(position, quaternion, node.scale));
    const rotation = new THREE.Quaternion();
    world.decompose(new THREE.Vector3(), rotation, scale);
    if (node.name.length > 0 && !nodes.has(node.name)) nodes.set(node.name, { node, quaternion, position, world, rotation });
    for (const child of node.children) visit(child, world);
  };
  visit(scene, new THREE.Matrix4());
  return nodes;
}

function rotationAt(key: HumanoidActionClip["keys"][number], slot: (typeof HUMANOID_ACTION_SLOTS)[number], out: THREE.Quaternion): THREE.Quaternion {
  const angles = key.rotate?.[slot];
  if (angles === undefined) return out.identity();
  return out.setFromEuler(new THREE.Euler(angles[0] * DEG, angles[1] * DEG, angles[2] * DEG, "XYZ"));
}

/**
 * One authored action as a clip on this rig. Each slot's model-space turn `D` is applied at the joint
 * on top of the base pose: local' = local · (W⁻¹ · D · W), where `W` is the bone's base model-space
 * rotation, so the bone's model rotation becomes `D · W` while its parent holds still and a parent's
 * own turn carries it. Every other track of the base clip is held at its first frame, so fingers,
 * face and root keep the idle pose instead of falling back to the bind pose.
 */
function buildClip(action: HumanoidActionClip, map: SkeletonMap, pose: ReadonlyMap<string, BaseNode>, base: THREE.AnimationClip | null): THREE.AnimationClip {
  const times = action.keys.map((key) => key.at);
  const tracks: THREE.KeyframeTrack[] = [];
  const owned = new Set<string>();
  const delta = new THREE.Quaternion();
  const local = new THREE.Quaternion();
  const inverse = new THREE.Quaternion();
  for (const slot of HUMANOID_ACTION_SLOTS) {
    const bone = map.slots[slot];
    const node = bone === undefined ? undefined : pose.get(bone);
    if (node === undefined) continue;
    inverse.copy(node.rotation).invert();
    const values: number[] = [];
    for (const key of action.keys) {
      rotationAt(key, slot, delta);
      local.copy(node.quaternion).multiply(inverse.clone().multiply(delta).multiply(node.rotation));
      values.push(local.x, local.y, local.z, local.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${node.node.name}.quaternion`, times, values));
    owned.add(`${node.node.name}.quaternion`);
  }
  const hipsName = map.slots.hips;
  const hips = hipsName === undefined ? undefined : pose.get(hipsName);
  if (hips !== undefined && action.keys.some((key) => key.hips !== undefined)) {
    const parent = hips.node.parent === null ? undefined : pose.get(hips.node.parent.name);
    const toLocal = new THREE.Matrix3().setFromMatrix4(parent === undefined ? new THREE.Matrix4() : parent.world.clone().invert());
    const values: number[] = [];
    const offset = new THREE.Vector3();
    for (const key of action.keys) {
      const [x, y, z] = key.hips ?? [0, 0, 0];
      offset.set(x, y, z).applyMatrix3(toLocal).add(hips.position);
      values.push(offset.x, offset.y, offset.z);
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${hips.node.name}.position`, times, values));
    owned.add(`${hips.node.name}.position`);
  }
  for (const track of base?.tracks ?? []) {
    if (owned.has(track.name) || track.name.endsWith(".scale")) continue;
    const size = track.getValueSize();
    const first = Array.from(track.values.subarray(0, size));
    const TrackType = track.name.endsWith(".quaternion") ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
    tracks.push(new TrackType(track.name, [0, action.duration], [...first, ...first]));
  }
  return new THREE.AnimationClip(action.name, action.duration, tracks);
}

const cache = new WeakMap<readonly THREE.AnimationClip[], THREE.AnimationClip[]>();
const socketCache = new WeakMap<THREE.Object3D, readonly { bone: string; name: string; local: THREE.Matrix4 }[]>();

/** Standard slots that get a socket; each socket node takes its slot's name. */
export const HUMANOID_SOCKETS: readonly SkeletonSlot[] = ["hand.r", "hand.l"];

function rigBones(scene: THREE.Object3D): string[] {
  const bones: string[] = [];
  scene.traverse((node) => {
    if (node.name.length > 0) bones.push(node.name);
  });
  return bones;
}

function socketPlan(source: THREE.Object3D, clips: readonly THREE.AnimationClip[]): readonly { bone: string; name: string; local: THREE.Matrix4 }[] {
  const cached = socketCache.get(source);
  if (cached !== undefined) return cached;
  let plan: { bone: string; name: string; local: THREE.Matrix4 }[] = [];
  const map = detectHumanoidRig(rigBones(source));
  if (map !== null) {
    const pose = basePose(source, clips.find((clip) => classifyClip(clip.name) === "idle") ?? null);
    plan = HUMANOID_SOCKETS.flatMap((name) => {
      const bone = map.slots[name];
      const node = bone === undefined ? undefined : pose.get(bone);
      if (node === undefined) return [];
      const scale = new THREE.Vector3();
      node.world.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      const s = 1 / ((scale.x + scale.y + scale.z) / 3);
      return [{ bone: node.node.name, name, local: new THREE.Matrix4().compose(new THREE.Vector3(), node.rotation.clone().invert(), new THREE.Vector3(s, s, s)) }];
    });
  }
  socketCache.set(source, plan);
  return plan;
}

/**
 * Adds a socket node under each hand of a humanoid rig instance, named `hand.r` and `hand.l` (no
 * loaded bone takes those names: the loader strips the dot). A socket sits at its joint in the character's own frame
 * as it stands in its idle pose (metres, +Y up, +Z forward), whatever the rig's bone axes and units,
 * so an attachment's offset and rotation mean the same on every humanoid rig. A rig the standard
 * cannot map gets none. `source` is the loaded scene `instance` was cloned from.
 *
 * @capability humanoid-sockets rig-independent hand sockets for held items
 */
export function addHumanoidSockets(instance: THREE.Object3D, source: THREE.Object3D, clips: readonly THREE.AnimationClip[]): void {
  for (const socket of socketPlan(source, clips)) {
    const bone = instance.getObjectByName(socket.bone);
    if (bone === undefined || bone.getObjectByName(socket.name) !== undefined) continue;
    const node = new THREE.Object3D();
    node.name = socket.name;
    socket.local.decompose(node.position, node.quaternion, node.scale);
    bone.add(node);
  }
}

interface CarryBone {
  bone: string;
  /** The bone's local rotation in the idle pose. */
  rest: THREE.Quaternion;
  /** The carry turn in the bone's own frame: W⁻¹ · D · W. */
  turn: THREE.Quaternion;
}

const carryCache = new WeakMap<THREE.Object3D, readonly CarryBone[]>();

function carryPlan(source: THREE.Object3D, clips: readonly THREE.AnimationClip[]): readonly CarryBone[] {
  const cached = carryCache.get(source);
  if (cached !== undefined) return cached;
  const map = detectHumanoidRig(rigBones(source));
  let plan: CarryBone[] = [];
  if (map !== null) {
    const pose = basePose(source, clips.find((clip) => classifyClip(clip.name) === "idle") ?? null);
    plan = HUMANOID_ACTION_SLOTS.flatMap((slot) => {
      const angles = HUMANOID_FIRST_PERSON_CARRY[slot];
      const bone = map.slots[slot];
      const node = bone === undefined ? undefined : pose.get(bone);
      if (angles === undefined || node === undefined) return [];
      const delta = new THREE.Quaternion().setFromEuler(new THREE.Euler(angles[0] * DEG, angles[1] * DEG, angles[2] * DEG, "XYZ"));
      const turn = node.rotation.clone().invert().multiply(delta).multiply(node.rotation);
      return [{ bone: node.node.name, rest: node.quaternion.clone(), turn }];
    });
  }
  carryCache.set(source, plan);
  return plan;
}

/** Arm swing past which an action owns the arms and the carry fades out, in radians. */
const CARRY_FADE = 0.7;

/**
 * Raises a first-person body's arms into view, on top of whatever the animation posed this frame:
 * the returned function turns each arm by {@link HUMANOID_FIRST_PERSON_CARRY}, fading out while an
 * action swings the arms far from their idle pose, so a punch or a tool swing plays as authored.
 * Call it after the animation writes the pose; a frame the animation skipped is left alone. `null`
 * when the rig is not a mapped humanoid.
 *
 * @capability first-person-arms keep a first-person body's hands and held items in view
 */
export function firstPersonArms(instance: THREE.Object3D, source: THREE.Object3D, clips: readonly THREE.AnimationClip[]): (() => void) | null {
  const bones = carryPlan(source, clips).flatMap((plan) => {
    const node = instance.getObjectByName(plan.bone);
    return node === undefined ? [] : [{ ...plan, node, written: new THREE.Quaternion(0, 0, 0, 0) }];
  });
  if (bones.length === 0) return null;
  const turned = new THREE.Quaternion();
  return () => {
    let swing = 0;
    for (const bone of bones) if (!bone.node.quaternion.equals(bone.written)) swing = Math.max(swing, bone.node.quaternion.angleTo(bone.rest));
    const weight = Math.max(0, 1 - swing / CARRY_FADE);
    for (const bone of bones) {
      if (bone.node.quaternion.equals(bone.written)) continue;
      turned.copy(bone.node.quaternion).multiply(bone.turn);
      bone.node.quaternion.slerp(turned, weight);
      bone.written.copy(bone.node.quaternion);
    }
  };
}

/**
 * The authored humanoid actions as this rig's own clips, posed from its idle clip, or `[]` when the
 * skeleton standard cannot map the rig as a full humanoid body. A clip the rig already ships under
 * the same name is left out, so its own take wins.
 *
 * @capability humanoid-actions build the authored humanoid action clips on a loaded rig
 */
export function buildHumanoidActionClips(
  scene: THREE.Object3D,
  clips: readonly THREE.AnimationClip[],
  names: readonly HumanoidActionName[] = HUMANOID_ACTION_NAMES,
): THREE.AnimationClip[] {
  const map = detectHumanoidRig(rigBones(scene));
  if (map === null) return [];
  const base = clips.find((clip) => classifyClip(clip.name) === "idle") ?? null;
  const pose = basePose(scene, base);
  const have = new Set(clips.map((clip) => clip.name));
  return names.filter((name) => !have.has(name)).map((name) => buildClip(HUMANOID_ACTIONS[name], map, pose, base));
}

/**
 * A rig's clips plus the authored humanoid actions it lacks, built once per loaded model and shared
 * by every instance of it. The source scene only supplies bone names and base transforms.
 */
export function withHumanoidActionClips(scene: THREE.Object3D, clips: readonly THREE.AnimationClip[]): THREE.AnimationClip[] {
  const hit = cache.get(clips);
  if (hit !== undefined) return hit;
  const all = [...clips, ...buildHumanoidActionClips(scene, clips)];
  cache.set(clips, all);
  return all;
}
