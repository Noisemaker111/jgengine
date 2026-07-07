import { describe, expect, test } from "bun:test";

import { windField } from "./wind";

describe("windField", () => {
  test("is deterministic across identical inputs", () => {
    const a = windField({ direction: [2, 1], speed: 3, gust: 1.5, turbulence: 0.8, seed: "breeze" });
    const b = windField({ direction: [2, 1], speed: 3, gust: 1.5, turbulence: 0.8, seed: "breeze" });
    expect(a.at(4.2)).toEqual(b.at(4.2));
    expect(a.atPoint(11, -7, 4.2)).toEqual(b.atPoint(11, -7, 4.2));
    expect(a.strengthAt(11, -7, 4.2)).toBe(b.strengthAt(11, -7, 4.2));
  });

  test("normalizes base direction", () => {
    const field = windField({ direction: [3, 4], speed: 5 });
    expect(field.direction[0]).toBeCloseTo(0.6, 12);
    expect(field.direction[1]).toBeCloseTo(0.8, 12);
    expect(Math.hypot(field.direction[0], field.direction[1])).toBeCloseTo(1, 12);
  });

  test("guards zero-length direction to [1, 0]", () => {
    const field = windField({ direction: [0, 0] });
    expect(field.direction).toEqual([1, 0]);
  });

  test("with no gust and no turbulence, at is constant and equals direction*speed", () => {
    const field = windField({ direction: [0, 2], speed: 4 });
    const t0 = field.at(0);
    const t1 = field.at(1000);
    expect(t0).toEqual([0, 4]);
    expect(t1).toEqual(t0);
  });

  test("nonzero gust makes at vary over time", () => {
    const field = windField({ direction: [1, 0], speed: 2, gust: 3 });
    const t0 = field.at(0);
    const t1 = field.at(37);
    expect(t0).not.toEqual(t1);
  });

  test("atPoint with turbulence=0 equals at", () => {
    const field = windField({ direction: [1, 1], speed: 2, gust: 0.5 });
    expect(field.atPoint(19, -3, 6)).toEqual(field.at(6));
  });

  test("strengthAt equals hypot of atPoint", () => {
    const field = windField({ direction: [1, 2], speed: 2.5, gust: 1, turbulence: 0.6, seed: 9 });
    const [wx, wz] = field.atPoint(13, 8, 2.5);
    expect(field.strengthAt(13, 8, 2.5)).toBe(Math.hypot(wx, wz));
  });
});
