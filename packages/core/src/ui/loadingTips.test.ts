import { describe, expect, test } from "bun:test";

import { createTipRotation } from "@jgengine/core/ui/loadingTips";

const TIPS = ["Parry the second swing", "Doors open from the inside", "Sell spare ore in town"];

describe("createTipRotation", () => {
  test("starts on a deterministic tip for a seed", () => {
    const first = createTipRotation({ tips: TIPS, seed: "gate" }).current();
    const second = createTipRotation({ tips: TIPS, seed: "gate" }).current();
    expect(first).not.toBeNull();
    expect(second).toBe(first);
  });

  test("next cycles every tip once before repeating", () => {
    const rotation = createTipRotation({ tips: TIPS, seed: "cycle" });
    const seen = new Set<string | null>([rotation.current()]);
    seen.add(rotation.next());
    seen.add(rotation.next());
    expect(seen.size).toBe(3);
    expect(seen.has(null)).toBe(false);
    expect(rotation.next()).toBe(rotation.current());
  });

  test("an empty tip list has no current tip", () => {
    const rotation = createTipRotation({ tips: [] });
    expect(rotation.current()).toBeNull();
    expect(rotation.next()).toBeNull();
    expect(rotation.index()).toBe(-1);
  });

  test("reset returns to the first tip of the same order", () => {
    const rotation = createTipRotation({ tips: TIPS, seed: "reset" });
    const first = rotation.current();
    rotation.next();
    rotation.reset();
    expect(rotation.current()).toBe(first);
  });

  test("snapshot/restore round-trips the cursor", () => {
    const rotation = createTipRotation({ tips: TIPS, seed: "snap" });
    rotation.next();
    const snapshot = rotation.snapshot();
    const copy = createTipRotation({ tips: TIPS, seed: "snap" });
    copy.restore(snapshot);
    expect(copy.snapshot()).toEqual(snapshot);
    expect(copy.current()).toBe(rotation.current());
  });

  test("restore rejects an order that no longer matches the tips", () => {
    const rotation = createTipRotation({ tips: TIPS, seed: "guard" });
    rotation.restore({ order: [0, 0, 0], cursor: 9 });
    expect(rotation.snapshot().order).toHaveLength(3);
    expect(rotation.snapshot().cursor).toBe(0);
  });

  test("notifies subscribers on next and reset", () => {
    const rotation = createTipRotation({ tips: TIPS });
    let changes = 0;
    rotation.subscribe(() => (changes += 1));
    rotation.next();
    rotation.reset();
    expect(changes).toBe(2);
  });
});
