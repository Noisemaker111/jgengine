import { describe, expect, test } from "bun:test";

import { grounded } from "./grounded";

describe("grounded", () => {
  test("returns [x, groundY, z] from the world surface", () => {
    const ctx = {
      world: {
        groundHeightAt: (x: number, z: number) => x * 0.1 + z * 0.01,
      },
    };
    expect(grounded(ctx, 10, 20)).toEqual([10, 1.2, 20]);
  });
});
