import { describe, expect, test } from "bun:test";

import { definedFields } from "./definedFields";

describe("definedFields", () => {
  test("drops undefined entries and keeps every set one, falsy values included", () => {
    const out = definedFields({ a: 1, b: undefined, c: 0, d: null, e: false, f: "" });
    expect(out).toEqual({ a: 1, c: 0, d: null, e: false, f: "" });
    expect(Object.hasOwn(out, "b")).toBe(false);
  });

  test("an all-undefined bag is empty", () => {
    expect(Object.keys(definedFields({ rotation: undefined, scale: undefined }))).toEqual([]);
  });
});
