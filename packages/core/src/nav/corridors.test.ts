import { describe, expect, test } from "bun:test";

import { createCorridorField } from "./corridors";

describe("createCorridorField", () => {
  test("contains points inside a straight corridor and rejects points outside", () => {
    const field = createCorridorField([{ points: [[0, 0], [100, 0]], width: 10 }]);
    expect(field.contains(50, 3)).toBe(true);
    expect(field.contains(50, 4.99)).toBe(true);
    expect(field.contains(50, 20)).toBe(false);
    expect(field.contains(50, -20)).toBe(false);
  });

  test("clamp returns the input untouched inside, and a boundary point at half-width outside", () => {
    const field = createCorridorField([{ points: [[0, 0], [100, 0]], width: 10 }]);
    expect(field.clamp(50, 2)).toEqual([50, 2]);

    const [cx, cz] = field.clamp(50, 20);
    const distance = Math.hypot(cx - 50, cz - 0);
    expect(distance).toBeCloseTo(5, 6);
  });

  test("distanceToBoundary is signed: negative inside, positive outside", () => {
    const field = createCorridorField([{ points: [[0, 0], [100, 0]], width: 10 }]);
    expect(field.distanceToBoundary(50, 0)).toBeLessThan(0);
    expect(field.distanceToBoundary(50, 5)).toBeCloseTo(0, 6);
    expect(field.distanceToBoundary(50, 20)).toBeGreaterThan(0);
  });

  test("with multiple edges, the nearest one wins", () => {
    const field = createCorridorField([
      { points: [[0, 0], [100, 0]], width: 4 },
      { points: [[0, 50], [100, 50]], width: 4 },
    ]);
    const nearFirst = field.nearest(20, 5);
    expect(nearFirst?.edgeIndex).toBe(0);
    expect(nearFirst?.closest).toEqual([20, 0]);

    const nearSecond = field.nearest(20, 48);
    expect(nearSecond?.edgeIndex).toBe(1);
    expect(nearSecond?.closest).toEqual([20, 50]);
  });

  test("nearest is null for an empty edge list", () => {
    const field = createCorridorField([]);
    expect(field.nearest(0, 0)).toBeNull();
  });

  test("validates a corridor edge needs at least two centerline points", () => {
    expect(() => createCorridorField([{ points: [[0, 0]], width: 5 }])).toThrow(/at least two/);
  });

  test("validates corridor width must be positive", () => {
    expect(() => createCorridorField([{ points: [[0, 0], [1, 0]], width: 0 }])).toThrow(/positive/);
    expect(() => createCorridorField([{ points: [[0, 0], [1, 0]], width: -2 }])).toThrow(/positive/);
  });
});
