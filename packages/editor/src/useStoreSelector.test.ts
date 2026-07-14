import { describe, expect, test } from "bun:test";

import { shallowArrayEqual, virtualWindow } from "./useStoreSelector";

describe("shallowArrayEqual", () => {
  test("compares by identity and length", () => {
    const a = ["x", "y"];
    expect(shallowArrayEqual(a, a)).toBe(true);
    expect(shallowArrayEqual(["x", "y"], ["x", "y"])).toBe(true);
    expect(shallowArrayEqual(["x"], ["x", "y"])).toBe(false);
    expect(shallowArrayEqual(["x", "y"], ["x", "z"])).toBe(false);
  });
});

describe("virtualWindow", () => {
  test("mounts only the visible rows plus overscan", () => {
    const win = virtualWindow(0, 200, 20, 1000, 5);
    expect(win.start).toBe(0);
    expect(win.end).toBe(200 / 20 + 5); // 10 visible + 5 overscan
    expect(win.offsetTop).toBe(0);
    expect(win.totalHeight).toBe(20000);
  });

  test("scrolling advances the window and offset", () => {
    const win = virtualWindow(1000, 200, 20, 1000, 5);
    expect(win.start).toBe(1000 / 20 - 5); // first row 50, minus overscan
    expect(win.offsetTop).toBe(win.start * 20);
    expect(win.end).toBeLessThanOrEqual(1000);
  });

  test("clamps past the end and never exceeds the row count", () => {
    const win = virtualWindow(1_000_000, 200, 20, 1000, 5);
    expect(win.end).toBe(1000);
    expect(win.start).toBeGreaterThanOrEqual(0);
    expect(win.start).toBeLessThan(1000);
  });

  test("degenerate inputs render the whole (tiny) list", () => {
    expect(virtualWindow(0, 0, 20, 5).end).toBe(5);
    expect(virtualWindow(0, 200, 0, 5).end).toBe(5);
    expect(virtualWindow(0, 200, 20, 0)).toEqual({ start: 0, end: 0, offsetTop: 0, totalHeight: 0 });
  });
});
