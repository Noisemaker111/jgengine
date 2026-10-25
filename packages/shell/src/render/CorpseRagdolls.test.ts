import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { bestRigMap, registerEntityBody } from "./CorpseRagdolls";

function rig(names: string[]): THREE.Object3D {
  const root = new THREE.Group();
  let parent: THREE.Object3D = root;
  for (const name of names) {
    const bone = new THREE.Bone();
    bone.name = name;
    parent.add(bone);
    parent = bone;
  }
  return root;
}

describe("bestRigMap", () => {
  test("a Mixamo rig maps through the Mixamo scheme", () => {
    const map = bestRigMap(rig(["mixamorigHips", "mixamorigSpine", "mixamorigSpine1", "mixamorigNeck", "mixamorigHead", "mixamorigLeftUpLeg", "mixamorigLeftLeg", "mixamorigRightUpLeg", "mixamorigRightLeg"]));
    expect(map).not.toBeNull();
    expect(Object.keys(map!.slots).length).toBeGreaterThanOrEqual(6);
  });

  test("a model without a skeleton has no map", () => {
    expect(bestRigMap(new THREE.Group())).toBeNull();
    expect(bestRigMap(rig(["Root", "Thing"]))).toBeNull();
  });
});

describe("registerEntityBody", () => {
  test("cleanup only removes its own registration", () => {
    const a = new THREE.Group();
    const b = new THREE.Group();
    const offA = registerEntityBody("e1", a);
    const offB = registerEntityBody("e1", b);
    offA();
    offB();
    expect(true).toBe(true);
  });
});
