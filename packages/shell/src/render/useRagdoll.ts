import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

import { ragdollBoneOrientations, ragdollConfigFromPoses, type RagdollPose } from "@jgengine/core/anim/ragdollRig";
import type { SkeletonMap, SkeletonSlot } from "@jgengine/core/anim/skeletonStandard";
import { createRagdoll, type Ragdoll } from "@jgengine/core/physics/ragdoll";
import type { PhysicsWorld } from "@jgengine/core/physics/physicsWorld";
import { resolveRigNode } from "./rigNode";

/** What {@link useRagdoll} needs: the rig's bone names, the physics world and what arms it. */
export interface RagdollOptions {
  /** The rig's bone names by standard slot, from `mapRigToStandard` on the loaded scene's bones. */
  map: SkeletonMap;
  /**
   * The physics world the bodies live in. It is stepped by this hook, so give the ragdoll its own
   * world (a private one per dead character) rather than a world shared with live physics. Its
   * bounds' lower Y is the floor the body lands on.
   */
  world: PhysicsWorld;
  /** Arm the ragdoll. On the false → true edge the rig's current world poses become the bodies. */
  active: boolean;
  /** Character height in metres, so body shapes scale. Default 1.8. */
  height?: number;
}

const REFERENCE_HEIGHT = 1.8;

/**
 * Turns a rigged character into a physics ragdoll when `active` goes true: the bones' world poses at
 * that moment become box bodies joined by distance links in `world`, and every frame after, each
 * bone's world position and aim come from its body. The physics bodies carry translation only, so
 * each bone is oriented by rotating its death-pose direction-to-child onto the current one, which is
 * what gives the body a skeleton instead of a pile of boxes.
 *
 * While the ragdoll is active it owns the mapped bones, so stop the model's IK for the same
 * character (`ModelConfig.ik` unset) or the two write the same joints. Deactivating removes the
 * bodies and leaves the rig where the ragdoll put it.
 *
 * @capability animation turn a killed rigged character into a physics ragdoll on death
 */
export function useRagdoll(scene: THREE.Object3D, options: RagdollOptions): void {
  const { map, world, active, height = REFERENCE_HEIGHT } = options;
  const ragdollRef = useRef<Ragdoll | null>(null);
  const posesRef = useRef<readonly RagdollPose[]>([]);
  const bonesRef = useRef<Partial<Record<SkeletonSlot, THREE.Object3D>>>({});

  useEffect(() => {
    const bones: Partial<Record<SkeletonSlot, THREE.Object3D>> = {};
    for (const slot of Object.keys(map.slots) as SkeletonSlot[]) {
      const name = map.slots[slot];
      if (name === undefined) continue;
      const node = resolveRigNode(scene, name).node;
      if (node !== undefined) bones[slot] = node;
    }
    bonesRef.current = bones;
    return () => {
      bonesRef.current = {};
    };
  }, [scene, map]);

  useEffect(() => {
    if (!active) return;
    scene.updateMatrixWorld(true);
    const positions: RagdollPose[] = [];
    const worldPosition = new THREE.Vector3();
    const worldQuaternion = new THREE.Quaternion();
    for (const slot of Object.keys(bonesRef.current) as SkeletonSlot[]) {
      const bone = bonesRef.current[slot];
      if (bone === undefined) continue;
      bone.getWorldPosition(worldPosition);
      bone.getWorldQuaternion(worldQuaternion);
      positions.push({
        slot,
        position: [worldPosition.x, worldPosition.y, worldPosition.z],
        orientation: [worldQuaternion.x, worldQuaternion.y, worldQuaternion.z, worldQuaternion.w],
      });
    }
    if (positions.length < 2) return;
    posesRef.current = positions;
    ragdollRef.current = createRagdoll(world, ragdollConfigFromPoses(map, positions, { scale: height / REFERENCE_HEIGHT }));
    return () => {
      ragdollRef.current?.remove();
      for (const id of Object.values(ragdollRef.current?.bones ?? {})) world.removeBody(id);
      ragdollRef.current = null;
      posesRef.current = [];
    };
  }, [active, scene, map, world, height]);

  useFrame((_state, delta) => {
    const ragdoll = ragdollRef.current;
    if (ragdoll === null || delta <= 0) return;
    world.step(delta);
    const positions: Partial<Record<SkeletonSlot, readonly [number, number, number]>> = {};
    for (const [slot, id] of Object.entries(ragdoll.bones) as [SkeletonSlot, number][]) {
      positions[slot] = [world.posX[id]!, world.posY[id]!, world.posZ[id]!];
    }
    const orientations = ragdollBoneOrientations(posesRef.current, positions);
    const worldPosition = new THREE.Vector3();
    const worldQuaternion = new THREE.Quaternion();
    const parentQuaternion = new THREE.Quaternion();
    for (const [slot, id] of Object.entries(ragdoll.bones) as [SkeletonSlot, number][]) {
      const bone = bonesRef.current[slot];
      const orientation = orientations[slot];
      if (bone === undefined || orientation === undefined) continue;
      worldPosition.set(world.posX[id]!, world.posY[id]!, world.posZ[id]!);
      worldQuaternion.set(orientation[0], orientation[1], orientation[2], orientation[3]);
      const parent = bone.parent;
      if (parent === null) {
        bone.position.copy(worldPosition);
        bone.quaternion.copy(worldQuaternion);
      } else {
        parent.updateWorldMatrix(true, false);
        bone.position.copy(parent.worldToLocal(worldPosition));
        bone.quaternion.copy(parent.getWorldQuaternion(parentQuaternion).invert().multiply(worldQuaternion));
      }
      bone.updateMatrixWorld(true);
    }
  });
}
