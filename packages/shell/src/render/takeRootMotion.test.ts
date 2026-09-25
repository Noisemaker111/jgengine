import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { takeRootMotion } from "./useModelAnimation";

function rig(yaw: number, scale: number) {
  const entity = new THREE.Group();
  entity.rotation.y = yaw;
  const model = new THREE.Group();
  model.scale.setScalar(scale);
  entity.add(model);
  const hips = new THREE.Bone();
  hips.position.set(0, 0.39, 0);
  model.add(hips);
  return { hips, bind: hips.position.clone() };
}

describe("takeRootMotion", () => {
  test("turns forward rig travel into world travel along the entity's facing and scale", () => {
    const { hips, bind } = rig(Math.PI / 2, 2);
    hips.position.set(0, 0.36, 0.25);
    const travel = takeRootMotion(hips, bind, [0, 0.01, 0.25], new THREE.Vector3());
    expect(travel.x).toBeCloseTo(0.5, 9);
    expect(travel.y).toBe(0);
    expect(travel.z).toBeCloseTo(0, 9);
    expect(hips.position.toArray()).toEqual([0, 0.36, 0]);
  });

  test("pins the bone in place on a step with no travel", () => {
    const { hips, bind } = rig(0, 1);
    hips.position.set(0.1, 0.4, 0.2);
    expect(takeRootMotion(hips, bind, undefined, new THREE.Vector3()).toArray()).toEqual([0, 0, 0]);
    expect(hips.position.toArray()).toEqual([0, 0.4, 0]);
  });
});
