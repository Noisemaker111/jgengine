import { expect, test } from "bun:test";

import { createRefillSlots, evaluatePredicate, pickWeighted } from "../parts";
import { seededRng } from "../random/rng";

/**
 * @recipe Bounty board
 * Slots hold one bounty each and refill a while after one is done, a Table draws the next target, and a Requirement gates who may take it.
 */
test("bounty board", () => {
  const rng = seededRng("bounties");
  const board = createRefillSlots({ slots: ["a", "b", "c"], refillSeconds: [100, 100] }, rng);
  const targets = [{ name: "bandit", weight: 3 }, { name: "wolf king", weight: 1 }];
  const posted: Record<string, string> = {};
  const post = (now: number) => board.ready(now).forEach((slot) => ((posted[slot] = pickWeighted(rng, targets, (t) => t.weight)?.name ?? ""), board.fill(slot)));
  const take = (slot: string, renown: number, now: number) => {
    if (!board.isFilled(slot) || !evaluatePredicate({ gte: ["renown", 5] }, { renown })) return false;
    board.empty(slot, now);
    return true;
  };

  post(0);
  expect(Object.keys(posted)).toEqual(["a", "b", "c"]);
  expect(take("a", 2, 10)).toBe(false);
  expect(take("a", 8, 10)).toBe(true);
  post(50);
  expect(board.isFilled("a")).toBe(false);
  post(110);
  expect(board.isFilled("a")).toBe(true);
});
