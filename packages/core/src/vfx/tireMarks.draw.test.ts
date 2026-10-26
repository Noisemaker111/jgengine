import { describe, expect, test } from "bun:test";

import { createTireMarks } from "@jgengine/core/physics/tireMarks";

import { writeTireMarkGeometry } from "./tireMarks.draw";

describe("writeTireMarkGeometry", () => {
  test("draws each live mark as a ground quad that fades with age", () => {
    const marks = createTireMarks({ lifetime: 10 });
    marks.press("car:2", 0, 0.02, 0, 1, 0.2, 0);
    marks.press("car:2", 0, 0.02, 1, 1, 0.2, 0);
    marks.press("car:2", 0, 0.02, 2, 1, 0.2, 5);
    const positions = new Float32Array(marks.capacity * 18);
    const colors = new Float32Array(marks.capacity * 24);
    expect(writeTireMarkGeometry(marks.marks(5), 5, 10, positions, colors)).toBe(12);
    // The strip is as wide as the wheel and lies on the ground.
    expect(Math.abs(positions[0]! - positions[3]!)).toBeCloseTo(0.2, 5);
    expect(positions[1]).toBeCloseTo(0.02, 5);
    // The older mark has faded halfway; the fresh one is at full darkness.
    expect(colors[3]!).toBeLessThan(colors[6 * 4 + 3]!);
    expect(colors[3]! / colors[6 * 4 + 3]!).toBeCloseTo(0.5, 5);
  });

  test("a mark past its lifetime draws nothing", () => {
    const marks = createTireMarks({ lifetime: 2 });
    marks.press("k", 0, 0, 0, 1, 0.2, 0);
    marks.press("k", 0, 0, 1, 1, 0.2, 0);
    const positions = new Float32Array(18);
    const colors = new Float32Array(24);
    expect(writeTireMarkGeometry(marks.marks(0), 3, 2, positions, colors)).toBe(0);
  });
});
