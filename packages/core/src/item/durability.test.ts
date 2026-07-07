import { describe, expect, test } from "bun:test";

import {
  applyWear,
  canRepairAt,
  createDurability,
  createDurabilityTracker,
  durabilityFraction,
  isBroken,
  isDisabled,
  repairQuote,
  wear,
  type DurabilitySpec,
} from "./durability";

const sword: DurabilitySpec = {
  max: 100,
  wearPerUse: 5,
  wearPerHit: 2,
  repair: { materials: [{ item: "iron_ingot", perPoint: 0.1 }], station: "anvil", qualityLossPerRepair: 4 },
};

describe("durability", () => {
  test("createDurability starts full and clamps negative max", () => {
    expect(createDurability(sword)).toEqual({ current: 100, max: 100 });
    expect(createDurability({ max: -5 })).toEqual({ current: 0, max: 0 });
  });

  test("wear decrements by kind rate and floors at zero", () => {
    let state = createDurability(sword);
    state = wear(sword, state, "use");
    expect(state.current).toBe(95);
    state = wear(sword, state, "hit", 3);
    expect(state.current).toBe(89);
    state = applyWear(state, 1000);
    expect(state).toEqual({ current: 0, max: 100 });
  });

  test("isBroken and isDisabled respect disableAtZero", () => {
    const broken = { current: 0, max: 100 };
    expect(isBroken(broken)).toBe(true);
    expect(isDisabled(sword, broken)).toBe(true);
    expect(isDisabled({ max: 100, disableAtZero: false }, broken)).toBe(false);
  });

  test("durabilityFraction is a clamped ratio", () => {
    expect(durabilityFraction({ current: 50, max: 100 })).toBe(0.5);
    expect(durabilityFraction({ current: 0, max: 0 })).toBe(0);
  });

  test("canRepairAt gates on the station", () => {
    expect(canRepairAt(sword, "anvil")).toBe(true);
    expect(canRepairAt(sword, "campfire")).toBe(false);
    expect(canRepairAt({ max: 10 })).toBe(false);
    expect(canRepairAt({ max: 10, repair: { materials: [] } })).toBe(true);
  });

  test("repairQuote scales material cost with points restored and applies quality loss", () => {
    const worn = { current: 40, max: 100 };
    const quote = repairQuote(sword, worn, { station: "anvil" });
    expect(quote).not.toBeNull();
    expect(quote!.state.max).toBe(96);
    expect(quote!.state.current).toBe(96);
    expect(quote!.restored).toBe(56);
    expect(quote!.materials).toEqual([{ item: "iron_ingot", count: 6 }]);
  });

  test("repairQuote returns null off-station or without a repair spec", () => {
    expect(repairQuote(sword, { current: 40, max: 100 }, { station: "campfire" })).toBeNull();
    expect(repairQuote({ max: 100 }, { current: 40, max: 100 })).toBeNull();
  });

  test("repairQuote honors a partial `to` target", () => {
    const quote = repairQuote(sword, { current: 40, max: 100 }, { station: "anvil", to: 70 });
    expect(quote!.state.current).toBe(70);
    expect(quote!.restored).toBe(30);
  });

  test("tracker stores per-instance state and reports disabled", () => {
    const tracker = createDurabilityTracker();
    tracker.init("sword#1", sword);
    expect(tracker.get("sword#1")).toEqual({ current: 100, max: 100 });
    expect(tracker.wear("sword#1", sword, "use", 21)).toEqual({ current: 0, max: 100 });
    expect(tracker.isDisabled("sword#1", sword)).toBe(true);
    const quote = repairQuote(sword, tracker.get("sword#1")!, { station: "anvil" });
    tracker.set("sword#1", quote!.state);
    expect(tracker.isDisabled("sword#1", sword)).toBe(false);
    tracker.remove("sword#1");
    expect(tracker.get("sword#1")).toBeNull();
    expect(tracker.wear("missing", sword, "use")).toBeNull();
  });
});
