import { describe, expect, test } from "bun:test";

import { combineGravity, pointGravity, uniformGravity } from "./gravityField";

describe("gravity fields", () => {
  test("uniform gravity preserves the configured direction and magnitude", () => {
    expect(uniformGravity([3, -8, 1]).sample([100, 20, -30])).toEqual([3, -8, 1]);
  });

  test("point gravity pulls toward its center", () => {
    const field = pointGravity({ center: [0, 0, 0], strength: 10 });
    expect(field.sample([5, 0, 0])).toEqual([-10, 0, 0]);
  });

  test("combined fields add source vectors", () => {
    const field = combineGravity([uniformGravity([0, -9, 0]), uniformGravity([2, 0, -1])]);
    expect(field.sample([0, 0, 0])).toEqual([2, -9, -1]);
  });
});
