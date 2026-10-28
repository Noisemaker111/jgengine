import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { retargetClipByRest } from "./clipRetarget";

function chain(root: THREE.Object3D, specs: readonly [string, string | null, readonly [number, number, number]][]): Map<string, THREE.Bone> {
  const bones = new Map<string, THREE.Bone>();
  for (const [name, parent, offset] of specs) {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(...offset);
    (parent === null ? root : bones.get(parent))?.add(bone);
    bones.set(name, bone);
  }
  return bones;
}

/** A T-pose source facing +Z (left arm along +X) and an A-pose target turned to face -Z, 20% taller. */
function rigs() {
  const source = new THREE.Group();
  chain(source, [
    ["S_hips", null, [0, 1, 0]],
    ["S_legL", "S_hips", [0.1, -0.05, 0]],
    ["S_legR", "S_hips", [-0.1, -0.05, 0]],
    ["S_footL", "S_legL", [0, -0.9, 0]],
    ["S_footR", "S_legR", [0, -0.9, 0]],
    ["S_spine", "S_hips", [0, 0.3, 0]],
    ["S_armL", "S_spine", [0.2, 0.2, 0]],
    ["S_handL", "S_armL", [0.5, 0, 0]],
  ]);
  const target = new THREE.Group();
  target.rotation.y = Math.PI;
  const s = Math.SQRT1_2 * 0.6;
  chain(target, [
    ["hips", null, [0, 1.2, 0]],
    ["legL", "hips", [0.12, -0.06, 0]],
    ["legR", "hips", [-0.12, -0.06, 0]],
    ["footL", "legL", [0, -1.08, 0]],
    ["footR", "legR", [0, -1.08, 0]],
    ["spine", "hips", [0, 0.36, 0]],
    ["armL", "spine", [0.24, 0.24, 0]],
    ["handL", "armL", [s, -s, 0]],
  ]);
  const scene = new THREE.Scene();
  scene.add(source, target);
  return { source, target };
}

describe("retargetClipByRest", () => {
  test("an A-pose body facing the other way follows a T-pose arm raise and hip bob", () => {
    const { source, target } = rigs();
    const down = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
    const clip = new THREE.AnimationClip("lower", 1, [
      new THREE.QuaternionKeyframeTrack("S_armL.quaternion", [0, 1], [0, 0, 0, 1, down.x, down.y, down.z, down.w]),
      new THREE.VectorKeyframeTrack("S_hips.position", [0, 1], [0, 1, 0, 0.5, 0.9, 0]),
    ]);
    const out = retargetClipByRest(target, source, clip, {
      name: "Lower",
      bones: [
        { target: "hips", source: "S_hips" },
        { target: "spine", source: "S_spine" },
        { target: "armL", source: "S_armL", aim: { target: "handL", source: "S_handL" } },
      ],
      hip: { target: "hips", source: "S_hips" },
      sides: { target: ["legL", "legR"], source: ["S_legL", "S_legR"] },
    });
    expect(out.name).toBe("Lower");
    expect(out.tracks.map((track) => track.name).sort()).toEqual(["armL.quaternion", "hips.position", "hips.quaternion", "spine.quaternion"]);

    const mixer = new THREE.AnimationMixer(target);
    mixer.clipAction(out).setLoop(THREE.LoopOnce, 1).play().clampWhenFinished = true;
    const armDirection = () => {
      target.updateMatrixWorld(true);
      const arm = target.getObjectByName("armL")?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3();
      return (target.getObjectByName("handL")?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3()).sub(arm).normalize();
    };
    const left = target.getObjectByName("legL")?.getWorldPosition(new THREE.Vector3()).sub(target.getObjectByName("legR")?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3()).normalize();

    mixer.setTime(0);
    const rest = armDirection();
    expect(rest.y).toBeCloseTo(0, 5);
    expect(rest.dot(left ?? new THREE.Vector3())).toBeCloseTo(1, 5);

    mixer.setTime(1);
    const lowered = armDirection();
    expect(lowered.y).toBeCloseTo(-1, 5);
    const hip = target.getObjectByName("hips")?.getWorldPosition(new THREE.Vector3());
    expect(hip?.y).toBeCloseTo(1.2 - 0.1 * 1.2, 4);
    // 0.5 m of travel along +X for the source is 0.6 m toward the turned target's own left.
    expect(hip?.x).toBeCloseTo(-0.6, 4);

    source.updateMatrixWorld(true);
    expect(source.getObjectByName("S_armL")?.quaternion.w).toBeCloseTo(1, 6);
  });

  test("inPlace keeps the bob and drops the travel", () => {
    const { source, target } = rigs();
    const clip = new THREE.AnimationClip("walk", 1, [new THREE.VectorKeyframeTrack("S_hips.position", [0, 1], [0, 1, 0, 0, 1.1, 2])]);
    const out = retargetClipByRest(target, source, clip, {
      name: "Walk",
      bones: [{ target: "hips", source: "S_hips" }],
      hip: { target: "hips", source: "S_hips" },
      sides: { target: ["legL", "legR"], source: ["S_legL", "S_legR"] },
      inPlace: true,
    });
    const mixer = new THREE.AnimationMixer(target);
    mixer.clipAction(out).setLoop(THREE.LoopOnce, 1).play().clampWhenFinished = true;
    mixer.setTime(1);
    target.updateMatrixWorld(true);
    const hip = target.getObjectByName("hips")?.getWorldPosition(new THREE.Vector3());
    expect(hip?.y).toBeCloseTo(1.2 + 0.12, 4);
    expect(hip?.x).toBeCloseTo(0, 5);
    expect(hip?.z).toBeCloseTo(0, 5);
  });
});
