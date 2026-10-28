import { describe, expect, test } from "bun:test";

import {
  BENCHMARK_BICYCLE,
  BENCHMARK_BICYCLE_EIGENVALUES as PUBLISHED,
  createWhippleBicycle,
  nonlinearWhippleEigenvalues,
  whippleCriticalSpeeds,
  whippleEigenvalues,
  whippleLinearCoefficients,
} from "./whippleBicycle";
import { matrixEigenvalues, type Eigenvalue } from "../../math/linearAlgebra";

function weaveOf(roots: readonly Eigenvalue[]): Eigenvalue | undefined {
  return roots.find((root) => root.im > 1e-9);
}

function realRoots(roots: readonly Eigenvalue[]): number[] {
  return roots.filter((root) => Math.abs(root.im) <= 1e-9).map((root) => root.re).sort((a, b) => b - a);
}

describe("Whipple bicycle — Meijaard, Papadopoulos, Ruina & Schwab (2007) benchmark", () => {
  test("the linear coefficient matrices match the paper's Table 2 values", () => {
    const { M, C1, K0, K2 } = whippleLinearCoefficients(BENCHMARK_BICYCLE);
    const close = (actual: readonly number[], expected: readonly number[]) => actual.forEach((value, k) => expect(value).toBeCloseTo(expected[k] ?? Number.NaN, 12));
    close(M, [80.81722, 2.31941332208709, 2.31941332208709, 0.29784188199686]);
    close(C1, [0, 33.86641391492494, -0.85035641456978, 1.68540397397560]);
    close(K0, [-80.95, -2.59951685249872, -2.59951685249872, -0.80329488458618]);
    close(K2, [0, 76.59734589573222, 0, 2.65431523794604]);
  });

  test("eigenvalues match the published ones at every tabulated speed to 1e-11", () => {
    for (let v = 0; v <= 10; v += 1) {
      const roots = whippleEigenvalues(v);
      const reals = realRoots(roots);
      expect(reals).toContainEqual(expect.closeTo(PUBLISHED.capsize[v] ?? Number.NaN, 11));
      expect(reals).toContainEqual(expect.closeTo(PUBLISHED.castering[v] ?? Number.NaN, 11));
      if (v === 0) {
        for (const value of PUBLISHED.standstill) expect(reals).toContainEqual(expect.closeTo(value, 11));
        continue;
      }
      const weave = weaveOf(roots);
      const [re, im] = PUBLISHED.weave[v - 1] ?? [Number.NaN, Number.NaN];
      expect(weave?.re).toBeCloseTo(re, 11);
      expect(weave?.im).toBeCloseTo(im, 11);
    }
  });

  test("weave, capsize and double-root speeds match the published values to 1e-12", () => {
    const speeds = whippleCriticalSpeeds();
    expect(speeds.doubleRoot).toBeCloseTo(PUBLISHED.doubleRootSpeed, 12);
    expect(speeds.weave).toBeCloseTo(PUBLISHED.weaveSpeed, 12);
    expect(speeds.capsize).toBeCloseTo(PUBLISHED.capsizeSpeed, 12);
    expect(weaveOf(whippleEigenvalues(PUBLISHED.weaveSpeed))?.im).toBeCloseTo(PUBLISHED.weaveFrequency, 10);
  });

  test("the nonlinear multibody bicycle, linearised numerically, gives the benchmark eigenvalues", () => {
    for (const v of [0, 2, PUBLISHED.weaveSpeed, 5, 8]) {
      const nonlinear = nonlinearWhippleEigenvalues(v).filter((root) => Math.hypot(root.re, root.im) > 1e-6);
      const linear = whippleEigenvalues(v);
      for (const root of linear) {
        const nearest = Math.min(...nonlinear.map((other) => Math.hypot(other.re - root.re, other.im - root.im)));
        expect(nearest).toBeLessThan(1e-8);
      }
    }
  });

  test("at small angles the nonlinear bicycle follows the linear model and conserves energy", () => {
    const v = 5;
    const leanRate = 0.01;
    const bike = createWhippleBicycle({ speed: v, leanRate });
    const { M, C1, K0, K2 } = whippleLinearCoefficients(BENCHMARK_BICYCLE);
    // Linear state-space A for [φ, δ, φ̇, δ̇], integrated by matrix exponential series.
    const det = (M[0] ?? 0) * (M[3] ?? 0) - (M[1] ?? 0) * (M[2] ?? 0);
    const inv = [(M[3] ?? 0) / det, -(M[1] ?? 0) / det, -(M[2] ?? 0) / det, (M[0] ?? 0) / det];
    const K = K0.map((value, k) => 9.81 * value + v * v * (K2[k] ?? 0));
    const C = C1.map((value) => v * value);
    const A = new Float64Array(16);
    A[2] = 1;
    A[7] = 1;
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        A[(2 + i) * 4 + j] = -((inv[i * 2] ?? 0) * (K[j] ?? 0) + (inv[i * 2 + 1] ?? 0) * (K[2 + j] ?? 0));
        A[(2 + i) * 4 + 2 + j] = -((inv[i * 2] ?? 0) * (C[j] ?? 0) + (inv[i * 2 + 1] ?? 0) * (C[2 + j] ?? 0));
      }
    }
    let x = [0, 0, leanRate, 0];
    const h = 1 / 2000;
    const f = (s: number[]) => [0, 1, 2, 3].map((i) => [0, 1, 2, 3].reduce((sum, j) => sum + (A[i * 4 + j] ?? 0) * (s[j] ?? 0), 0));
    const energy0 = bike.state().energy;
    let worst = 0;
    for (let i = 0; i < 2000; i++) {
      const k1 = f(x);
      const k2 = f(x.map((value, k) => value + (h / 2) * (k1[k] ?? 0)));
      const k3 = f(x.map((value, k) => value + (h / 2) * (k2[k] ?? 0)));
      const k4 = f(x.map((value, k) => value + h * (k3[k] ?? 0)));
      x = x.map((value, k) => value + (h / 6) * ((k1[k] ?? 0) + 2 * (k2[k] ?? 0) + 2 * (k3[k] ?? 0) + (k4[k] ?? 0)));
      const state = bike.step(h);
      worst = Math.max(worst, Math.abs(state.lean - (x[0] ?? 0)), Math.abs(state.steer - (x[1] ?? 0)));
    }
    expect(worst).toBeLessThan(1e-6);
    expect(Math.abs(bike.state().energy - energy0)).toBeLessThan(1e-9);
    // Self-stable at 5 m/s: the weave has died away within 6 s.
    expect(matrixEigenvalues(A, 4).every((root) => root.re < 0)).toBe(true);
  });

  test("snapshot and restore replay the same motion", () => {
    const bike = createWhippleBicycle({ speed: 3, lean: 0.05 });
    for (let i = 0; i < 200; i++) bike.step(1 / 1000, { steerTorque: 0.2 });
    const saved = bike.snapshot();
    const a: number[] = [];
    for (let i = 0; i < 200; i++) a.push(bike.step(1 / 1000).lean);
    bike.restore(saved);
    const b: number[] = [];
    for (let i = 0; i < 200; i++) b.push(bike.step(1 / 1000).lean);
    expect(b).toEqual(a);
  });
});
