import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import { lookAt, solveTwoBone, type MutableVec3 } from "@jgengine/core/anim/ikSolver";
import type { GameContext } from "@jgengine/core/runtime/gameContextTypes";
import type { ModelConfig } from "@jgengine/core/game/playableGame";

type FootIkConfig = NonNullable<ModelConfig["ik"]>;

function tuple(value: THREE.Vector3): [number, number, number] {
  return [value.x, value.y, value.z];
}

function worldQuaternion(bone: THREE.Object3D): THREE.Quaternion {
  const result = new THREE.Quaternion();
  bone.getWorldQuaternion(result);
  return result;
}

function writeWorldQuaternion(bone: THREE.Object3D, world: THREE.Quaternion): void {
  if (bone.parent === null) bone.quaternion.copy(world);
  else {
    const parent = worldQuaternion(bone.parent).invert();
    bone.quaternion.copy(parent.multiply(world));
  }
  bone.updateMatrixWorld(true);
}

function aimSegment(bone: THREE.Object3D, from: THREE.Vector3, currentTo: THREE.Vector3, solvedTo: readonly number[], weight: number): void {
  const current = currentTo.clone().sub(from).normalize();
  const solved = new THREE.Vector3(solvedTo[0] - from.x, solvedTo[1] - from.y, solvedTo[2] - from.z).normalize();
  if (current.lengthSq() < 1e-8 || solved.lengthSq() < 1e-8) return;
  const correction = new THREE.Quaternion().setFromUnitVectors(current, solved);
  const currentWorld = worldQuaternion(bone);
  const desiredWorld = correction.multiply(currentWorld);
  currentWorld.slerp(desiredWorld, weight);
  writeWorldQuaternion(bone, currentWorld);
}

/** Applies one frame of foot IK to a loaded rig. Exported for renderer tests and custom model hosts. */
export function applyFootIk(
  scene: THREE.Object3D,
  config: FootIkConfig,
  raycast: GameContext["scene"]["raycast"],
  weight: number,
  cameraTarget?: readonly [number, number, number],
): boolean {
  let grounded = false;
  scene.updateMatrixWorld(true);
  for (const foot of config.feet) {
    const root = scene.getObjectByName(foot.root);
    const mid = scene.getObjectByName(foot.mid);
    const tip = scene.getObjectByName(foot.tip);
    if (root === undefined || mid === undefined || tip === undefined) continue;
    const rootPosition = root.getWorldPosition(new THREE.Vector3());
    const midPosition = mid.getWorldPosition(new THREE.Vector3());
    const tipPosition = tip.getWorldPosition(new THREE.Vector3());
    const hit = raycast({
      origin: [tipPosition.x, tipPosition.y + 0.75, tipPosition.z],
      direction: [0, -1, 0],
      maxDistance: 2,
      filter: { entities: false, objects: false, walls: false, terrain: true },
    });
    if (hit === null) continue;
    grounded = true;
    const target = new THREE.Vector3(hit.point[0], hit.point[1], hit.point[2]);
    const output = { mid: [0, 0, 0] as MutableVec3, tip: [0, 0, 0] as MutableVec3 };
    solveTwoBone({ root: tuple(rootPosition), mid: tuple(midPosition), tip: tuple(tipPosition), target: tuple(target), pole: [rootPosition.x, rootPosition.y, rootPosition.z + 1] }, output);
    aimSegment(root, rootPosition, midPosition, output.mid, weight);
    root.updateMatrixWorld(true);
    const solvedMid = mid.getWorldPosition(new THREE.Vector3());
    // Rotating the root also moves the tip; aim the shin from that updated pose.
    const currentTip = tip.getWorldPosition(new THREE.Vector3());
    aimSegment(mid, solvedMid, currentTip, output.tip, weight);
  }
  if (config.lookAt !== undefined && cameraTarget !== undefined) {
    const bone = scene.getObjectByName(config.lookAt.bone);
    if (bone !== undefined) {
      const from = bone.getWorldPosition(new THREE.Vector3());
      const q = lookAt({ from: tuple(from), target: cameraTarget, up: [0, 1, 0] });
      const desired = new THREE.Quaternion(q[0], q[1], q[2], q[3]);
      const current = worldQuaternion(bone);
      current.slerp(desired, weight);
      writeWorldQuaternion(bone, current);
    }
  }
  return grounded;
}

/** Runs foot IK after the model animation mixer, fading the correction out while the entity is airborne. */
export function useFootIk(scene: THREE.Object3D, config: FootIkConfig | undefined, ctx: GameContext | null, instanceId?: string): void {
  const camera = useThree((state) => state.camera);
  const weight = useRef(0);
  useFrame((_state, delta) => {
    if (config === undefined || ctx === null || instanceId === undefined) return;
    const grounded = applyFootIk(scene, config, (input) => ctx.scene.raycast({ ...input, excludeInstanceIds: [instanceId] }), weight.current, tuple(camera.getWorldPosition(new THREE.Vector3())));
    const target = grounded ? 1 : 0;
    weight.current += (target - weight.current) * Math.min(1, delta * (grounded ? 12 : 5));
  });
}
