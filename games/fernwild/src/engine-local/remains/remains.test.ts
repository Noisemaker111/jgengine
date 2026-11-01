// framework-ok: only Fernwild uses this; the second adopter extracts it (#2837)
import { describe, expect, test } from "bun:test";

import { createRemainsField } from "./remains";

describe("remains", () => {
  test("left where someone fell with what they carried, stacks of one item merged, nothing left for nothing carried", () => {
    const field = createRemainsField({ lastsSeconds: 60 });
    expect(field.leave({ owner: "a", at: [0, 0, 0], contents: [{ item: "stone", count: 0 }], now: 0 })).toBeNull();
    const left = field.leave({ owner: "a", at: [5, 1, 5], contents: [{ item: "stone", count: 3 }, { item: "wood", count: 2 }, { item: "stone", count: 4 }], now: 10 })!;
    expect(left.contents).toEqual([{ item: "stone", count: 7 }, { item: "wood", count: 2 }]);
    expect(left.until).toBe(70);
    expect(field.list()).toHaveLength(1);
  });

  test("the nearest within reach, optionally only the owner's", () => {
    const field = createRemainsField({ lastsSeconds: 60 });
    const far = field.leave({ owner: "a", at: [10, 0, 0], contents: [{ item: "x", count: 1 }], now: 0 })!;
    const near = field.leave({ owner: "b", at: [2, 0, 0], contents: [{ item: "x", count: 1 }], now: 0 })!;
    expect(field.nearest([0, 0, 0], 20)?.id).toBe(near.id);
    expect(field.nearest([0, 0, 0], 20, "a")?.id).toBe(far.id);
    expect(field.nearest([0, 0, 0], 1)).toBeNull();
  });

  test("taking gives what fits and keeps the rest; emptied remains are gone", () => {
    const field = createRemainsField({ lastsSeconds: 60 });
    const left = field.leave({ owner: "a", at: [0, 0, 0], contents: [{ item: "stone", count: 10 }, { item: "wood", count: 5 }], now: 0 })!;
    // Room for only four stones, and all the wood.
    const first = field.take(left.id, (stack) => (stack.item === "stone" ? 4 : stack.count));
    expect(first).toEqual([{ item: "stone", count: 4 }, { item: "wood", count: 5 }]);
    expect(field.list()[0]!.contents).toEqual([{ item: "stone", count: 6 }]);
    expect(field.take(left.id, (stack) => stack.count)).toEqual([{ item: "stone", count: 6 }]);
    expect(field.list()).toHaveLength(0);
    expect(field.take(left.id, (stack) => stack.count)).toEqual([]);
  });

  test("remains fall apart when their time is up, and a save brings back exactly what was lying", () => {
    const field = createRemainsField({ lastsSeconds: 60 });
    field.leave({ owner: "a", at: [0, 0, 0], contents: [{ item: "stone", count: 1 }], now: 0 });
    field.leave({ owner: "a", at: [1, 0, 0], contents: [{ item: "wood", count: 1 }], now: 30 });
    expect(field.expire(59)).toHaveLength(0);
    expect(field.expire(60).map((entry) => entry.contents[0]!.item)).toEqual(["stone"]);
    const saved = field.snapshot();
    const other = createRemainsField({ lastsSeconds: 60 });
    other.restore(saved);
    expect(other.list()).toEqual(field.list());
    // Ids keep counting from where the save left off.
    expect(other.leave({ owner: "a", at: [0, 0, 0], contents: [{ item: "x", count: 1 }], now: 61 })!.id).not.toBe(field.list()[0]!.id);
    other.reset();
    expect(other.list()).toHaveLength(0);
  });

  test("the payload kept with remains survives leave, list, nearest, a partial take and a save", () => {
    interface Drop {
      crateId: string;
      site: string;
      tier: string;
      releasedAt: number;
    }
    const drop: Drop = { crateId: "drop_1", site: "south_coast", tier: "white", releasedAt: 5 };
    const field = createRemainsField<Drop>({ lastsSeconds: 60 });
    const left = field.leave({ owner: drop.crateId, at: [4, 1, 4], contents: [{ item: "stone", count: 2 }], now: 5, data: drop });
    if (left === null) throw new Error("two stones are left where the crate was");
    expect(left.data).toEqual(drop);
    expect(field.list()[0]?.data).toEqual(drop);
    expect(field.nearest([4, 0, 4], 3)?.data).toEqual(drop);
    // Remains that survive a partial take keep their payload.
    expect(field.take(left.id, () => 1)).toEqual([{ item: "stone", count: 1 }]);
    expect(field.list()[0]?.data).toEqual(drop);
    const saved = field.snapshot();
    const other = createRemainsField<Drop>({ lastsSeconds: 60 });
    other.restore(saved);
    expect(other.list()[0]?.data).toEqual(drop);
    expect(other.nearest([4, 0, 4], 3)?.data).toEqual(drop);
    // Emptied remains are gone, and expiring hands back what was kept with them.
    expect(other.take(left.id, (stack) => stack.count)).toEqual([{ item: "stone", count: 1 }]);
    expect(other.list()).toHaveLength(0);
    other.leave({ owner: "b", at: [0, 0, 0], contents: [{ item: "wood", count: 1 }], now: 10, data: { ...drop, crateId: "drop_2", tier: "red" } });
    expect(other.expire(1000).map((entry) => entry.data?.crateId)).toEqual(["drop_2"]);
  });

  test("a plain field carries no payload, so its callers and saves are unchanged", () => {
    const field = createRemainsField({ lastsSeconds: 60 });
    const left = field.leave({ owner: "a", at: [0, 0, 0], contents: [{ item: "stone", count: 1 }], now: 0 });
    if (left === null) throw new Error("a stone is left where the owner fell");
    expect(left.data).toBeUndefined();
    expect(field.nearest([0, 0, 0], 1)?.data).toBeUndefined();
    expect(field.snapshot().remains[0]?.data).toBeUndefined();
  });
});
