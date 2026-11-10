import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import { ragdollBoneOrientations, ragdollConfigFromPoses, type RagdollPose } from "@jgengine/core/anim/ragdollRig";
import type { SkeletonMap, SkeletonSlot } from "@jgengine/core/anim/skeletonStandard";
import { createRagdoll, type Ragdoll } from "@jgengine/core/physics/ragdoll";
import type { PhysicsWorld } from "@jgengine/core/physics/physicsWorld";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { resolveRigNode } from "@jgengine/core/model/rigNode.draw";

/** What {@link useRagdoll} needs: the rig's bone names, the physics world and what arms it. */
export interface RagdollOptions {
  /** The rig's bone names by standard slot, from `mapRigToStandard` on the loaded scene's bones. */
  map: SkeletonMap;
  /**
   * The physics world the bodies live in. It is stepped by this draw, so give the ragdoll its own
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
 * @internal
 */
export function ragdollDraw(scene: THREE.Object3D, getOptions: () => RagdollOptions): EngineDraw {
  let ragdoll: Ragdoll | null = null;
  let ragdollWorld: PhysicsWorld | null = null;
  let poses: readonly RagdollPose[] = [];
  let bones: Partial<Record<SkeletonSlot, THREE.Object3D>> = {};
  let bonesMap: SkeletonMap | null = null;
  let armedFor: { map: SkeletonMap; world: PhysicsWorld; height: number } | null = null;
  const worldPosition = new THREE.Vector3();
  const worldQuaternion = new THREE.Quaternion();
  const parentQuaternion = new THREE.Quaternion();

  const resolveBones = (map: SkeletonMap) => {
    if (bonesMap === map) return;
    bonesMap = map;
    const next: Partial<Record<SkeletonSlot, THREE.Object3D>> = {};
    for (const slot of Object.keys(map.slots) as SkeletonSlot[]) {
      const name = map.slots[slot];
      if (name === undefined) continue;
      const node = resolveRigNode(scene, name).node;
      if (node !== undefined) next[slot] = node;
    }
    bones = next;
  };

  const drop = () => {
    if (ragdoll !== null) {
      ragdoll.remove();
      for (const id of Object.values(ragdoll.bones)) ragdollWorld?.removeBody(id);
      ragdoll = null;
      ragdollWorld = null;
      poses = [];
    }
    armedFor = null;
  };

  const arm = (options: RagdollOptions, height: number) => {
    scene.updateMatrixWorld(true);
    const positions: RagdollPose[] = [];
    for (const slot of Object.keys(bones) as SkeletonSlot[]) {
      const bone = bones[slot];
      if (bone === undefined) continue;
      bone.getWorldPosition(worldPosition);
      bone.getWorldQuaternion(worldQuaternion);
      positions.push({
        slot,
        position: [worldPosition.x, worldPosition.y, worldPosition.z],
        orientation: [worldQuaternion.x, worldQuaternion.y, worldQuaternion.z, worldQuaternion.w],
      });
    }
    if (positions.length >= 2) {
      poses = positions;
      ragdoll = createRagdoll(options.world, ragdollConfigFromPoses(options.map, positions, { scale: height / REFERENCE_HEIGHT }));
      ragdollWorld = options.world;
    }
  };

  const sync = (_state: EngineFrameState) => {
    const options = getOptions();
    resolveBones(options.map);
    const height = options.height ?? REFERENCE_HEIGHT;
    const armedChanged = armedFor !== null && (armedFor.map !== options.map || armedFor.world !== options.world || armedFor.height !== height);
    if (options.active) {
      if (ragdoll === null || armedChanged) {
        drop();
        armedFor = { map: options.map, world: options.world, height };
        arm(options, height);
      }
    } else {
      drop();
    }
  };

  return {
    mount: sync,
    update: sync,
    frame(state: EngineFrameState) {
      sync(state);
      const active = ragdoll;
      const world = ragdollWorld;
      if (active === null || world === null || state.delta <= 0) return;
      world.step(state.delta);
      const positions: Partial<Record<SkeletonSlot, readonly [number, number, number]>> = {};
      for (const [slot, id] of Object.entries(active.bones) as [SkeletonSlot, number][]) {
        positions[slot] = [world.posX[id]!, world.posY[id]!, world.posZ[id]!];
      }
      const orientations = ragdollBoneOrientations(poses, positions);
      for (const [slot, id] of Object.entries(active.bones) as [SkeletonSlot, number][]) {
        const bone = bones[slot];
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
    },
    dispose() {
      drop();
      bones = {};
      bonesMap = null;
    },
  };
}

/**
 * @capability animation turn a killed rigged character into a physics ragdoll on death
 */
export function useRagdoll(scene: THREE.Object3D, options: RagdollOptions): void {
  const latest = useRef(options);
  latest.current = options;
  useEngineDraw(() => ragdollDraw(scene, () => latest.current), [scene]);
}
