import { describe, expect, test } from "bun:test";
import { createSelectCache, readSelectSnapshot } from "./selectSnapshot";

describe("readSelectSnapshot", () => {
  test("returns the first computed value and caches it", () => {
    const cache = createSelectCache<number>();
    let calls = 0;
    const value = readSelectSnapshot(cache, () => {
      calls += 1;
      return 7;
    });
    expect(value).toBe(7);
    expect(calls).toBe(1);
    expect(cache.ready).toBe(true);
    expect(cache.value).toBe(7);
  });

  test("bails out with the previous reference when equal", () => {
    const cache = createSelectCache<{ n: number }>();
    const first = { n: 1 };
    const kept = readSelectSnapshot(cache, () => first);
    const second = { n: 1 };
    const again = readSelectSnapshot(
      cache,
      () => second,
      (previous, next) => previous.n === next.n,
    );
    expect(again).toBe(kept);
    expect(again).toBe(first);
    expect(again).not.toBe(second);
  });

  test("replaces the cache when equality fails", () => {
    const cache = createSelectCache<number>();
    expect(readSelectSnapshot(cache, () => 1)).toBe(1);
    expect(readSelectSnapshot(cache, () => 2)).toBe(2);
    expect(cache.value).toBe(2);
  });

  test("default equality is Object.is", () => {
    const cache = createSelectCache<string>();
    const a = readSelectSnapshot(cache, () => "hp");
    const b = readSelectSnapshot(cache, () => "hp");
    expect(b).toBe(a);
    const c = readSelectSnapshot(cache, () => "mp");
    expect(c).toBe("mp");
    expect(c).not.toBe(a);
  });
});
