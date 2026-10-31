import { describe, expect, test } from "bun:test";

import { createSuspensionSample, createSuspensionTable, solveSuspension, type DoubleWishboneGeometry, type MacPhersonGeometry } from "./suspensionKinematics";

function camberOf(axle: readonly number[]): number {
  return -Math.asin(axle[2] ?? 0);
}

function toeOf(axle: readonly number[]): number {
  return Math.atan2(axle[0] ?? 0, axle[1] ?? 0);
}

// A parallelogram: equal, parallel arms keep the upright upright, and a tie rod parallel and equal to them keeps toe.
const parallelogram: DoubleWishboneGeometry = {
  kind: "doubleWishbone",
  lowerFront: [0.15, 0.35, 0.15],
  lowerRear: [-0.15, 0.35, 0.15],
  lowerBallJoint: [0, 0.7, 0.15],
  upperFront: [0.15, 0.35, 0.45],
  upperRear: [-0.15, 0.35, 0.45],
  upperBallJoint: [0, 0.7, 0.45],
  tieRodInner: [-0.12, 0.35, 0.15],
  tieRodOuter: [-0.12, 0.7, 0.15],
  wheelCenter: [0, 0.75, 0.3],
  camber: 0,
  toe: 0,
  springBody: [0, 0.5, 0.6],
  springArm: [0, 0.55, 0.15],
};

const shortUpper: DoubleWishboneGeometry = { ...parallelogram, upperFront: [0.15, 0.5, 0.45], upperRear: [-0.15, 0.5, 0.45] };

const strut: MacPhersonGeometry = {
  kind: "macPherson",
  lowerFront: [0.2, 0.35, 0.15],
  lowerRear: [-0.15, 0.35, 0.15],
  lowerBallJoint: [0, 0.72, 0.13],
  strutTop: [-0.02, 0.6, 0.75],
  strutLower: [0, 0.66, 0.35],
  tieRodInner: [-0.13, 0.35, 0.25],
  tieRodOuter: [-0.13, 0.68, 0.25],
  wheelCenter: [0, 0.75, 0.3],
  camber: -0.01,
  toe: 0.001,
};

describe("solveSuspension", () => {
  test("reproduces the design pose at θ = 0", () => {
    for (const g of [parallelogram, shortUpper, strut]) {
      const pose = solveSuspension(g, 0, 0);
      pose.wheelCenter.forEach((value, k) => expect(value).toBeCloseTo(g.wheelCenter[k] ?? 0, 9));
      expect(camberOf(pose.axle)).toBeCloseTo(g.camber, 9);
      expect(toeOf(pose.axle)).toBeCloseTo(g.toe, 9);
    }
  });

  test("a parallelogram keeps camber and toe through travel and swings the wheel on the arm's arc", () => {
    for (const theta of [-0.2, -0.05, 0.1, 0.25]) {
      const pose = solveSuspension(parallelogram, theta, 0);
      expect(camberOf(pose.axle)).toBeCloseTo(0, 9);
      expect(toeOf(pose.axle)).toBeCloseTo(0, 9);
      expect(pose.wheelCenter[1]).toBeCloseTo(0.75 - 0.35 * (1 - Math.cos(theta)), 9);
      expect(pose.wheelCenter[2]).toBeCloseTo(0.3 + 0.35 * Math.sin(theta), 9);
    }
  });

  test("a short horizontal upper arm pulls the top inboard: negative camber in bump and in droop", () => {
    const bump = solveSuspension(shortUpper, 0.15, 0);
    const droop = solveSuspension(shortUpper, -0.15, 0);
    expect(camberOf(bump.axle)).toBeLessThan(-0.005);
    expect(camberOf(droop.axle)).toBeLessThan(-0.005);
  });

  test("the rack steers the wheel and every link keeps its length", () => {
    for (const g of [shortUpper, strut]) {
      const pose = solveSuspension(g, 0.05, 0.02);
      expect(Math.abs(toeOf(pose.axle) - toeOf(solveSuspension(g, 0.05, 0).axle))).toBeGreaterThan(0.03);
    }
  });

  test("a MacPherson strut shortens in bump and its kingpin axis runs through the top mount", () => {
    const rest = solveSuspension(strut, 0, 0);
    const bump = solveSuspension(strut, 0.12, 0);
    expect(bump.springLength).toBeLessThan(rest.springLength - 0.02);
    const k = bump.kingpinAxis;
    const toTop = [strut.strutTop[0] - (bump.kingpinPoint[0] ?? 0), strut.strutTop[1] - (bump.kingpinPoint[1] ?? 0), strut.strutTop[2] - (bump.kingpinPoint[2] ?? 0)];
    const len = Math.hypot(toTop[0] ?? 0, toTop[1] ?? 0, toTop[2] ?? 0);
    toTop.forEach((value, i) => expect(value / len).toBeCloseTo(k[i] ?? 0, 9));
  });
});

describe("createSuspensionTable", () => {
  test("matches direct solves and their derivatives between nodes", () => {
    for (const g of [shortUpper, strut]) {
      const table = createSuspensionTable(g, { thetaMin: -0.25, thetaMax: 0.3, rackTravel: 0.04 });
      const sample = createSuspensionSample();
      for (const [theta, rack] of [
        [0.0123, 0.0071],
        [-0.17, -0.021],
        [0.21, 0.033],
      ] as const) {
        table.sample(theta, rack, sample);
        const exact = solveSuspension(g, theta, rack);
        const h = 1e-4;
        const up = solveSuspension(g, theta + h, rack);
        const down = solveSuspension(g, theta - h, rack);
        for (let k = 0; k < 3; k++) {
          expect(Math.abs((sample.w[k] ?? 0) - (exact.wheelCenter[k] ?? 0))).toBeLessThan(2e-5);
          expect(Math.abs((sample.axle[k] ?? 0) - (exact.axle[k] ?? 0))).toBeLessThan(2e-4);
          expect(Math.abs((sample.dw[k] ?? 0) - ((up.wheelCenter[k] ?? 0) - (down.wheelCenter[k] ?? 0)) / (2 * h))).toBeLessThan(2e-3);
        }
        expect(Math.abs(sample.springLength - exact.springLength)).toBeLessThan(2e-5);
      }
    }
  });
});
