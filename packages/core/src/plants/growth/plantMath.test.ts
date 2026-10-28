import { describe, expect, test } from "bun:test";
import { plantAcos, plantAtan, plantAtan2, plantCos, plantExp, plantLog, plantPow, plantSin } from "./plantMath";

function bitsOf(x: number): string {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  return view.getBigUint64(0).toString(16).padStart(16, "0");
}

// Recorded in bun (JSC); plantGrowth.browser.test.ts checks Chrome (V8) computes the same bits.
const PLANT_MATH_BITS: readonly (readonly [name: string, fn: (x: number) => number, input: number, bits: string])[] = [
  ["exp", plantExp, -3.7, "3f99511fc6871044"],
  ["exp", plantExp, -0.5, "3fe368b2fc6f960a"],
  ["exp", plantExp, 0.1, "3ff1aec7b35a00d4"],
  ["exp", plantExp, 1, "4005bf0a8b14576a"],
  ["exp", plantExp, 12.5, "411060c52565ba66"],
  ["log", plantLog, 0.003, "c0173c8ffae4bedd"],
  ["log", plantLog, 0.5, "bfe62e42fefa39ef"],
  ["log", plantLog, 1.5, "3fd9f323ecbf984c"],
  ["log", plantLog, 12345.678, "4022d79559791e31"],
  ["sin", plantSin, -2.5, "bfe326af0dcfcab0"],
  ["sin", plantSin, 1, "3feaed548f090cee"],
  ["sin", plantSin, 100, "bfe03425b78c4db9"],
  ["cos", plantCos, 0.3, "3fee921dd42f09ba"],
  ["cos", plantCos, 3, "bfefae04be85e5d2"],
  ["atan", plantAtan, -4, "bff5368c951e9cfc"],
  ["atan", plantAtan, 7.5, "3ff7030cf9403196"],
  ["acos", plantAcos, -0.9, "400586476251e745"],
  ["acos", plantAcos, 0.35, "3ff3695eda01be1f"],
];

describe("plantMath", () => {
  test("gives fixed bit patterns", () => {
    for (const [name, fn, input, bits] of PLANT_MATH_BITS) expect(`${name}(${input}) ${bitsOf(fn(input))}`).toBe(`${name}(${input}) ${bits}`);
    expect(bitsOf(plantPow(2.5, 1.15))).toBe("4006f25d8f57abfc");
    expect(bitsOf(plantAtan2(-1.5, 0.25))).toBe("bff67d8863bc99bc");
  });

  test("matches Math to about 1e-14", () => {
    for (let i = 0; i < 400; i += 1) {
      const x = -20 + i * 0.1013;
      expect(Math.abs(plantExp(x) - Math.exp(x))).toBeLessThanOrEqual(1e-14 * Math.exp(x));
      expect(Math.abs(plantSin(x) - Math.sin(x))).toBeLessThan(1e-14);
      expect(Math.abs(plantCos(x) - Math.cos(x))).toBeLessThan(1e-14);
      expect(Math.abs(plantAtan(x) - Math.atan(x))).toBeLessThan(1e-14);
      const y = 1e-6 + i * 37.5;
      expect(Math.abs(plantLog(y) - Math.log(y))).toBeLessThan(1e-14 * Math.max(1, Math.abs(Math.log(y))));
      const c = -1 + i / 200;
      expect(Math.abs(plantAcos(c) - Math.acos(c))).toBeLessThan(1e-7);
    }
  });

  test("handles the edges", () => {
    expect(plantExp(-800)).toBe(0);
    expect(plantExp(800)).toBe(Number.POSITIVE_INFINITY);
    expect(plantLog(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(Number.isNaN(plantLog(-1))).toBe(true);
    expect(plantPow(0, 2.3)).toBe(0);
    expect(plantPow(7, 0)).toBe(1);
  });
});
