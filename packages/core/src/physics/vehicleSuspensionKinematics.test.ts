import { describe, expect, test } from "bun:test";

import { suspensionKinematics } from "./vehicleSuspensionKinematics";

const car = { massKg: 1138, comHeight: 0.45, frontWeight: 0.5, trackWidth: 1.5 };
const simple = { frontShare: 0.5, rollFollow: 0.7 };
const geometry = { rollCentreFront: 0.12, rollCentreRear: 0.09, rollStiffnessFront: 0.54, rollFollowFront: 0.67, rollFollowRear: 0.9 };

describe("suspensionKinematics", () => {
  test("the links and springs together always carry the rigid-body transfer m·ay·h/t", () => {
    for (const strength of [0, 0.2, 1, 2, 4]) {
      const split = suspensionKinematics(geometry, car, 6, simple, strength);
      expect(split.transferFront + split.transferRear).toBeCloseTo((car.massKg * 6 * car.comHeight) / car.trackWidth, 6);
    }
  });

  test("strength 0 is the simple split about the ground", () => {
    const split = suspensionKinematics(geometry, car, 6, simple, 0);
    expect(split.transferFront).toBeCloseTo(split.transferRear, 9);
    expect(split.rollArm).toBe(car.comHeight);
    expect(split.rollFollowFront).toBe(0.7);
  });

  test("at 1 the roll centres take their share at once and the springs split the rest by roll stiffness", () => {
    const split = suspensionKinematics(geometry, car, 6, simple, 1);
    const axis = 0.12 + (0.09 - 0.12) * 0.5;
    expect(split.rollArm).toBeCloseTo(car.comHeight - axis, 9);
    const total = (car.massKg * 6) / car.trackWidth;
    expect(split.transferFront).toBeCloseTo(total * (0.5 * 0.12 + 0.54 * (car.comHeight - axis)), 6);
    expect(split.rollFollowRear).toBeCloseTo(0.9, 9);
  });

  test("the roll lever shrinks monotonically with the dial and stays above zero", () => {
    const arms = [0, 0.2, 1, 2, 4, 40].map((strength) => suspensionKinematics(geometry, car, 6, simple, strength).rollArm);
    for (let i = 1; i < arms.length; i += 1) expect(arms[i] ?? 0).toBeLessThanOrEqual(arms[i - 1] ?? 0);
    expect(arms[arms.length - 1] ?? 0).toBeGreaterThan(0);
  });
});
