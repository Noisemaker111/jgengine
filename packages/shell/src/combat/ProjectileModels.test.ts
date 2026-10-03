import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { applyProjectilePose } from "./ProjectileModels";

describe("live projectile models", () => {
  test("the nose follows full velocity including vertical travel", () => {
    const group = new THREE.Group();
    const forward = new THREE.Vector3(0, 1, 0);
    const scratch = new THREE.Vector3();
    applyProjectilePose(group, { position: [1, 2, 3], velocity: [3, 4, 0] }, forward, scratch);
    const nose = forward.clone().applyQuaternion(group.quaternion);
    expect(group.position.toArray()).toEqual([1, 2, 3]);
    expect(nose.x).toBeCloseTo(0.6);
    expect(nose.y).toBeCloseTo(0.8);
    expect(nose.z).toBeCloseTo(0);
  });

  test("a resting frame retains orientation without invalid quaternions", () => {
    const group = new THREE.Group();
    const forward = new THREE.Vector3(0, 1, 0);
    const scratch = new THREE.Vector3();
    applyProjectilePose(group, { position: [0, 0, 0], velocity: [0, 0, -1] }, forward, scratch);
    const previous = group.quaternion.clone();
    applyProjectilePose(group, { position: [4, 5, 6], velocity: [0, 0, 0] }, forward, scratch);
    expect(group.quaternion.equals(previous)).toBe(true);
    expect(group.position.toArray()).toEqual([4, 5, 6]);
  });
});
