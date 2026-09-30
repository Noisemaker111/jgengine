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
  type DurabilityState,
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

  test("NaN wear is rejected before changing a broken state", () => {
    const broken = applyWear(createDurability(sword), 100);
    expect(() => applyWear(broken, Number.NaN)).toThrow();
    expect(() => wear(sword, broken, "use", Number.NaN)).toThrow();
    expect(() => wear({ ...sword, wearPerUse: Number.NaN }, broken, "use")).toThrow();
    expect(() => wear({ ...sword, wearPerHit: Number.NaN }, broken, "hit")).toThrow();
    expect(broken).toEqual({ current: 0, max: 100 });
    expect(isBroken(broken)).toBe(true);
    expect(isDisabled(sword, broken)).toBe(true);
  });

  test("finite nonpositive wear remains a no-op", () => {
    const state = wear(sword, createDurability(sword), "use");
    for (const amount of [0, -1, -0.5]) {
      expect(applyWear(state, amount)).toBe(state);
      expect(wear(sword, state, "use", amount)).toBe(state);
    }
    expect(wear({ ...sword, wearPerUse: 0 }, state, "use")).toBe(state);
    expect(wear({ ...sword, wearPerHit: -2 }, state, "hit")).toBe(state);
    expect(state).toEqual({ current: 95, max: 100 });
  });

  test("tracker rejects NaN wear without enabling a broken item and survives JSON reload", () => {
    const tracker = createDurabilityTracker();
    const instanceId = "sword#1";
    tracker.init(instanceId, sword);
    expect(tracker.wear(instanceId, sword, "use", 20)).toEqual({ current: 0, max: 100 });
    const broken = tracker.get(instanceId);

    expect(() => tracker.wear(instanceId, sword, "use", Number.NaN)).toThrow();
    expect(tracker.get(instanceId)).toBe(broken);
    expect(tracker.isDisabled(instanceId, sword)).toBe(true);
    expect(tracker.isDisabled(instanceId, { ...sword, disableAtZero: false })).toBe(false);

    const saved = JSON.parse(JSON.stringify({ instanceId, state: tracker.get(instanceId) })) as {
      instanceId: string;
      state: DurabilityState;
    };
    expect(saved).toEqual({ instanceId: "sword#1", state: { current: 0, max: 100 } });
    const reloaded = createDurabilityTracker();
    reloaded.set(saved.instanceId, saved.state);
    expect(reloaded.get(instanceId)).toEqual({ current: 0, max: 100 });
    expect(isBroken(reloaded.get(instanceId)!)).toBe(true);
    expect(reloaded.isDisabled(instanceId, sword)).toBe(true);
    expect(reloaded.isDisabled(instanceId, { ...sword, disableAtZero: false })).toBe(false);
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

  for (const to of [Number.NaN, Infinity, -Infinity]) {
    test(`repair rejects target ${to} without committing invalid state or material quantities`, () => {
      const tracker = createDurabilityTracker();
      const instanceId = "sword#1";
      tracker.init(instanceId, sword);
      tracker.wear(instanceId, sword, "use", 20);
      const quote = repairQuote(sword, tracker.get(instanceId)!, { station: "anvil", to });
      if (quote !== null) tracker.set(instanceId, quote.state);
      expect(quote).toBeNull();
      expect(tracker.get(instanceId)).toEqual({ current: 0, max: 100 });
      expect(tracker.isDisabled(instanceId, sword)).toBe(true);

      const saved = JSON.parse(JSON.stringify({ instanceId, state: tracker.get(instanceId) })) as {
        instanceId: string;
        state: DurabilityState;
      };
      expect(saved).toEqual({ instanceId: "sword#1", state: { current: 0, max: 100 } });
      const reloaded = createDurabilityTracker();
      reloaded.set(saved.instanceId, saved.state);
      expect(reloaded.isDisabled(instanceId, sword)).toBe(true);
      expect(reloaded.get(instanceId)).toEqual({ current: 0, max: 100 });

      expect(repairQuote(sword, saved.state, { station: "campfire" })).toBeNull();
      const valid = repairQuote(sword, saved.state, { station: "anvil", to: 40 });
      expect(valid).toEqual({
        materials: [{ item: "iron_ingot", count: 4 }],
        restored: 40,
        state: { current: 40, max: 96 },
      });
      reloaded.set(saved.instanceId, valid!.state);
      expect(reloaded.isDisabled(instanceId, sword)).toBe(false);
    });
  }

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
