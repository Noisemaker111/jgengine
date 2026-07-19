import { describe, expect, test } from "bun:test";
import { STASH_COMPLETE_BONUS, STASH_PAYOUT, stashPayout, stashesRemaining } from "./stashes";
import { STASH_SPOTS } from "../world/districts";

describe("vice-isle stash runs", () => {
  test("every stash pays the flat cash reward", () => {
    expect(stashPayout()).toBe(STASH_PAYOUT);
    expect(STASH_PAYOUT).toBeGreaterThan(0);
  });

  test("remaining count counts down from the authored total and floors at zero", () => {
    const total = STASH_SPOTS.length;
    expect(stashesRemaining(0)).toBe(total);
    expect(stashesRemaining(1)).toBe(total - 1);
    expect(stashesRemaining(total)).toBe(0);
    // A restore that somehow over-counts never reports a negative haul.
    expect(stashesRemaining(total + 3)).toBe(0);
  });

  test("clearing the isle is worth far more than any single stash", () => {
    expect(STASH_COMPLETE_BONUS).toBeGreaterThan(STASH_PAYOUT * STASH_SPOTS.length);
  });
});
