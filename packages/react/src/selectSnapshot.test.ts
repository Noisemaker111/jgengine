import { describe, expect, test } from "bun:test";
import { createSelectCache, createSelectionRate, HOT_SELECTION_CHANGES, readSelectSnapshot, shallowEqual } from "./selectSnapshot";

describe("readSelectSnapshot", () => {
  test("returns the first computed value and caches it", () => {
    const cache = createSelectCache<number, number>();
    let calls = 0;
    const value = readSelectSnapshot(cache, 0, () => {
      calls += 1;
      return 7;
    });
    expect(value).toBe(7);
    expect(calls).toBe(1);
    expect(cache.ready).toBe(true);
    expect(cache.value).toBe(7);
  });

  test("does not recompute while the store snapshot is unchanged", () => {
    const cache = createSelectCache<number, number>();
    let calls = 0;
    const select = () => {
      calls += 1;
      return 42;
    };
    readSelectSnapshot(cache, 3, select);
    readSelectSnapshot(cache, 3, select);
    readSelectSnapshot(cache, 3, select);
    expect(calls).toBe(1);
  });

  test("array selector returns a stable reference across repeated reads on an unchanged store", () => {
    const cache = createSelectCache<number, number[]>();
    const first = readSelectSnapshot(cache, 1, () => [1, 2, 3]);
    const second = readSelectSnapshot(cache, 1, () => [1, 2, 3]);
    const third = readSelectSnapshot(cache, 1, () => [1, 2, 3]);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  test("recomputes when the store snapshot changes", () => {
    const cache = createSelectCache<number, number[]>();
    const first = readSelectSnapshot(cache, 1, () => [1]);
    const next = readSelectSnapshot(cache, 2, () => [1, 2]);
    expect(next).not.toBe(first);
    expect(next).toEqual([1, 2]);
  });

  test("keeps the previous reference when a changed snapshot selects an equal value", () => {
    const cache = createSelectCache<number, { n: number }>();
    const first = readSelectSnapshot(cache, 1, () => ({ n: 1 }));
    const again = readSelectSnapshot(
      cache,
      2,
      () => ({ n: 1 }),
      (previous, next) => previous.n === next.n,
    );
    expect(again).toBe(first);
    expect(cache.snapshot).toBe(2);
  });

  test("a selection of the same fields in a new object or array is no change", () => {
    const cache = createSelectCache<number, { mode: string; panel: string | null }>();
    const first = readSelectSnapshot(cache, 1, () => ({ mode: "dive", panel: null }));
    expect(readSelectSnapshot(cache, 2, () => ({ mode: "dive", panel: null }))).toBe(first);
    expect(readSelectSnapshot(cache, 3, () => ({ mode: "home", panel: null }))).toEqual({ mode: "home", panel: null });
  });
});

describe("shallowEqual", () => {
  test("compares one level of arrays and plain objects by identity", () => {
    const item = { id: "wire" };
    expect(shallowEqual([1, item], [1, item])).toBe(true);
    expect(shallowEqual([1, item], [1, { id: "wire" }])).toBe(false);
    expect(shallowEqual({ a: 1, b: item }, { a: 1, b: item })).toBe(true);
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(shallowEqual([1], { 0: 1 })).toBe(false);
    expect(shallowEqual(new Map(), new Map())).toBe(false);
    expect(shallowEqual(Number.NaN, Number.NaN)).toBe(true);
  });
});

describe("createSelectionRate", () => {
  test("says once when a selection changes about every frame, and not for a slow one", () => {
    let at = 0;
    const fast = createSelectionRate(() => at);
    const reports: boolean[] = [];
    for (let frame = 0; frame < HOT_SELECTION_CHANGES * 2; frame += 1) {
      at += 16;
      reports.push(fast.changed());
    }
    expect(reports.filter(Boolean).length).toBe(1);
    const slow = createSelectionRate(() => at);
    let said = false;
    for (let tick = 0; tick < 200; tick += 1) {
      at += 250;
      said ||= slow.changed();
    }
    expect(said).toBe(false);
  });
});
