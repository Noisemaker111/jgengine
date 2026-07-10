import { describe, expect, test } from "bun:test";
import { hasLineOfSight, isPointDetected, type WallSegment } from "./visionCone";

describe("hasLineOfSight", () => {
  test("is clear with no walls", () => {
    expect(hasLineOfSight([0, 0, 0], [5, 0, 0], [])).toBe(true);
  });

  test("is blocked by a wall crossing the line", () => {
    const wall: WallSegment = { x1: 2, z1: -2, x2: 2, z2: 2 };
    expect(hasLineOfSight([0, 0, 0], [5, 0, 0], [wall])).toBe(false);
  });

  test("is clear when the wall does not cross the line", () => {
    const wall: WallSegment = { x1: 2, z1: 3, x2: 2, z2: 6 };
    expect(hasLineOfSight([0, 0, 0], [5, 0, 0], [wall])).toBe(true);
  });
});

describe("isPointDetected", () => {
  const baseInput = {
    observerPosition: [0, 0, 0] as const,
    observerHeading: 0,
    visionRadius: 6,
    visionAngleDeg: 90,
    walls: [] as WallSegment[],
    sneaking: false,
  };

  test("detects a target directly ahead within range", () => {
    expect(isPointDetected({ ...baseInput, targetPosition: [0, 0, 3] })).toBe(true);
  });

  test("does not detect a target behind the observer", () => {
    expect(isPointDetected({ ...baseInput, targetPosition: [0, 0, -3] })).toBe(false);
  });

  test("does not detect a target beyond vision range", () => {
    expect(isPointDetected({ ...baseInput, targetPosition: [0, 0, 20] })).toBe(false);
  });

  test("does not detect a target outside the cone angle", () => {
    expect(isPointDetected({ ...baseInput, visionAngleDeg: 30, targetPosition: [5, 0, 0.1] })).toBe(false);
  });

  test("does not detect through a wall even inside the cone", () => {
    const wall: WallSegment = { x1: -3, z1: 1.5, x2: 3, z2: 1.5 };
    expect(isPointDetected({ ...baseInput, targetPosition: [0, 0, 3], walls: [wall] })).toBe(false);
  });

  test("sneaking shrinks the effective detection radius", () => {
    const farInCone = { ...baseInput, targetPosition: [0, 0, 4] as const };
    expect(isPointDetected({ ...farInCone, sneaking: false })).toBe(true);
    expect(isPointDetected({ ...farInCone, sneaking: true })).toBe(false);
  });
});
