import { expect, test } from "bun:test";

import { crossThresholds, tierAt } from "../parts";

/**
 * @recipe Rank ladder
 * A Ladder over rating points names the rank, and the crossings between old and new points are the promotions.
 */
test("rank ladder", () => {
  const ranks = [{ id: "bronze", at: 0 }, { id: "silver", at: 100 }, { id: "gold", at: 300 }];
  let points = 90;
  const win = (gain: number) => {
    const promoted = crossThresholds(ranks, points, points + gain).map((c) => c.id);
    points += gain;
    return promoted;
  };

  expect(tierAt(ranks, points)?.id).toBe("bronze");
  expect(win(20)).toEqual(["silver"]);
  expect(win(250)).toEqual(["gold"]);
  expect(tierAt(ranks, points)?.id).toBe("gold");
  expect(crossThresholds(ranks, points, 50).map((c) => c.id)).toEqual(["gold", "silver"]);
});
