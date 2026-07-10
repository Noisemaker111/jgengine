import { describe, expect, test } from "bun:test";
import { shortcutBranches, deceptiveBranchIds, forkBranches } from "../world/canyon";
import {
  INITIAL_SURGE_STATE,
  SURGE_MIN_SPEED,
  applySurge,
  detectSurgeTrigger,
  isSurging,
  surgeMultiplierAt,
} from "./surge";

describe("detectSurgeTrigger", () => {
  const shortcutId = shortcutBranches[0].id;
  const forkId = forkBranches[0].id;

  test("triggers on a clean, fast, centered entry into a deceptive shortcut", () => {
    expect(detectSurgeTrigger("main", shortcutId, SURGE_MIN_SPEED + 5, 0.5, deceptiveBranchIds)).toBe(true);
  });

  test("does not trigger entering a non-deceptive branch", () => {
    expect(detectSurgeTrigger("main", forkId, SURGE_MIN_SPEED + 5, 0.5, deceptiveBranchIds)).toBe(false);
  });

  test("does not trigger below the minimum speed", () => {
    expect(detectSurgeTrigger("main", shortcutId, SURGE_MIN_SPEED - 5, 0.5, deceptiveBranchIds)).toBe(false);
  });

  test("does not trigger when off-center past the tolerance", () => {
    expect(detectSurgeTrigger("main", shortcutId, SURGE_MIN_SPEED + 5, 10, deceptiveBranchIds)).toBe(false);
  });

  test("does not re-trigger while already on the same branch", () => {
    expect(detectSurgeTrigger(shortcutId, shortcutId, SURGE_MIN_SPEED + 5, 0.5, deceptiveBranchIds)).toBe(false);
  });
});

describe("surge lifecycle", () => {
  test("applySurge raises confidence and starts a timed window", () => {
    const state = applySurge(INITIAL_SURGE_STATE, 10);
    expect(state.confidence).toBeGreaterThan(0);
    expect(isSurging(state, 10)).toBe(true);
    expect(isSurging(state, 999)).toBe(false);
  });

  test("surgeMultiplierAt is 1 outside the surge window and >1 inside it", () => {
    const state = applySurge(INITIAL_SURGE_STATE, 10);
    expect(surgeMultiplierAt(state, 10.1)).toBeGreaterThan(1);
    expect(surgeMultiplierAt(state, 999)).toBe(1);
  });
});
