import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";

/** Writes where an entity's shots visibly leave from, in world space; false when it has none right now. */
export type EntityMuzzleReader = (target: THREE.Vector3) => boolean;

const readers = new Map<string, EntityMuzzleReader>();

/**
 * Register where shots fired by `instanceId` visibly leave from (a gun hand, a turret barrel, a staff
 * tip). Tracers and muzzle effects start there instead of at the shot's rule origin; the rule origin
 * still decides what is hit. Returns the cleanup.
 *
 * @capability entity-muzzle draw a character's or turret's shots leaving from its hand or barrel
 */
export function registerEntityMuzzle(instanceId: string, reader: EntityMuzzleReader): () => void {
  readers.set(instanceId, reader);
  return () => {
    if (readers.get(instanceId) === reader) readers.delete(instanceId);
  };
}

/** The visible muzzle of `instanceId` into `target`; false leaves `target` unchanged. */
export function readEntityMuzzle(instanceId: string, target: THREE.Vector3): boolean {
  const reader = readers.get(instanceId);
  return reader === undefined ? false : reader(target);
}

function boneKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const RIGHT_HAND = /^(?:mixamorig)?righthand$|^handr$|^handslotr$|^rhand$|^bip0?1rhand$|^handright$|^wristr$/;
const LEFT_HAND = /^(?:mixamorig)?lefthand$|^handl$|^handslotl$|^lhand$|^bip0?1lhand$|^handleft$|^wristl$/;

/**
 * The bone a rigged character's shots leave from: a `muzzle` node when the model has one, else its
 * right hand (KayKit `handslot.r`, Mixamo `RightHand`, Rocketbox `Bip01 R Hand`, Quaternius `Hand.R`),
 * else its left. Exported for tests.
 */
export function findMuzzleBone(scene: THREE.Object3D): THREE.Object3D | null {
  let muzzle: THREE.Object3D | null = null;
  let right: THREE.Object3D | null = null;
  let left: THREE.Object3D | null = null;
  scene.traverse((object) => {
    const key = boneKey(object.name);
    if (muzzle === null && key.includes("muzzle")) muzzle = object;
    if (right === null && RIGHT_HAND.test(key)) right = object;
    if (left === null && LEFT_HAND.test(key)) left = object;
  });
  return muzzle ?? right ?? left;
}

/** How far past the hand a shot visibly starts, so the line leaves the gun's end rather than the palm. */
const HAND_REACH_M = 0.28;

/**
 * Register a placed character's visible muzzle: its muzzle node, or a point just in front of its
 * shooting hand along its facing. A model with no hand bone registers nothing.
 */
export function useEntityMuzzle(scene: THREE.Object3D, instanceId: string | undefined, facingYaw: () => number): void {
  const bone = useMemo(() => findMuzzleBone(scene), [scene]);
  useLayoutEffect(() => {
    if (bone === null || instanceId === undefined) return;
    const isMuzzle = boneKey(bone.name).includes("muzzle");
    return registerEntityMuzzle(instanceId, (target) => {
      bone.getWorldPosition(target);
      if (!isMuzzle) {
        const yaw = facingYaw();
        target.x += Math.sin(yaw) * HAND_REACH_M;
        target.z += Math.cos(yaw) * HAND_REACH_M;
      }
      return true;
    });
  }, [bone, instanceId, facingYaw]);
}
