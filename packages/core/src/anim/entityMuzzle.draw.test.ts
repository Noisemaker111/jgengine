import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { findMuzzleBone, readEntityMuzzle, registerEntityMuzzle } from "./entityMuzzle.draw";

function rig(...names: string[]): THREE.Object3D {
  const root = new THREE.Group();
  for (const name of names) {
    const bone = new THREE.Bone();
    bone.name = name;
    root.add(bone);
  }
  return root;
}

describe("findMuzzleBone", () => {
  test("finds the right hand on KayKit, Mixamo, Rocketbox and Quaternius rigs", () => {
    expect(findMuzzleBone(rig("hand.l", "handslot.r"))?.name).toBe("handslot.r");
    expect(findMuzzleBone(rig("mixamorigLeftHand", "mixamorigRightHand"))?.name).toBe("mixamorigRightHand");
    expect(findMuzzleBone(rig("Bip01 L Hand", "Bip01 R Hand"))?.name).toBe("Bip01 R Hand");
    expect(findMuzzleBone(rig("Hand.L", "Hand.R"))?.name).toBe("Hand.R");
  });

  test("a muzzle node beats the hand, and a left hand is the last resort", () => {
    expect(findMuzzleBone(rig("Hand.R", "Muzzle"))?.name).toBe("Muzzle");
    expect(findMuzzleBone(rig("Hand.L"))?.name).toBe("Hand.L");
    expect(findMuzzleBone(rig("Spine", "Head"))).toBeNull();
  });

  test("finger bones are not mistaken for the hand", () => {
    expect(findMuzzleBone(rig("RightHandIndex1", "RightHand"))?.name).toBe("RightHand");
  });
});

describe("registerEntityMuzzle", () => {
  test("reads the registered point and stops after cleanup", () => {
    const off = registerEntityMuzzle("gunner", (target) => {
      target.set(1, 2, 3);
      return true;
    });
    const at = new THREE.Vector3();
    expect(readEntityMuzzle("gunner", at)).toBe(true);
    expect(at.toArray()).toEqual([1, 2, 3]);
    off();
    expect(readEntityMuzzle("gunner", at.set(0, 0, 0))).toBe(false);
    expect(at.toArray()).toEqual([0, 0, 0]);
  });
});
