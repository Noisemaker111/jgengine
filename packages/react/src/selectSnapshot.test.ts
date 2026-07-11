import { describe, expect, test } from "bun:test";
import { createSelectCache, readSelectSnapshot } from "./selectSnapshot";

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
