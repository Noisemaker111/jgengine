import { expect, test } from "bun:test";

import { createSpoilage } from "./spoilage";

const rules = { raw_meat: { seconds: 600, into: "spoiled_meat" }, berry: { seconds: 60, into: null } };

test("a stack spoils one unit each time its timer runs out", () => {
  const spoilage = createSpoilage(rules);
  const meat = { key: "bag:0", itemId: "raw_meat", count: 3 };
  expect(spoilage.tick(599, [meat])).toEqual([]);
  expect(spoilage.left(meat)).toBe(1);
  expect(spoilage.tick(1, [meat])).toEqual([{ key: "bag:0", itemId: "raw_meat", into: "spoiled_meat", count: 1 }]);
  // The timer starts again for the next unit.
  expect(spoilage.left({ ...meat, count: 2 })).toBe(600);
  expect(spoilage.tick(1300, [{ ...meat, count: 2 }])).toEqual([{ key: "bag:0", itemId: "raw_meat", into: "spoiled_meat", count: 2 }]);
});

test("items without a rule never spoil, and a slot that changes item starts a fresh timer", () => {
  const spoilage = createSpoilage(rules);
  expect(spoilage.tick(10_000, [{ key: "bag:1", itemId: "stone", count: 5 }])).toEqual([]);
  expect(spoilage.left({ key: "bag:1", itemId: "stone", count: 5 })).toBeNull();
  spoilage.tick(50, [{ key: "bag:2", itemId: "berry", count: 4 }]);
  // The berries left the slot; meat moved in, so the berries' 50 s are gone.
  spoilage.tick(1, [{ key: "bag:2", itemId: "raw_meat", count: 1 }]);
  expect(spoilage.tick(15, [{ key: "bag:2", itemId: "berry", count: 4 }])).toEqual([]);
  expect(spoilage.tick(46, [{ key: "bag:2", itemId: "berry", count: 4 }])).toEqual([{ key: "bag:2", itemId: "berry", into: null, count: 1 }]);
});

test("timers survive a save", () => {
  const spoilage = createSpoilage(rules);
  const meat = { key: "bag:0", itemId: "raw_meat", count: 1 };
  spoilage.tick(500, [meat]);
  const again = createSpoilage(rules);
  again.restore(spoilage.snapshot());
  expect(again.tick(100, [meat])).toHaveLength(1);
});
