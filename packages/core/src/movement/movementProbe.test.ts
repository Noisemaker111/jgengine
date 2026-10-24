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

  test("the same jump reaches the same height at 30, 60, 144 and 240 fps", () => {
    // Euler gravity over-estimates at large dt: before the trapezoidal step the same jump peaked at
    // 0.933 m at 30 fps and 1.026 m at 144 fps — an 11% band from frame rate alone.
    const heights = [1 / 30, 1 / 60, 1 / 144, 1 / 240].map((dt) => measureMovement({}, { dt }).jumpHeight);
    const spread = Math.max(...heights) - Math.min(...heights);
    expect(heights[1]).toBeCloseTo((7.1 * 7.1) / (2 * 24), 2);
    expect(spread).toBeLessThan(0.01);
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
    // At 60 Hz tick resolution the 1.6× fall gravity is under one tick; sample finer to see it. The
    // tolerance is one 240 Hz tick (the sampling resolution), so a fall slower than the rise by more
    // than a tick still fails while a next-tick rounding does not.
    const weightyFine = measureMovement(WEIGHTY_SHOOTER, { dt: 1 / 240 });
    const rise = weightyFine.apexTime;
    const fall = weightyFine.airTime - weightyFine.apexTime;
    expect(fall, `fall ${fall.toFixed(4)}s against rise ${rise.toFixed(4)}s at 240 Hz`).toBeLessThan(rise - 1 / 240);
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
