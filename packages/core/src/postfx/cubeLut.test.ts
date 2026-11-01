import { describe, expect, test } from "bun:test";

import { formatCubeLut, parseCubeLut } from "./cubeLut";

describe("cube LUT files", () => {
  test("round-trips a cube", () => {
    const size = 4;
    const data = new Uint8Array(size ** 3 * 3).map((_, index) => (index * 7) % 256);
    const parsed = parseCubeLut(formatCubeLut({ size, data }));
    expect(parsed.size).toBe(size);
    expect([...parsed.data]).toEqual([...data]);
  });
  test("rejects a wrong entry count and a 1D table", () => {
    expect(() => parseCubeLut("LUT_3D_SIZE 2\n0 0 0\n")).toThrow("expected 8 entries");
    expect(() => parseCubeLut("LUT_1D_SIZE 4\n")).toThrow("1D");
  });
});
