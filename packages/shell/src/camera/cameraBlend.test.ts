import { describe, expect, test } from "bun:test";
import { PerspectiveCamera, Quaternion, Vector3 } from "three";

import {
  applyCameraBlendStep,
  captureCameraBlendFrom,
  createCameraBlendScratch,
} from "./cameraBlendMath";

describe("camera blend scratch", () => {
  test("blends without allocating new Vector3 or Quaternion per step", () => {
    const camera = new PerspectiveCamera(55, 1, 0.1, 1000);
    camera.position.set(0, 2, 6);
    camera.quaternion.identity();
    const scratch = createCameraBlendScratch(Vector3, Quaternion);
    const fromPos = scratch.fromPos;
    const fromQuat = scratch.fromQuat;
    const toPos = scratch.toPos;
    const toQuat = scratch.toQuat;

    captureCameraBlendFrom(scratch, camera.position, camera.quaternion, 55, 0.5);
    expect(scratch.fromPos).toBe(fromPos);
    expect(scratch.fromQuat).toBe(fromQuat);

    camera.position.set(4, 3, 0);
    camera.lookAt(0, 1, 0);
    const doneHalfway = applyCameraBlendStep(scratch, camera, 60, 0.25);
    expect(doneHalfway).toBe(false);
    expect(scratch.toPos).toBe(toPos);
    expect(scratch.toQuat).toBe(toQuat);
    expect(scratch.fromPos).toBe(fromPos);
    expect(scratch.fromQuat).toBe(fromQuat);
    expect(camera.position.x).toBeGreaterThan(0);
    expect(camera.position.x).toBeLessThan(4);

    const done = applyCameraBlendStep(scratch, camera, 60, 0.5);
    expect(done).toBe(true);
  });

  test("capture copies values into preallocated scratch fields", () => {
    const scratch = createCameraBlendScratch(Vector3, Quaternion);
    const position = new Vector3(1, 2, 3);
    const quaternion = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.4);
    captureCameraBlendFrom(scratch, position, quaternion, 48, 0.8);
    expect(scratch.fromPos.x).toBe(1);
    expect(scratch.fromPos.y).toBe(2);
    expect(scratch.fromPos.z).toBe(3);
    expect(scratch.fromQuat.equals(quaternion)).toBe(true);
    expect(scratch.fov).toBe(48);
    expect(scratch.duration).toBe(0.8);
    expect(scratch.elapsed).toBe(0);
  });
});
