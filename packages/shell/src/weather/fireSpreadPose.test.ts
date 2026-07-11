import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { setBillboardQuaternion } from "./fireSpreadPose";

describe("setBillboardQuaternion", () => {
  test("reuses euler/quaternion without allocating new instances", () => {
    const euler = new THREE.Euler();
    const quaternion = new THREE.Quaternion();
    setBillboardQuaternion(quaternion, euler, Math.PI / 2);
    expect(euler.y).toBeCloseTo(Math.PI / 2, 5);
    const expected = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
    expect(quaternion.x).toBeCloseTo(expected.x, 5);
    expect(quaternion.y).toBeCloseTo(expected.y, 5);
    expect(quaternion.z).toBeCloseTo(expected.z, 5);
    expect(quaternion.w).toBeCloseTo(expected.w, 5);
  });
});
