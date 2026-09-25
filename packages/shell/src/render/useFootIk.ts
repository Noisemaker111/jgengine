import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { inferLegChains, placeFeet, type FootGroundSample, type FootPlacement } from "@jgengine/core/anim/footPlacement";
import { lookAt, solveTwoBone, type MutableVec3 } from "@jgengine/core/anim/ikSolver";
import type { GameContext } from "@jgengine/core/runtime/gameContextTypes";
import type { ModelConfig, ModelIkConfig } from "@jgengine/core/game/playableGame";
import type { SceneRaycastHit, SceneRaycastInput } from "@jgengine/core/scene/sceneRaycast";

type FootIkConfig = NonNullable<ModelConfig["ik"]>;
type GroundProbe = (input: SceneRaycastInput) => SceneRaycastHit | null;

interface IkLeg {
  root: THREE.Object3D;
  mid: THREE.Object3D;
  tip: THREE.Object3D;
  /** Rest-pose ankle height above the sole divided by rest leg length, so it survives any scale. */
  ankleRatio: number;
}

interface PoseRecord {
  bone: THREE.Object3D;
  animated: { q: THREE.Quaternion; p: THREE.Vector3 };
  written: { q: THREE.Quaternion; p: THREE.Vector3 };
}

/** Bones resolved once per loaded scene for {@link applyFootIk}. */
export interface FootIkRig {
  legs: IkLeg[];
  pelvis: THREE.Object3D | null;
  head: THREE.Object3D | null;
  maxAdjust: number;
  alignToGround: number;
  /** Pose before and after last frame's correction, so a bone no clip animates never accumulates it. */
  poses: PoseRecord[];
}

/** Per-model state carried between frames: the faded weight and the smoothed pelvis drop. */
export interface FootIkState {
  weight: number;
  pelvis: number;
}

const DEFAULT_MAX_ADJUST = 0.4;
const UP = new THREE.Vector3(0, 1, 0);
const scratch = {
  root: new THREE.Vector3(),
  mid: new THREE.Vector3(),
  tip: new THREE.Vector3(),
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
  q: new THREE.Quaternion(),
  q2: new THREE.Quaternion(),
  parent: new THREE.Quaternion(),
  m: new THREE.Matrix4(),
};
const solved = { mid: [0, 0, 0] as MutableVec3, tip: [0, 0, 0] as MutableVec3 };

function bindPosition(skeleton: THREE.Skeleton, bone: THREE.Bone, out: THREE.Vector3): THREE.Vector3 | null {
  const index = skeleton.bones.indexOf(bone);
  if (index < 0) return null;
  return out.setFromMatrixPosition(scratch.m.copy(skeleton.boneInverses[index]!).invert());
}

function restAnkleRatio(scene: THREE.Object3D, leg: Omit<IkLeg, "ankleRatio">): number {
  let soleY = Infinity;
  let ratio = 0;
  const root = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const tip = new THREE.Vector3();
  scene.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh !== true || !(leg.tip instanceof THREE.Bone) || !(leg.mid instanceof THREE.Bone) || !(leg.root instanceof THREE.Bone)) return;
    if (bindPosition(mesh.skeleton, leg.tip, tip) === null || bindPosition(mesh.skeleton, leg.mid, mid) === null || bindPosition(mesh.skeleton, leg.root, root) === null) return;
    if (mesh.geometry.boundingBox === null) mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.bindMatrix);
    soleY = Math.min(soleY, box.min.y);
    const length = root.distanceTo(mid) + mid.distanceTo(tip);
    if (length > 1e-6) ratio = Math.max(0, tip.y - soleY) / length;
  });
  return ratio;
}

/**
 * Resolves foot-IK bones on a loaded rig: explicit chains, or legs found by bone name for `"auto"`
 * and configs without `feet`. Returns `null` when no leg resolves.
 */
export function resolveFootIkRig(scene: THREE.Object3D, config: FootIkConfig): FootIkRig | null {
  const options: ModelIkConfig = config === "auto" ? {} : config;
  let chains = options.feet;
  if (chains === undefined) {
    const bones: { name: string; parent: string | null }[] = [];
    scene.traverse((object) => {
      if ((object as THREE.Bone).isBone === true) bones.push({ name: object.name, parent: (object.parent as THREE.Bone | null)?.isBone === true ? object.parent!.name : null });
    });
    chains = inferLegChains(bones);
  }
  const legs: IkLeg[] = [];
  for (const chain of chains) {
    const root = scene.getObjectByName(chain.root);
    const mid = scene.getObjectByName(chain.mid);
    const tip = scene.getObjectByName(chain.tip);
    if (root === undefined || mid === undefined || tip === undefined) continue;
    legs.push({ root, mid, tip, ankleRatio: restAnkleRatio(scene, { root, mid, tip }) });
  }
  const head = options.lookAt === undefined ? null : (scene.getObjectByName(options.lookAt.bone) ?? null);
  if (legs.length === 0 && head === null) return null;
  const found = options.pelvis !== undefined ? (scene.getObjectByName(options.pelvis) ?? null) : (legs[0]?.root.parent ?? null);
  const pelvis = found === scene ? null : found;
  const bones = new Set<THREE.Object3D>(legs.flatMap((leg) => [leg.root, leg.mid, leg.tip]));
  if (pelvis !== null) bones.add(pelvis);
  if (head !== null) bones.add(head);
  return {
    legs,
    pelvis,
    head,
    maxAdjust: options.maxAdjust ?? DEFAULT_MAX_ADJUST,
    alignToGround: Math.max(0, Math.min(1, options.alignToGround ?? 1)),
    poses: [...bones].map((bone) => ({
      bone,
      animated: { q: bone.quaternion.clone(), p: bone.position.clone() },
      written: { q: bone.quaternion.clone(), p: bone.position.clone() },
    })),
  };
}

function writeWorldQuaternion(bone: THREE.Object3D, world: THREE.Quaternion): void {
  if (bone.parent === null) bone.quaternion.copy(world);
  else bone.quaternion.copy(bone.parent.getWorldQuaternion(scratch.parent).invert().multiply(world));
  bone.updateMatrixWorld(true);
}

function aimSegment(bone: THREE.Object3D, from: THREE.Vector3, currentTo: THREE.Vector3, solvedTo: readonly number[]): void {
  const current = scratch.a.copy(currentTo).sub(from);
  const desired = scratch.b.set(solvedTo[0]! - from.x, solvedTo[1]! - from.y, solvedTo[2]! - from.z);
  if (current.lengthSq() < 1e-10 || desired.lengthSq() < 1e-10) return;
  const correction = scratch.q.setFromUnitVectors(current.normalize(), desired.normalize());
  writeWorldQuaternion(bone, correction.multiply(bone.getWorldQuaternion(scratch.q2)));
}

function legLength(leg: IkLeg): number {
  leg.root.getWorldPosition(scratch.root);
  leg.mid.getWorldPosition(scratch.mid);
  leg.tip.getWorldPosition(scratch.tip);
  return scratch.root.distanceTo(scratch.mid) + scratch.mid.distanceTo(scratch.tip);
}

/**
 * Applies one frame of foot IK after the animation mixer: probes the ground under each foot,
 * resolves targets with `placeFeet`, lowers the pelvis, solves each leg with `solveTwoBone` bending
 * toward the animated knee, and tilts planted feet to the ground. Returns whether the feet are
 * grounded; `state` carries the faded weight between frames. Exported for tests and custom hosts.
 */
export function applyFootIk(
  rig: FootIkRig,
  originY: number,
  probe: GroundProbe,
  state: FootIkState,
  delta: number,
  cameraTarget?: readonly [number, number, number],
): boolean {
  for (const record of rig.poses) {
    if (record.bone.quaternion.equals(record.written.q)) record.bone.quaternion.copy(record.animated.q);
    if (record.bone.position.equals(record.written.p)) record.bone.position.copy(record.animated.p);
    record.animated.q.copy(record.bone.quaternion);
    record.animated.p.copy(record.bone.position);
  }
  const samples: FootGroundSample[] = [];
  const normals: (readonly [number, number, number] | null)[] = [];
  let length = 0;
  let ankleHeight = 0;
  for (const leg of rig.legs) {
    leg.root.updateWorldMatrix(true, true);
    const legSize = legLength(leg);
    length = Math.max(length, legSize);
    ankleHeight = Math.max(ankleHeight, leg.ankleRatio * legSize);
    const from = Math.max(scratch.tip.y, originY) + legSize * 0.5;
    const hit = probe({ origin: [scratch.tip.x, from, scratch.tip.z], direction: [0, -1, 0], maxDistance: legSize * 2 });
    samples.push({ ankleY: scratch.tip.y, groundY: hit === null ? null : hit.point[1] });
    normals.push(hit === null ? null : hit.normal);
  }

  const placement: FootPlacement = placeFeet({ feet: samples, originY, ankleHeight, maxAdjust: rig.maxAdjust * length, airborneGap: length * 0.3 });
  const blend = Math.min(1, delta * (placement.grounded ? 12 : 6));
  state.weight += ((placement.grounded ? 1 : 0) - state.weight) * blend;
  state.pelvis += (placement.pelvisOffset - state.pelvis) * Math.min(1, delta * 15);
  const weight = state.weight;

  if (rig.pelvis !== null && weight > 1e-3 && Math.abs(state.pelvis) > 1e-6) {
    const world = rig.pelvis.getWorldPosition(scratch.a);
    world.y += state.pelvis * weight;
    rig.pelvis.position.copy(rig.pelvis.parent === null ? world : rig.pelvis.parent.worldToLocal(world));
    rig.pelvis.updateMatrixWorld(true);
  }

  for (let i = 0; i < rig.legs.length && weight > 1e-3; i += 1) {
    const target = placement.ankleTargets[i];
    if (target === null || target === undefined) continue;
    const leg = rig.legs[i]!;
    const root = leg.root.getWorldPosition(scratch.root);
    const mid = leg.mid.getWorldPosition(scratch.mid);
    const tip = leg.tip.getWorldPosition(scratch.tip);
    const bend = scratch.a.copy(root).add(tip).multiplyScalar(0.5);
    bend.subVectors(mid, bend);
    if (bend.lengthSq() < 1e-8) bend.set(0, 0, 1).applyQuaternion(leg.root.parent?.getWorldQuaternion(scratch.q) ?? scratch.q.identity());
    const pole = bend.normalize().multiplyScalar(length).add(mid);
    const targetY = tip.y + (target - tip.y) * weight;
    solveTwoBone({ root: [root.x, root.y, root.z], mid: [mid.x, mid.y, mid.z], tip: [tip.x, tip.y, tip.z], target: [tip.x, targetY, tip.z], pole: [pole.x, pole.y, pole.z] }, solved);
    aimSegment(leg.root, root, mid, solved.mid);
    // Rotating the thigh also moved the tip; aim the shin from that updated pose.
    aimSegment(leg.mid, leg.mid.getWorldPosition(scratch.mid), leg.tip.getWorldPosition(scratch.tip), solved.tip);

    const normal = normals[i];
    if (normal !== null && normal !== undefined && rig.alignToGround > 0) {
      const planted = 1 - Math.min(1, Math.max(0, samples[i]!.ankleY - ankleHeight - samples[i]!.groundY!) / Math.max(ankleHeight, length * 0.05));
      const tilt = scratch.q.setFromUnitVectors(UP, scratch.b.set(normal[0], normal[1], normal[2]).normalize());
      const current = leg.tip.getWorldQuaternion(scratch.q2);
      writeWorldQuaternion(leg.tip, current.slerp(tilt.multiply(current), planted * weight * rig.alignToGround));
    }
  }

  if (rig.head !== null && cameraTarget !== undefined) {
    const from = rig.head.getWorldPosition(scratch.a);
    const q = lookAt({ from: [from.x, from.y, from.z], target: cameraTarget, up: [0, 1, 0] });
    const current = rig.head.getWorldQuaternion(scratch.q2);
    writeWorldQuaternion(rig.head, current.slerp(scratch.q.set(q[0], q[1], q[2], q[3]), Math.max(weight, rig.legs.length === 0 ? 1 : 0)));
  }
  for (const record of rig.poses) {
    record.written.q.copy(record.bone.quaternion);
    record.written.p.copy(record.bone.position);
  }
  return placement.grounded;
}

/**
 * Runs foot IK after the model's animation mixer for `ModelConfig.ik`. Ground probes hit terrain and
 * blocking physical objects, never the model's own entity. `groundOffset` is the model-space height
 * its soles rest on (`ModelConfig.y`).
 */
export function useFootIk(
  scene: THREE.Object3D,
  config: FootIkConfig | undefined,
  ctx: GameContext | null,
  instanceId?: string,
  groundOffset = 0,
): void {
  const camera = useThree((three) => three.camera);
  const rig = useMemo(() => (config === undefined ? null : resolveFootIkRig(scene, config)), [scene, config]);
  const state = useRef<FootIkState>({ weight: 0, pelvis: 0 });
  useFrame((_three, delta) => {
    if (rig === null || ctx === null || instanceId === undefined) return;
    const parent = scene.parent;
    const originY = parent === null ? scene.position.y : parent.localToWorld(scratch.a.set(0, groundOffset, 0)).y;
    const exclude = [instanceId];
    applyFootIk(
      rig,
      originY,
      (input) =>
        ctx.scene.raycast({
          ...input,
          excludeInstanceIds: exclude,
          filter: { entities: false, objects: true, walls: false, terrain: true },
          accept: (hit) => hit.blocks && hit.purpose === "physical",
        }),
      state.current,
      delta,
      rig.head === null ? undefined : camera.getWorldPosition(scratch.b).toArray(),
    );
  });
}
