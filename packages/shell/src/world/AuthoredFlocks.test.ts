import { expect, test } from "bun:test";
import * as THREE from "three";

import { applyFlockPose } from "./AuthoredFlocks";

test("habitat models follow actual agent positions and climbing velocity", () => {
  const group = new THREE.Group();
  const forward = new THREE.Vector3(0, 0, -1);
  applyFlockPose(group, { position: [2, 8, 4], velocity: [0, 3, -4] }, forward, new THREE.Vector3());
  const nose = forward.clone().applyQuaternion(group.quaternion);
  expect(group.position.toArray()).toEqual([2, 8, 4]);
  expect(nose.y).toBeCloseTo(0.6);
  expect(nose.z).toBeCloseTo(-0.8);
});
