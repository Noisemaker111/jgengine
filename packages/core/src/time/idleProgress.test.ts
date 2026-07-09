import { describe, expect, test } from "bun:test";
import {
  exponentialCatchUp,
  idleWindow,
  linearCatchUp,
  steppedCatchUp,
} from "@jgengine/core/time/idleProgress";

describe("idleWindow", () => {
  test("computes elapsed and effective seconds with no cap", () => {
    const result = idleWindow(0, 10_000);
    expect(result.elapsedSeconds).toBe(10);
    expect(result.effectiveSeconds).toBe(10);
    expect(result.capped).toBe(false);
  });

  test("caps effective seconds at maxSeconds and flags capped", () => {
    const result = idleWindow(0, 3_600_000, { maxSeconds: 1800 });
    expect(result.elapsedSeconds).toBe(3600);
    expect(result.effectiveSeconds).toBe(1800);
    expect(result.capped).toBe(true);
  });

  test("does not flag capped when elapsed is under maxSeconds", () => {
    const result = idleWindow(0, 1_000_000, { maxSeconds: 1800 });
    expect(result.capped).toBe(false);
    expect(result.effectiveSeconds).toBe(1000);
  });

  test("scales effective seconds by efficiency", () => {
    const result = idleWindow(0, 10_000, { efficiency: 0.5 });
    expect(result.elapsedSeconds).toBe(10);
    expect(result.effectiveSeconds).toBe(5);
  });

  test("efficiency floors at zero for negative values", () => {
    const result = idleWindow(0, 10_000, { efficiency: -2 });
    expect(result.effectiveSeconds).toBe(0);
  });

  test("negative elapsed time clamps to zero", () => {
    const result = idleWindow(10_000, 0);
    expect(result.elapsedSeconds).toBe(0);
    expect(result.effectiveSeconds).toBe(0);
    expect(result.capped).toBe(false);
  });

  test("combines cap and efficiency", () => {
    const result = idleWindow(0, 7_200_000, { maxSeconds: 3600, efficiency: 0.25 });
    expect(result.elapsedSeconds).toBe(7200);
    expect(result.capped).toBe(true);
    expect(result.effectiveSeconds).toBe(900);
  });
});

describe("linearCatchUp", () => {
  test("produces resources at a flat rate", () => {
    const result = linearCatchUp(60, { current: 100, ratePerSecond: 2 });
    expect(result).toBe(220);
  });

  test("clamps production at max", () => {
    const result = linearCatchUp(1000, { current: 0, ratePerSecond: 5, max: 100 });
    expect(result).toBe(100);
  });

  test("decays toward a min floor with negative rate", () => {
    const result = linearCatchUp(100, { current: 50, ratePerSecond: -1, min: 0 });
    expect(result).toBe(0);
  });

  test("decay stops short of the floor when time is limited", () => {
    const result = linearCatchUp(10, { current: 50, ratePerSecond: -1, min: 0 });
    expect(result).toBe(40);
  });

  test("negative seconds are treated as zero", () => {
    const result = linearCatchUp(-30, { current: 100, ratePerSecond: 5 });
    expect(result).toBe(100);
  });
});

describe("exponentialCatchUp", () => {
  test("grows current value by a per-second factor", () => {
    const result = exponentialCatchUp(3, { current: 100, factorPerSecond: 2 });
    expect(result).toBe(800);
  });

  test("clamps growth at max", () => {
    const result = exponentialCatchUp(10, { current: 10, factorPerSecond: 2, max: 500 });
    expect(result).toBe(500);
  });

  test("decays toward zero using a half-life-style factor", () => {
    const result = exponentialCatchUp(1, { current: 100, factorPerSecond: 0.5 });
    expect(result).toBe(50);
  });

  test("clamps decay at a min floor", () => {
    const result = exponentialCatchUp(10, { current: 100, factorPerSecond: 0.5, min: 10 });
    expect(result).toBe(10);
  });

  test("negative seconds are treated as zero", () => {
    const result = exponentialCatchUp(-5, { current: 100, factorPerSecond: 2 });
    expect(result).toBe(100);
  });

  test("negative factor floors at zero, collapsing to zero growth", () => {
    const result = exponentialCatchUp(3, { current: 100, factorPerSecond: -1 });
    expect(result).toBe(0);
  });
});

describe("steppedCatchUp", () => {
  test("runs exact whole steps with no remainder", () => {
    const seen: number[] = [];
    const result = steppedCatchUp(30, 10, (index) => seen.push(index));
    expect(result.steps).toBe(3);
    expect(result.remainderSeconds).toBe(0);
    expect(seen).toEqual([0, 1, 2]);
  });

  test("carries a fractional remainder forward", () => {
    const seen: number[] = [];
    const result = steppedCatchUp(35, 10, (index) => seen.push(index));
    expect(result.steps).toBe(3);
    expect(result.remainderSeconds).toBe(5);
    expect(seen).toEqual([0, 1, 2]);
  });

  test("maxSteps truncates run and remainder includes skipped whole steps", () => {
    const seen: number[] = [];
    const result = steppedCatchUp(95, 10, (index) => seen.push(index), 3);
    expect(result.steps).toBe(3);
    expect(result.remainderSeconds).toBe(65);
    expect(seen).toEqual([0, 1, 2]);
  });

  test("zero seconds runs no steps and reports zero remainder", () => {
    const result = steppedCatchUp(0, 10, () => {
      throw new Error("should not run");
    });
    expect(result.steps).toBe(0);
    expect(result.remainderSeconds).toBe(0);
  });

  test("negative seconds runs no steps and remainder floors at zero", () => {
    const result = steppedCatchUp(-20, 10, () => {
      throw new Error("should not run");
    });
    expect(result.steps).toBe(0);
    expect(result.remainderSeconds).toBe(0);
  });

  test("non-positive stepSeconds guards against infinite steps", () => {
    const result = steppedCatchUp(100, 0, () => {
      throw new Error("should not run");
    });
    expect(result.steps).toBe(0);
    expect(result.remainderSeconds).toBe(100);
  });
});

describe("idle window composed with linear catch-up", () => {
  test("computes resources gained while away, capped at 8h", () => {
    const lastSeenMs = 0;
    const nowMs = 12 * 3600 * 1000;
    const window = idleWindow(lastSeenMs, nowMs, { maxSeconds: 8 * 3600 });
    expect(window.capped).toBe(true);
    expect(window.effectiveSeconds).toBe(8 * 3600);

    const gained = linearCatchUp(window.effectiveSeconds, {
      current: 1000,
      ratePerSecond: 0.5,
      max: 20_000,
    });
    expect(gained).toBe(1000 + 0.5 * 8 * 3600);
  });
});
