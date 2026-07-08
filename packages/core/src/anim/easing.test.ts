import { describe, expect, test } from "bun:test";
import {
  clamp01,
  easeInCubic,
  easeInOutCubic,
  easeInOutQuad,
  easeInQuad,
  easeOutBack,
  easeOutCubic,
  easeOutElastic,
  easeOutQuad,
  lerp,
  smoothstep,
  timedProgress,
  tween,
} from "./easing";

const MONOTONIC_EASINGS = {
  smoothstep,
  easeInQuad,
  easeOutQuad,
  easeInOutQuad,
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
} as const;

describe("lerp", () => {
  test("interpolates between endpoints", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  test("extrapolates outside [0,1]", () => {
    expect(lerp(0, 10, 2)).toBe(20);
    expect(lerp(0, 10, -1)).toBe(-10);
  });
});

describe("clamp01", () => {
  test("clamps to [0,1]", () => {
    expect(clamp01(-5)).toBe(0);
    expect(clamp01(5)).toBe(1);
    expect(clamp01(0.3)).toBeCloseTo(0.3);
  });
});

describe("monotonic easings", () => {
  for (const [name, fn] of Object.entries(MONOTONIC_EASINGS)) {
    test(`${name} maps 0 -> 0 and 1 -> 1`, () => {
      expect(fn(0)).toBeCloseTo(0, 10);
      expect(fn(1)).toBeCloseTo(1, 10);
    });

    test(`${name} is monotonic non-decreasing on [0,1]`, () => {
      let previous = fn(0);
      for (let i = 1; i <= 20; i += 1) {
        const t = i / 20;
        const value = fn(t);
        expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = value;
      }
    });

    test(`${name} clamps inputs outside [0,1]`, () => {
      expect(fn(-1)).toBeCloseTo(fn(0), 10);
      expect(fn(2)).toBeCloseTo(fn(1), 10);
    });
  }
});

describe("easeOutBack", () => {
  test("starts at 0 and ends at 1", () => {
    expect(easeOutBack(0)).toBeCloseTo(0, 10);
    expect(easeOutBack(1)).toBeCloseTo(1, 10);
  });

  test("overshoots past 1 before settling", () => {
    const samples = Array.from({ length: 50 }, (_, i) => easeOutBack(i / 49));
    expect(Math.max(...samples)).toBeGreaterThan(1);
  });

  test("clamps inputs outside [0,1]", () => {
    expect(easeOutBack(-1)).toBeCloseTo(easeOutBack(0), 10);
    expect(easeOutBack(2)).toBeCloseTo(easeOutBack(1), 10);
  });
});

describe("easeOutElastic", () => {
  test("starts at 0 and ends at 1", () => {
    expect(easeOutElastic(0)).toBe(0);
    expect(easeOutElastic(1)).toBe(1);
  });

  test("oscillates past 1 before settling", () => {
    const samples = Array.from({ length: 50 }, (_, i) => easeOutElastic(i / 49));
    expect(Math.max(...samples)).toBeGreaterThan(1);
  });

  test("clamps inputs outside [0,1]", () => {
    expect(easeOutElastic(-1)).toBeCloseTo(easeOutElastic(0), 10);
    expect(easeOutElastic(2)).toBeCloseTo(easeOutElastic(1), 10);
  });
});

describe("tween", () => {
  test("defaults to smoothstep easing", () => {
    expect(tween(0, 10, 0)).toBeCloseTo(0);
    expect(tween(0, 10, 1)).toBeCloseTo(10);
    expect(tween(0, 10, 0.5)).toBeCloseTo(5);
  });

  test("uses a supplied easing function", () => {
    expect(tween(0, 10, 0.5, easeInQuad)).toBeCloseTo(2.5);
  });

  test("clamps t before applying easing", () => {
    expect(tween(0, 10, -1)).toBeCloseTo(tween(0, 10, 0));
    expect(tween(0, 10, 2)).toBeCloseTo(tween(0, 10, 1));
  });
});

describe("timedProgress", () => {
  test("0 at start, 1 once duration has elapsed", () => {
    expect(timedProgress(1000, 1000, 500)).toBe(0);
    expect(timedProgress(1000, 1500, 500)).toBe(1);
  });

  test("interpolates linearly mid-duration", () => {
    expect(timedProgress(1000, 1250, 500)).toBeCloseTo(0.5);
  });

  test("clamps before start and past the end", () => {
    expect(timedProgress(1000, 900, 500)).toBe(0);
    expect(timedProgress(1000, 5000, 500)).toBe(1);
  });

  test("a non-positive duration resolves instantly", () => {
    expect(timedProgress(1000, 1000, 0)).toBe(1);
    expect(timedProgress(1000, 999, 0)).toBe(0);
  });
});
