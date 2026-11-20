import { describe, expect, test } from "bun:test";

import {
  advanceGaitPhase,
  DEFAULT_GAIT_TUNING,
  gaitBobOffset,
  gaitSwayAngle,
} from "./avatarGait";

describe("advanceGaitPhase", () => {
  test("advances proportionally to distance travelled", () => {
    const oneUnit = advanceGaitPhase(0, 2, 0.5);
    expect(oneUnit).toBeCloseTo(DEFAULT_GAIT_TUNING.stridesPerUnit * Math.PI * 2);
    expect(advanceGaitPhase(0, 0, 0.5)).toBe(0);
  });
});

describe("gaitBobOffset", () => {
  test("peaks twice per stride cycle and never goes negative", () => {
    const speed = DEFAULT_GAIT_TUNING.fullIntensitySpeed;
    expect(gaitBobOffset(Math.PI / 2, speed)).toBeCloseTo(DEFAULT_GAIT_TUNING.bobAmplitude);
    expect(gaitBobOffset((3 * Math.PI) / 2, speed)).toBeCloseTo(DEFAULT_GAIT_TUNING.bobAmplitude);
    expect(gaitBobOffset(0, speed)).toBeCloseTo(0);
    expect(gaitBobOffset(Math.PI, speed)).toBeCloseTo(0);
  });

  test("scales with speed and caps at full intensity", () => {
    const half = gaitBobOffset(Math.PI / 2, DEFAULT_GAIT_TUNING.fullIntensitySpeed / 2);
    expect(half).toBeCloseTo(DEFAULT_GAIT_TUNING.bobAmplitude / 2);
    const over = gaitBobOffset(Math.PI / 2, DEFAULT_GAIT_TUNING.fullIntensitySpeed * 3);
    expect(over).toBeCloseTo(DEFAULT_GAIT_TUNING.bobAmplitude);
    expect(gaitBobOffset(Math.PI / 2, 0)).toBe(0);
  });
});

describe("gaitSwayAngle", () => {
  test("alternates sign with each footfall", () => {
    const speed = DEFAULT_GAIT_TUNING.fullIntensitySpeed;
    expect(gaitSwayAngle(Math.PI / 2, speed)).toBeCloseTo(DEFAULT_GAIT_TUNING.swayAmplitude);
    expect(gaitSwayAngle((3 * Math.PI) / 2, speed)).toBeCloseTo(-DEFAULT_GAIT_TUNING.swayAmplitude);
  });
});
