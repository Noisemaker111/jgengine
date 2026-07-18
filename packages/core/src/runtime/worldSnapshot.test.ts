import { describe, expect, test } from "bun:test";
import {
  applyWorldSnapshot,
  composeWorldSnapshot,
  type SnapshotModule,
} from "@jgengine/core/runtime/worldSnapshot";

function moduleFor(key: string, box: { value: unknown }): SnapshotModule {
  return {
    key,
    snapshot: () => box.value,
    hydrate: (data) => {
      box.value = data;
    },
  };
}

describe("world snapshot seam", () => {
  test("compose gathers one entry per registered module keyed by name", () => {
    const a = { value: 1 };
    const b = { value: "two" };
    const snap = composeWorldSnapshot([moduleFor("a", a), moduleFor("b", b)]);
    expect(snap).toEqual({ a: 1, b: "two" });
  });

  test("apply hydrates only keys present in the snapshot, leaving others untouched", () => {
    const a = { value: 1 };
    const b = { value: "keep" };
    applyWorldSnapshot([moduleFor("a", a), moduleFor("b", b)], { a: 99 });
    expect(a.value).toBe(99);
    expect(b.value).toBe("keep");
  });

  test("compose then apply roundtrips module state into a fresh set", () => {
    const src = { a: { value: [1, 2] }, b: { value: { n: 3 } } };
    const snap = composeWorldSnapshot([moduleFor("a", src.a), moduleFor("b", src.b)]);
    const dst = { a: { value: null as unknown }, b: { value: null as unknown } };
    applyWorldSnapshot([moduleFor("a", dst.a), moduleFor("b", dst.b)], snap);
    expect(dst.a.value).toEqual([1, 2]);
    expect(dst.b.value).toEqual({ n: 3 });
  });

  test("decode that returns null skips hydrate (fail soft)", () => {
    const box = { value: 1 };
    const module: SnapshotModule<number> = {
      key: "n",
      snapshot: () => box.value,
      decode: (raw) => (typeof raw === "number" ? raw : null),
      hydrate: (data) => {
        box.value = data;
      },
    };
    applyWorldSnapshot([module], { n: "garbage" });
    expect(box.value).toBe(1);
    applyWorldSnapshot([module], { n: 42 });
    expect(box.value).toBe(42);
  });
});
