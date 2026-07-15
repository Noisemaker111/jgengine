import { describe, expect, test } from "bun:test";

import { createPerfAccumulator } from "./perfMarks";

describe("perf accumulator", () => {
  test("averages recorded marks per kind and resets on flush", () => {
    const acc = createPerfAccumulator();
    acc.record("raycast", 2);
    acc.record("raycast", 4);
    acc.record("rebuild", 10);
    const first = acc.flush();
    expect(first.raycastMs).toBe(3);
    expect(first.rebuildMs).toBe(10);
    expect(first.authoringMs).toBe(13);
    // Window reset — a second flush with no marks reads zero.
    const second = acc.flush();
    expect(second).toEqual({ raycastMs: 0, rebuildMs: 0, authoringMs: 0 });
  });

  test("ignores non-finite or negative timings", () => {
    const acc = createPerfAccumulator();
    acc.record("raycast", Number.NaN);
    acc.record("raycast", -5);
    acc.record("raycast", 6);
    expect(acc.flush().raycastMs).toBe(6);
  });
});
