import { useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { GameContext } from "@jgengine/core/runtime/gameContextTypes";
import { noteCharacterMotion } from "@jgengine/core/lod/characterLod";
import { useFrameWhile } from "@jgengine/core/render/useFrameWhile.draw";

/**
 * Tuning for the default head turn a rigged character makes toward the local player. Angles are
 * radians, distances metres.
 */
export interface GlanceTuning {
  /** Starts looking inside this distance. */
  reach: number;
  /** Stops looking beyond this distance, so a player standing at the edge does not flicker it. */
  release: number;
  maxYaw: number;
  maxPitch: number;
  /** A target further round than this (behind the character) is ignored instead of clamped. */
  ignoreYaw: number;
  /** Share of the turn the neck takes when the rig has one. */
  neckShare: number;
  /** How fast the aim follows the target, per second. */
  followRate: number;
  /** How fast the turn fades in and out, per second. */
  fadeRate: number;
}

/** Default glance: starts at 7 m, lets go at 8.5 m, head turns up to 65° sideways and 30° up or down. */
export const DEFAULT_GLANCE: GlanceTuning = {
  reach: 7,
  release: 8.5,
  maxYaw: (65 * Math.PI) / 180,
  maxPitch: (30 * Math.PI) / 180,
  ignoreYaw: (120 * Math.PI) / 180,
  neckShare: 0.35,
  followRate: 6,
  fadeRate: 3,
};

/** Head and neck bones the glance turns, found by name on the loaded rig. */
export interface GlanceRig {
  head: THREE.Object3D;
  neck: THREE.Object3D | null;
  written: Map<THREE.Object3D, { animated: THREE.Quaternion; written: THREE.Quaternion }>;
}

/** Carried between frames: the smoothed aim and the faded weight. */
export interface GlanceState {
  yaw: number;
  pitch: number;
  weight: number;
  engaged: boolean;
}

/** A fresh glance state: looking straight ahead with no turn applied. */
export function createGlanceState(): GlanceState {
  return { yaw: 0, pitch: 0, weight: 0, engaged: false };
}

function boneKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Finds the head (and neck) of a humanoid or animal rig by bone name: KayKit `head`, Mixamo
 * `mixamorigHead`, Rocketbox `Bip01 Head`, Quaternius `Head`. End markers (`HeadTop_End`) are
 * skipped. Returns `null` when no head bone exists.
 */
export function findGlanceRig(scene: THREE.Object3D): GlanceRig | null {
  let head: THREE.Object3D | null = null;
  let neck: THREE.Object3D | null = null;
  scene.traverse((object) => {
    if ((object as THREE.Bone).isBone !== true) return;
    const key = boneKey(object.name);
    if (head === null && key.endsWith("head") && !key.includes("end") && !key.includes("top")) head = object;
    if (neck === null && /neck\d?$/.test(key)) neck = object;
  });
  if (head === null) return null;
  const found = head as THREE.Object3D;
  const parentNeck = neck !== null && isAncestor(neck, found) ? (neck as THREE.Object3D) : null;
  const written = new Map<THREE.Object3D, { animated: THREE.Quaternion; written: THREE.Quaternion }>();
  for (const bone of parentNeck === null ? [found] : [parentNeck, found]) {
    written.set(bone, { animated: bone.quaternion.clone(), written: bone.quaternion.clone() });
  }
  return { head: found, neck: parentNeck, written };
}

function isAncestor(ancestor: THREE.Object3D, child: THREE.Object3D): boolean {
  for (let parent = child.parent; parent !== null; parent = parent.parent) {
    if (parent === ancestor) return true;
  }
  return false;
}

const UP = new THREE.Vector3(0, 1, 0);
const scratch = {
  head: new THREE.Vector3(),
  dir: new THREE.Vector3(),
  axis: new THREE.Vector3(),
  forward: new THREE.Vector3(),
  yawQ: new THREE.Quaternion(),
  pitchQ: new THREE.Quaternion(),
  delta: new THREE.Quaternion(),
  world: new THREE.Quaternion(),
  headWorld: new THREE.Quaternion(),
  parent: new THREE.Quaternion(),
};

function wrap(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function worldTurn(yaw: number, pitch: number, out: THREE.Quaternion): THREE.Quaternion {
  scratch.yawQ.setFromAxisAngle(UP, yaw);
  scratch.axis.copy(scratch.forward).applyQuaternion(scratch.yawQ).cross(UP).normalize();
  scratch.pitchQ.setFromAxisAngle(scratch.axis, pitch);
  return out.copy(scratch.pitchQ).multiply(scratch.yawQ);
}

function writeWorld(bone: THREE.Object3D, world: THREE.Quaternion): void {
  if (bone.parent === null) bone.quaternion.copy(world);
  else bone.quaternion.copy(bone.parent.getWorldQuaternion(scratch.parent).invert().multiply(world));
  bone.updateMatrixWorld(true);
}

/**
 * One frame of the glance, after the animation mixer and foot IK. The turn is added on top of the
 * animated pose relative to the character's own heading (`facingYaw`, engine convention: forward
 * is `(sin yaw, cos yaw)`), so it does not depend on which axis a rig's head bone points along.
 * `target` is a world point or `null` for nothing to look at; the turn fades out either way.
 * Exported for tests.
 */
export function applyGlance(
  rig: GlanceRig,
  facingYaw: number,
  target: THREE.Vector3 | null,
  state: GlanceState,
  delta: number,
  tuning: GlanceTuning = DEFAULT_GLANCE,
): void {
  for (const [bone, record] of rig.written) {
    if (bone.quaternion.equals(record.written)) bone.quaternion.copy(record.animated);
    record.animated.copy(bone.quaternion);
  }
  const root = rig.neck ?? rig.head;
  root.updateWorldMatrix(true, true);
  const head = rig.head.getWorldPosition(scratch.head);
  scratch.forward.set(Math.sin(facingYaw), 0, Math.cos(facingYaw));

  let wantYaw = 0;
  let wantPitch = 0;
  let wanted = false;
  if (target !== null) {
    const dir = scratch.dir.subVectors(target, head);
    const flat = Math.hypot(dir.x, dir.z);
    const distance = Math.hypot(flat, dir.y);
    const yaw = wrap(Math.atan2(dir.x, dir.z) - facingYaw);
    const limit = state.engaged ? tuning.release : tuning.reach;
    if (distance > 0.05 && distance <= limit && Math.abs(yaw) <= tuning.ignoreYaw) {
      wanted = true;
      wantYaw = Math.max(-tuning.maxYaw, Math.min(tuning.maxYaw, yaw));
      wantPitch = Math.max(-tuning.maxPitch, Math.min(tuning.maxPitch, Math.atan2(dir.y, flat)));
    }
  }
  state.engaged = wanted;
  const follow = 1 - Math.exp(-tuning.followRate * delta);
  if (wanted) {
    state.yaw += (wantYaw - state.yaw) * follow;
    state.pitch += (wantPitch - state.pitch) * follow;
  }
  state.weight = Math.max(0, Math.min(1, state.weight + (wanted ? 1 : -1) * tuning.fadeRate * delta));
  const weight = state.weight * state.weight * (3 - 2 * state.weight);

  if (weight > 1e-3) {
    const headWorld = rig.head.getWorldQuaternion(scratch.headWorld);
    if (rig.neck !== null) {
      const share = tuning.neckShare * weight;
      const neckWorld = rig.neck.getWorldQuaternion(scratch.world);
      writeWorld(rig.neck, worldTurn(state.yaw * share, state.pitch * share, scratch.delta).multiply(neckWorld));
    }
    writeWorld(rig.head, worldTurn(state.yaw * weight, state.pitch * weight, scratch.delta).multiply(headWorld));
  }
  for (const [bone, record] of rig.written) record.written.copy(bone.quaternion);
}

const scratchTarget = new THREE.Vector3();
const scratchOrigin = new THREE.Vector3();
const scratchCamera = new THREE.Vector3();

/**
 * Default glance for a rigged character: its head turns toward the local player when they come
 * close, from any angle in front of it, and turns back when they leave. The local player's own
 * model never glances. `maxCameraDistance` skips the work for characters too far away to read.
 */
export function useCharacterGlance(
  scene: THREE.Object3D,
  enabled: boolean,
  ctx: GameContext | null,
  instanceId: string | undefined,
  maxCameraDistance: number,
): void {
  const camera = useThree((three) => three.camera);
  const rig = useMemo(() => (enabled ? findGlanceRig(scene) : null), [scene, enabled]);
  const state = useRef<GlanceState>(createGlanceState());
  useLayoutEffect(() => {
    state.current = createGlanceState();
    return () => {
      if (rig === null) return;
      if (instanceId !== undefined) noteCharacterMotion(instanceId, "glance", false);
      for (const [bone, record] of rig.written) if (bone.quaternion.equals(record.written)) bone.quaternion.copy(record.animated);
    };
  }, [rig, instanceId]);
  useFrameWhile(rig !== null && ctx !== null && instanceId !== undefined, (_three, delta) => {
    if (rig === null || ctx === null || instanceId === undefined || instanceId === ctx.player.userId) return;
    const self = ctx.scene.entity.get(instanceId);
    if (self === null || self === undefined) return;
    const origin = scene.getWorldPosition(scratchOrigin);
    const cameraAt = camera.getWorldPosition(scratchCamera);
    if (cameraAt.distanceTo(origin) > maxCameraDistance && state.current.weight === 0) return;
    const player = ctx.scene.entity.get(ctx.player.userId);
    let target: THREE.Vector3 | null;
    if (player === null || player === undefined) target = cameraAt;
    else {
      rig.head.getWorldPosition(scratchTarget);
      const eye = scratchTarget.y - origin.y;
      target = scratchTarget.set(player.position[0], player.position[1] + eye, player.position[2]);
    }
    applyGlance(rig, self.rotationY ?? 0, target, state.current, Math.min(delta, 0.1));
    noteCharacterMotion(instanceId, "glance", state.current.weight > 0);
  });
}
