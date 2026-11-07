import { describe, expect, test } from "bun:test";
import { createLiveSelectCache, createSelectCache, readLiveSnapshot, readSelectSnapshot, takeLiveLatest } from "./selectSnapshot";

describe("live selection (useGameStoreLive)", () => {
  type Chart = { markers: string[]; x: number };
  const sameShape = (a: Chart, b: Chart) => a.markers.join() === b.markers.join();

  test("a render keeps one selection while the shape holds; the writer gets every new one exactly once", () => {
    const cache = createLiveSelectCache<number, Chart>();
    const at = (version: number, x: number, markers = ["player"]) => readLiveSnapshot(cache, version, () => ({ markers, x }), sameShape);
    const first = at(1, 0);
    expect(takeLiveLatest(cache, true)?.value.x).toBe(0);
    expect(takeLiveLatest(cache, true)).toBeNull();
    // The player moves: same shape, so a render keeps the first selection while the writer gets the move.
    expect(at(2, 5)).toBe(first);
    expect(takeLiveLatest(cache, true)?.value.x).toBe(5);
    expect(takeLiveLatest(cache, true)).toBeNull();
    // After a render the writer places the newest selection again, for elements that render mounted.
    expect(takeLiveLatest(cache, false)?.value.x).toBe(5);
    // A new marker changes the shape: a render now shows the new selection.
    const grown = at(3, 6, ["player", "cop"]);
    expect(grown).not.toBe(first);
    expect(grown.x).toBe(6);
  });

  test("the selector runs once per store version", () => {
    const cache = createLiveSelectCache<number, Chart>();
    let calls = 0;
    const select = () => {
      calls += 1;
      return { markers: [], x: calls };
    };
    readLiveSnapshot(cache, 1, select, sameShape);
    readLiveSnapshot(cache, 1, select, sameShape);
    readLiveSnapshot(cache, 2, select, sameShape);
    expect(calls).toBe(2);
  });
});

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

  test("default equality is Object.is", () => {
    const cache = createSelectCache<number, string>();
    const a = readSelectSnapshot(cache, 1, () => "hp");
    const b = readSelectSnapshot(cache, 2, () => "hp");
    expect(b).toBe(a);
    const c = readSelectSnapshot(cache, 3, () => "mp");
    expect(c).toBe("mp");
    expect(c).not.toBe(a);
  });
});
