import { describe, expect, test } from "bun:test";

import { measureMovement, type MovementProbeSubject } from "./movementProbe";

const FLOATY_PLATFORMER: MovementProbeSubject = {
  walkSpeed: 3,
  physics: { gravity: -12, jumpVelocity: 7 },
  movement: {
    feel: { groundAcceleration: 30, airAcceleration: 25, groundFriction: 20, jumpCutFactor: 0.4, apexGravityScale: 0.45, apexSpeed: 2 },
  },
};

const WEIGHTY_SHOOTER: MovementProbeSubject = {
  walkSpeed: 3,
  physics: { gravity: -32, jumpVelocity: 6 },
  movement: {
    feel: { groundAcceleration: 10, airAcceleration: 1.5, groundFriction: 8, fallGravityScale: 1.6, landingRecoveryMs: 180 },
  },
};

describe("measureMovement", () => {
  test("engine defaults: walk speed, jump arc from gravity 24 and jump velocity 7.1", () => {
    const report = measureMovement();
    expect(report.topSpeed).toBeCloseTo(3.5, 3);
    expect(Math.abs(report.jumpHeight - (7.1 * 7.1) / (2 * 24))).toBeLessThan(0.1);
    expect(Math.abs(report.apexTime - 7.1 / 24)).toBeLessThan(1 / 60);
    expect(Math.abs(report.airTime - report.apexTime * 2)).toBeLessThan(2 / 60);
    expect(report.timeToTopSpeed).toBeLessThan(0.2);
    expect(report.stopDistance).toBeLessThan(0.1);
  });

  test("is deterministic", () => {
    expect(measureMovement(FLOATY_PLATFORMER)).toEqual(measureMovement(FLOATY_PLATFORMER));
  });

  test("same fields, two distinct feels: floaty platformer vs weighty shooter", () => {
    const floaty = measureMovement(FLOATY_PLATFORMER);
    const weighty = measureMovement(WEIGHTY_SHOOTER);

    expect(floaty.topSpeed).toBeCloseTo(weighty.topSpeed, 3);

    expect(floaty.jumpHeight).toBeGreaterThan(1.8);
    expect(weighty.jumpHeight).toBeLessThan(0.65);
    expect(floaty.airTime).toBeGreaterThan(weighty.airTime * 2.5);
    expect(floaty.airControlReach).toBeGreaterThan(weighty.airControlReach * 4);

    expect(weighty.timeToTopSpeed).toBeGreaterThan(floaty.timeToTopSpeed * 2.5);
    expect(weighty.stopDistance).toBeGreaterThan(floaty.stopDistance * 2);
    expect(weighty.turnAroundTime).toBeGreaterThan(floaty.turnAroundTime * 2.5);

    expect(floaty.tapJumpHeight).toBeLessThan(floaty.jumpHeight * 0.6);
    expect(weighty.tapJumpHeight).toBe(weighty.jumpHeight);
    expect(floaty.airTime - floaty.apexTime).toBeCloseTo(floaty.apexTime, 1);
    expect(weighty.airTime - weighty.apexTime).toBeLessThan(weighty.apexTime);
  });

  test("sprint raises top speed by the run multiplier", () => {
    const subject: MovementProbeSubject = { movement: { feel: { runMultiplier: 2 } } };
    expect(measureMovement(subject, { sprint: true }).topSpeed).toBeCloseTo(measureMovement(subject).topSpeed * 2, 3);
  });

  test("zero air acceleration commits to the jump arc", () => {
    const report = measureMovement({ movement: { feel: { airAcceleration: 0 } } });
    expect(report.airControlReach).toBe(0);
  });
});
