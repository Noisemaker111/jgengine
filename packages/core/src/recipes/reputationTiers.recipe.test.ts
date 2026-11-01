import { expect, test } from "bun:test";

import { crossThresholds, tierAt } from "../parts";

/**
 * @recipe Reputation tiers
 * A Ladder over a standing number, with a dead band so a value hovering on a line does not flip the tier back and forth.
 */
test("reputation tiers", () => {
  const tiers = [{ id: "hostile", at: -100 }, { id: "neutral", at: -10 }, { id: "friendly", at: 25 }];
  let standing = 20;
  const shift = (by: number) => {
    const changed = crossThresholds(tiers, standing, standing + by, { hysteresis: 5 }).map((c) => `${c.id}:${c.direction}`);
    standing += by;
    return changed;
  };

  expect(tierAt(tiers, standing)?.id).toBe("neutral");
  expect(shift(6)).toEqual([]);
  expect(shift(5)).toEqual(["friendly:up"]);
  expect(shift(-8)).toEqual([]);
  expect(shift(-10)).toEqual(["friendly:down"]);
});
