import { describe, expect, test } from "bun:test";

import { createTireMarks } from "./tireMarks";

describe("createTireMarks", () => {
  test("a wheel lays a strip between presses and starts fresh after a lift", () => {
    const marks = createTireMarks();
    marks.press("a", 0, 0, 0, 1, 0.2, 0);
    expect(marks.marks(0)).toHaveLength(0);
    marks.press("a", 0, 0, 1, 1, 0.2, 0.1);
    marks.press("a", 0, 0, 1.1, 1, 0.2, 0.2);
    expect(marks.marks(0.2)).toHaveLength(1);
    marks.press("a", 0, 0, 2, 1, 0.2, 0.3);
    expect(marks.marks(0.3)).toHaveLength(2);
    marks.lift("a");
    marks.press("a", 0, 0, 3, 1, 0.2, 0.4);
    expect(marks.marks(0.4)).toHaveLength(2);
  });

  test("a teleport does not draw a strip across the map", () => {
    const marks = createTireMarks();
    marks.press("a", 0, 0, 0, 1, 0.2, 0);
    marks.press("a", 40, 0, 0, 1, 0.2, 0.1);
    expect(marks.marks(0.1)).toHaveLength(0);
  });

  test("the pool is fixed size and old marks fade out", () => {
    const marks = createTireMarks({ capacity: 16, lifetime: 5 });
    for (let i = 0; i <= 40; i += 1) marks.press("a", 0, 0, i, 1, 0.2, i * 0.1);
    const live = marks.marks(4);
    expect(live).toHaveLength(16);
    expect(live[0]!.born).toBeLessThan(live[15]!.born);
    expect(marks.marks(20)).toHaveLength(0);
  });

  test("snapshot/restore round-trips and reset clears", () => {
    const marks = createTireMarks();
    marks.press("a", 0, 0, 0, 0.8, 0.2, 0);
    marks.press("a", 0, 0, 1, 0.8, 0.2, 0);
    const before = marks.version();
    const copy = createTireMarks();
    copy.restore(marks.snapshot());
    expect(copy.marks(0)).toEqual(marks.marks(0));
    marks.reset();
    expect(marks.marks(0)).toHaveLength(0);
    expect(marks.version()).toBeGreaterThan(before);
  });
});
