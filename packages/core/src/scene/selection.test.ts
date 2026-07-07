import { describe, expect, test } from "bun:test";
import {
  createSelectionSet,
  isMarquee,
  rectContainsPoint,
  screenRect,
  selectWithinRect,
} from "@jgengine/core/scene/selection";

describe("selection math", () => {
  test("screenRect normalizes corners in any order", () => {
    expect(screenRect(30, 40, 10, 20)).toEqual({ minX: 10, minY: 20, maxX: 30, maxY: 40 });
  });

  test("rectContainsPoint tests inclusive bounds", () => {
    const rect = screenRect(0, 0, 10, 10);
    expect(rectContainsPoint(rect, 5, 5)).toBe(true);
    expect(rectContainsPoint(rect, 11, 5)).toBe(false);
  });

  test("selectWithinRect returns ids inside the marquee", () => {
    const rect = screenRect(0, 0, 10, 10);
    const ids = selectWithinRect(
      [
        { id: "a", x: 5, y: 5 },
        { id: "b", x: 50, y: 50 },
        { id: "c", x: 9, y: 1 },
      ],
      rect,
    );
    expect(ids).toEqual(["a", "c"]);
  });

  test("isMarquee distinguishes a drag from a click", () => {
    expect(isMarquee(screenRect(0, 0, 1, 1))).toBe(false);
    expect(isMarquee(screenRect(0, 0, 20, 2))).toBe(true);
  });
});

describe("selection set", () => {
  test("add, toggle, replace and clear maintain membership", () => {
    const set = createSelectionSet();
    set.add("a");
    set.add("a");
    expect(set.list()).toEqual(["a"]);
    set.toggle("b");
    set.toggle("a");
    expect(set.has("a")).toBe(false);
    expect(set.size()).toBe(1);
    set.replace(["x", "y"]);
    expect(set.list()).toEqual(["x", "y"]);
    set.clear();
    expect(set.size()).toBe(0);
  });

  test("seeds from an initial iterable", () => {
    const set = createSelectionSet(["one", "two"]);
    expect(set.has("one")).toBe(true);
    expect(set.size()).toBe(2);
  });
});
