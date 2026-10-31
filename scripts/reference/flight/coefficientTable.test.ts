import { describe, expect, test } from "bun:test";

import { createCoefficientTable, evenBreakpoints } from "./coefficientTable";

describe("coefficient table", () => {
  test("hits breakpoints exactly and interpolates multilinearly between them", () => {
    // f(x, y, z) = 1 + 2x + 3y − z + xy is multilinear, so interpolation reproduces it everywhere inside.
    const xs = [0, 1, 3];
    const ys = [-1, 0.5, 2];
    const zs = [0, 10];
    const f = (x: number, y: number, z: number) => 1 + 2 * x + 3 * y - z + x * y;
    const values: number[] = [];
    for (const x of xs) for (const y of ys) for (const z of zs) values.push(f(x, y, z));
    const table = createCoefficientTable([{ breakpoints: xs }, { breakpoints: ys }, { breakpoints: zs }], values);
    expect(table.sample([1, 0.5, 10])).toBeCloseTo(f(1, 0.5, 10), 12);
    expect(table.sample([2.2, -0.3, 4])).toBeCloseTo(f(2.2, -0.3, 4), 12);
  });

  test("clamps or extends linearly past the ends, per axis", () => {
    const values = [0, 10, 20];
    const clamped = createCoefficientTable([{ breakpoints: [0, 1, 2] }], values);
    const linear = createCoefficientTable([{ breakpoints: [0, 1, 2], extrapolate: "linear" }], values);
    expect(clamped.sample([3])).toBe(20);
    expect(clamped.sample([-1])).toBe(0);
    expect(linear.sample([3])).toBeCloseTo(30, 12);
    expect(linear.sample([-1])).toBeCloseTo(-10, 12);
  });

  test("rejects a value count that does not match the axes", () => {
    expect(() => createCoefficientTable([{ breakpoints: [0, 1] }, { breakpoints: [0, 1, 2] }], [1, 2, 3])).toThrow();
  });

  test("evenBreakpoints spans both ends", () => {
    expect(evenBreakpoints(-10, 45, 12)).toEqual([-10, -5, 0, 5, 10, 15, 20, 25, 30, 35, 40, 45]);
  });
});
