import { describe, expect, test } from "bun:test";
import { cameraAngleAt, type CameraDef } from "./cameraSchedule";

const camera: CameraDef = {
  id: "test_camera",
  name: "Test Sentry-Eye",
  roomName: "Test Room",
  position: [0, 1.5, 0],
  baseAngle: 0,
  sweepDeg: 90,
  periodSeconds: 8,
  range: 6,
  angleDeg: 50,
};

describe("cameraAngleAt", () => {
  test("is a pure function of t", () => {
    expect(cameraAngleAt(camera, 3.2)).toEqual(cameraAngleAt(camera, 3.2));
  });

  test("starts at the sweep's minimum angle at t=0", () => {
    const halfSweep = (camera.sweepDeg * Math.PI) / 360;
    expect(cameraAngleAt(camera, 0).angle).toBeCloseTo(camera.baseAngle - halfSweep, 5);
  });

  test("reaches the sweep's maximum angle at half the period", () => {
    const halfSweep = (camera.sweepDeg * Math.PI) / 360;
    expect(cameraAngleAt(camera, camera.periodSeconds / 2).angle).toBeCloseTo(camera.baseAngle + halfSweep, 5);
  });

  test("returns to the minimum angle after a full period", () => {
    const halfSweep = (camera.sweepDeg * Math.PI) / 360;
    expect(cameraAngleAt(camera, camera.periodSeconds).angle).toBeCloseTo(camera.baseAngle - halfSweep, 5);
  });

  test("stays within the swept arc at all times", () => {
    const halfSweep = (camera.sweepDeg * Math.PI) / 360;
    for (let t = 0; t <= 40; t += 0.7) {
      const angle = cameraAngleAt(camera, t).angle;
      expect(angle).toBeGreaterThanOrEqual(camera.baseAngle - halfSweep - 1e-9);
      expect(angle).toBeLessThanOrEqual(camera.baseAngle + halfSweep + 1e-9);
    }
  });
});
