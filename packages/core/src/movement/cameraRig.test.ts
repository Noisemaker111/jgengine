import { describe, expect, test } from "bun:test";
import {
  advanceEyeHeight,
  advanceHeadBobTime,
  CAMERA_PITCH_LIMIT,
  clampCameraPitch,
  resolveCameraTrackingBlend,
  resolveHeadBobAmplitude,
  resolveHeadBobOffset,
  resolveHeadBobRate,
  resolveTargetEyeHeight,
} from "@jgengine/core/movement/cameraRig";
import { MOVEMENT_TUNING } from "@jgengine/core/movement/movementModel";

describe("cameraRig", () => {
  describe("head bob rate/amplitude by gait", () => {
    test("crouch gait uses crouch rate and amplitude", () => {
      expect(resolveHeadBobRate(true, false)).toBe(MOVEMENT_TUNING.crouchBobRate);
      expect(resolveHeadBobAmplitude(true, false, true)).toBe(MOVEMENT_TUNING.crouchBobAmplitude);
    });

    test("run gait uses run rate and amplitude when not crouching", () => {
      expect(resolveHeadBobRate(false, true)).toBe(MOVEMENT_TUNING.runBobRate);
      expect(resolveHeadBobAmplitude(false, true, true)).toBe(MOVEMENT_TUNING.runBobAmplitude);
    });

    test("walk gait is the fallback when neither crouching nor running", () => {
      expect(resolveHeadBobRate(false, false)).toBe(MOVEMENT_TUNING.walkBobRate);
      expect(resolveHeadBobAmplitude(false, false, true)).toBe(MOVEMENT_TUNING.walkBobAmplitude);
    });

    test("crouching takes precedence over running", () => {
      expect(resolveHeadBobRate(true, true)).toBe(MOVEMENT_TUNING.crouchBobRate);
      expect(resolveHeadBobAmplitude(true, true, true)).toBe(MOVEMENT_TUNING.crouchBobAmplitude);
    });

    test("amplitude is zero while airborne regardless of gait", () => {
      expect(resolveHeadBobAmplitude(false, true, false)).toBe(0);
      expect(resolveHeadBobAmplitude(true, false, false)).toBe(0);
    });
  });

  describe("advanceHeadBobTime", () => {
    test("advances by rate * dt while moving and grounded", () => {
      const rate = MOVEMENT_TUNING.walkBobRate;
      expect(advanceHeadBobTime(1, true, true, rate, 0.5)).toBeCloseTo(1 + rate * 0.5);
    });

    test("resets to zero when not moving", () => {
      expect(advanceHeadBobTime(5, false, true, MOVEMENT_TUNING.walkBobRate, 0.5)).toBe(0);
    });

    test("resets to zero when airborne even if moving", () => {
      expect(advanceHeadBobTime(5, true, false, MOVEMENT_TUNING.walkBobRate, 0.5)).toBe(0);
    });
  });

  describe("resolveHeadBobOffset", () => {
    test("is zero at phase zero", () => {
      expect(resolveHeadBobOffset(0, MOVEMENT_TUNING.walkBobAmplitude)).toBe(0);
    });

    test("scales sin(2 pi phase) by amplitude", () => {
      const phase = 0.25;
      const amplitude = 0.045;
      expect(resolveHeadBobOffset(phase, amplitude)).toBeCloseTo(Math.sin(phase * Math.PI * 2) * amplitude);
    });
  });

  describe("eye height blend", () => {
    test("resolveTargetEyeHeight is the crouch height only while crouching and grounded", () => {
      expect(resolveTargetEyeHeight(true, true)).toBe(MOVEMENT_TUNING.crouchEyeHeight);
      expect(resolveTargetEyeHeight(true, false)).toBe(MOVEMENT_TUNING.standEyeHeight);
      expect(resolveTargetEyeHeight(false, true)).toBe(MOVEMENT_TUNING.standEyeHeight);
    });

    test("advanceEyeHeight converges to the target over repeated frames", () => {
      let eyeHeight = MOVEMENT_TUNING.standEyeHeight;
      const target = MOVEMENT_TUNING.crouchEyeHeight;
      for (let frame = 0; frame < 240; frame += 1) {
        eyeHeight = advanceEyeHeight(eyeHeight, target, 1 / 60);
      }
      expect(eyeHeight).toBeCloseTo(target, 3);
    });

    test("advanceEyeHeight does not overshoot the target", () => {
      const next = advanceEyeHeight(MOVEMENT_TUNING.standEyeHeight, MOVEMENT_TUNING.crouchEyeHeight, 1 / 60);
      expect(next).toBeLessThan(MOVEMENT_TUNING.standEyeHeight);
      expect(next).toBeGreaterThan(MOVEMENT_TUNING.crouchEyeHeight);
    });
  });

  describe("resolveCameraTrackingBlend", () => {
    test("is zero for a zero-length frame", () => {
      expect(resolveCameraTrackingBlend(0)).toBe(0);
    });

    test("matches the exponential formula for a known dt", () => {
      const dt = 1 / 60;
      expect(resolveCameraTrackingBlend(dt)).toBeCloseTo(1 - Math.exp(-MOVEMENT_TUNING.cameraTrackingSpeed * dt));
    });

    test("approaches 1 for a large dt", () => {
      expect(resolveCameraTrackingBlend(5)).toBeGreaterThan(0.999);
    });
  });

  describe("clampCameraPitch", () => {
    test("passes values within bounds through unchanged", () => {
      expect(clampCameraPitch(0.5)).toBe(0.5);
    });

    test("clamps to the upper bound", () => {
      expect(clampCameraPitch(10)).toBe(CAMERA_PITCH_LIMIT);
    });

    test("clamps to the lower bound", () => {
      expect(clampCameraPitch(-10)).toBe(-CAMERA_PITCH_LIMIT);
    });
  });
});
