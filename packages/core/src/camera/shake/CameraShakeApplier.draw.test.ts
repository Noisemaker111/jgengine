import { describe, expect, test } from "bun:test";
import { PerspectiveCamera } from "three";

import { createCameraShake, type CameraShakeOffset } from "@jgengine/core/camera/shake/cameraShake";

import { CameraShakeApplier } from "./CameraShakeApplier.draw";
import { rigShakeConfig } from "./cameraShake";
import { applyCameraShake, removeCameraShake } from "./shakeChannel.draw";

describe("camera shake applier", () => {
  test("kicks the camera, then takes exactly that kick back off", () => {
    expect(typeof CameraShakeApplier).toBe("function");
    const camera = new PerspectiveCamera();
    camera.position.set(3, 4, 5);
    camera.lookAt(0, 0, 0);
    const base = { position: camera.position.clone(), quaternion: camera.quaternion.clone() };
    const shake = createCameraShake({ ...rigShakeConfig(), maxRotation: [0.1, 0.1, 0.2] });
    shake.add(1);
    const applied: CameraShakeOffset = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 };
    applyCameraShake(camera, shake, 1 / 60, applied);
    expect(camera.position.distanceTo(base.position)).toBeGreaterThan(0.01);
    removeCameraShake(camera, applied);
    expect(camera.position.distanceTo(base.position)).toBeLessThan(1e-9);
    expect(camera.quaternion.angleTo(base.quaternion)).toBeLessThan(1e-6);
  });
});
