import { describe, expect, test } from "bun:test";
import { createSelectCache, createSelectionHeat, HOT_SELECTION_WINDOW, readSelectSnapshot, selectionEqual } from "./selectSnapshot";

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

describe("selectionEqual", () => {
  test("compares arrays and plain objects by their values all the way down, records by identity", () => {
    const item = { id: "wire" };
    expect(selectionEqual([1, item], [1, item])).toBe(true);
    expect(selectionEqual([1, item], [1, { id: "wire" }])).toBe(true);
    expect(selectionEqual({ steps: [{ id: "a", done: true }] }, { steps: [{ id: "a", done: true }] })).toBe(true);
    expect(selectionEqual({ steps: [{ id: "a", done: true }] }, { steps: [{ id: "a", done: false }] })).toBe(false);
    expect(selectionEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(selectionEqual([1], { 0: 1 })).toBe(false);
    expect(selectionEqual(new Map(), new Map())).toBe(false);
    expect(selectionEqual(Number.NaN, Number.NaN)).toBe(true);
  });
});

describe("createSelectionHeat", () => {
  test("names a selection that changes on nearly every frame, and passes one that changes every few frames", () => {
    const fast = createSelectionHeat();
    let verdict: string | null = null;
    for (let frame = 1; frame <= HOT_SELECTION_WINDOW * 2 && verdict === null; frame += 1) verdict = fast.changed(frame, 0);
    expect(verdict).toBe("frame");
    const slow = createSelectionHeat();
    let said: string | null = null;
    for (let frame = 1; frame <= HOT_SELECTION_WINDOW * 10; frame += 3) said ??= slow.changed(frame, 0);
    expect(said).toBeNull();
  });

  test("names a selection that changes every simulation tick even when frames run far faster", () => {
    const heat = createSelectionHeat();
    let verdict: string | null = null;
    // 360 fps against a 60 Hz sim: a change every tick lands on one frame in six.
    for (let tick = 1; tick <= HOT_SELECTION_WINDOW * 2 && verdict === null; tick += 1) verdict = heat.changed(tick * 6, tick);
    expect(verdict).toBe("tick");
  });

  test("a short burst of changes, like a hit flash, is not a per-frame render", () => {
    const heat = createSelectionHeat();
    let said: string | null = null;
    for (let frame = 1; frame <= HOT_SELECTION_WINDOW / 2; frame += 1) said ??= heat.changed(frame, frame);
    for (let frame = HOT_SELECTION_WINDOW * 3; frame <= HOT_SELECTION_WINDOW * 3 + 5; frame += 1) said ??= heat.changed(frame, frame);
    expect(said).toBeNull();
  });
});
