import { describe, expect, test } from "bun:test";

import { resolvePivotPosition } from "./gizmoPivot";

describe("resolvePivotPosition", () => {
  const a = { x: 0, y: 0, z: 0 };
  const b = { x: 10, y: 4, z: 2 };
  const c = { x: 4, y: 2, z: 8 };

  test("origin prefers the primary selection position", () => {
    expect(resolvePivotPosition([a, b, c], "origin", a)).toEqual(a);
    expect(resolvePivotPosition([a, b, c], "origin", b)).toEqual(b);
  });

  test("center is the arithmetic mean", () => {
    expect(resolvePivotPosition([a, b], "center", a)).toEqual({ x: 5, y: 2, z: 1 });
  });

  test("median is the per-axis median", () => {
    expect(resolvePivotPosition([a, b, c], "median", a)).toEqual({ x: 4, y: 2, z: 2 });
  });

  test("single selection collapses every pivot to the only point", () => {
    expect(resolvePivotPosition([b], "center", b)).toEqual(b);
    expect(resolvePivotPosition([b], "median", b)).toEqual(b);
    expect(resolvePivotPosition([b], "origin", b)).toEqual(b);
  });
});
