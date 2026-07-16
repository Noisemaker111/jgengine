import { describe, expect, test } from "bun:test";

import { orphanRatchetViolations, parseBaseline } from "./orphanRatchet";

const REFERENCE = ["@jgengine/core/a#Foo", "@jgengine/core/b#Bar", "@jgengine/core/c#Baz"];

describe("orphan baseline shrink-only ratchet", () => {
  test("(a) removing an orphan (adopting/documenting it) passes", () => {
    const committed = ["@jgengine/core/a#Foo", "@jgengine/core/b#Bar"];
    const result = orphanRatchetViolations(REFERENCE, committed);
    expect(result.ok).toBe(true);
    expect(result.added).toEqual([]);
  });

  test("(a) an unchanged baseline passes", () => {
    expect(orphanRatchetViolations(REFERENCE, [...REFERENCE]).ok).toBe(true);
  });

  test("(b) introducing a new orphan without offsetting fails", () => {
    const committed = [...REFERENCE, "@jgengine/core/d#New"];
    const result = orphanRatchetViolations(REFERENCE, committed);
    expect(result.ok).toBe(false);
    expect(result.added).toEqual(["@jgengine/core/d#New"]);
  });

  test("(b) swapping one entry for another (net-flat count) still fails — set is shrink-only", () => {
    const committed = ["@jgengine/core/a#Foo", "@jgengine/core/b#Bar", "@jgengine/core/d#New"];
    const result = orphanRatchetViolations(REFERENCE, committed);
    expect(result.ok).toBe(false);
    expect(result.added).toEqual(["@jgengine/core/d#New"]);
  });

  test("(c) adding an entry to the baseline is rejected", () => {
    const committed = [...REFERENCE, "@jgengine/core/z#Sneaked"];
    const result = orphanRatchetViolations(REFERENCE, committed);
    expect(result.ok).toBe(false);
    expect(result.added).toContain("@jgengine/core/z#Sneaked");
  });

  test("parseBaseline rejects non-string-array baselines", () => {
    expect(() => parseBaseline('{"not":"an array"}')).toThrow();
    expect(() => parseBaseline("[1, 2, 3]")).toThrow();
    expect(parseBaseline('["ok#One"]')).toEqual(["ok#One"]);
  });
});
