import { describe, expect, test } from "bun:test";

import { createPoseSyncGate, type PlayerPose, type PoseSyncTuning } from "./poseSyncGate";

const TUNING: PoseSyncTuning = {
  minIntervalMs: 33,
  heartbeatMs: 400,
  positionEpsilon: 0.012,
  verticalEpsilon: 0.008,
  rotationEpsilon: 0.008,
};

const BASE_POSE: PlayerPose = { x: 0, y: 0, z: 0, rotationY: 0, rotationPitch: 0 };

describe("createPoseSyncGate", () => {
  test("first evaluate always sends", () => {
    const gate = createPoseSyncGate(TUNING);
    expect(gate.evaluate(BASE_POSE, 0)).toBe(true);
  });

  test("suppresses sends within minIntervalMs even when pose changed", () => {
    const gate = createPoseSyncGate(TUNING);
    expect(gate.evaluate(BASE_POSE, 0)).toBe(true);
    const moved: PlayerPose = { ...BASE_POSE, x: 1 };
    expect(gate.evaluate(moved, 10)).toBe(false);
  });

  test("epsilon-edge: a delta exactly at the epsilon does not count as changed", () => {
    const gate = createPoseSyncGate(TUNING);
    expect(gate.evaluate(BASE_POSE, 0)).toBe(true);
    const atEdge: PlayerPose = { ...BASE_POSE, x: TUNING.positionEpsilon };
    expect(gate.evaluate(atEdge, 100)).toBe(false);
    const pastEdge: PlayerPose = { ...BASE_POSE, x: TUNING.positionEpsilon + 0.0001 };
    expect(gate.evaluate(pastEdge, 200)).toBe(true);
  });

  test("heartbeat fires on an unchanged pose once heartbeatMs has elapsed", () => {
    const gate = createPoseSyncGate(TUNING);
    expect(gate.evaluate(BASE_POSE, 0)).toBe(true);
    expect(gate.evaluate(BASE_POSE, 100)).toBe(false);
    expect(gate.evaluate(BASE_POSE, TUNING.heartbeatMs)).toBe(true);
  });

  test("a changed pose suppressed inside the interval sends once the interval elapses", () => {
    const gate = createPoseSyncGate(TUNING);
    expect(gate.evaluate(BASE_POSE, 0)).toBe(true);
    const moved: PlayerPose = { ...BASE_POSE, x: 1 };
    expect(gate.evaluate(moved, 10)).toBe(false);
    expect(gate.evaluate(moved, TUNING.minIntervalMs)).toBe(true);
  });

  test("vertical and rotation epsilons are checked independently", () => {
    const gate = createPoseSyncGate(TUNING);
    expect(gate.evaluate(BASE_POSE, 0)).toBe(true);
    const jumped: PlayerPose = { ...BASE_POSE, y: TUNING.verticalEpsilon + 0.001 };
    expect(gate.evaluate(jumped, 100)).toBe(true);
    const rotated: PlayerPose = { ...jumped, rotationPitch: TUNING.rotationEpsilon + 0.001 };
    expect(gate.evaluate(rotated, 200)).toBe(true);
  });

  test("appearance change forces a send despite unmoved position, subject to the interval", () => {
    const gate = createPoseSyncGate(TUNING);
    expect(gate.evaluate(BASE_POSE, 0)).toBe(true);
    const appeared: PlayerPose = { ...BASE_POSE, appearance: { skin: "red" } };
    expect(gate.evaluate(appeared, 10)).toBe(false);
    expect(gate.evaluate(appeared, TUNING.minIntervalMs)).toBe(true);
  });

  test("unchanged appearance does not force a send", () => {
    const gate = createPoseSyncGate(TUNING);
    const withAppearance: PlayerPose = { ...BASE_POSE, appearance: { skin: "red" } };
    expect(gate.evaluate(withAppearance, 0)).toBe(true);
    expect(gate.evaluate({ ...withAppearance }, TUNING.minIntervalMs)).toBe(false);
  });
});
