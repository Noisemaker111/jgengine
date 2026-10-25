import { describe, expect, test } from "bun:test";
import {
  buildShopItems,
  canAffordPowerForHardware,
  canAffordPowerForHardwareQuantity,
  computeInstalledPowerDrawKw,
  computeStockedHardwarePowerDrawKw,
} from "@llmville/game/economy/storeTransition";
import { BUILD_CATALOG } from "@llmville/game/build/catalog";
import { getHardwareDefinition } from "@llmville/game/infrastructure/catalog";
import {
  BASE_POWER_CAPACITY_KW,
  type RackSnapshot,
} from "@llmville/game/infrastructure/infrastructure";

const STARTER_GPU = getHardwareDefinition("gpu_1");

const rack = (cards: number): RackSnapshot => ({
  rackId: "rack-1",
  rackType: "starter_rack",
  installedHardwareModuleIds: Array.from({ length: cards }, () => STARTER_GPU.id),
  installedCoolerId: null,
});

describe("power gating", () => {
  test("installed draw is measured at full activity", () => {
    expect(computeInstalledPowerDrawKw([rack(2)])).toBeCloseTo((2 * STARTER_GPU.tdpWatts) / 1000, 6);
  });

  test("stocked cards commit capacity too", () => {
    expect(computeStockedHardwarePowerDrawKw({ [STARTER_GPU.id]: 3 })).toBeCloseTo(
      (3 * STARTER_GPU.tdpWatts) / 1000,
      6,
    );
  });

  test("the starter hookup fits about six starter GPUs", () => {
    const drawOf = (cards: number) => (cards * STARTER_GPU.tdpWatts) / 1000;
    expect(canAffordPowerForHardware(STARTER_GPU, drawOf(11), BASE_POWER_CAPACITY_KW)).toBe(true);
    expect(canAffordPowerForHardware(STARTER_GPU, drawOf(12), BASE_POWER_CAPACITY_KW)).toBe(false);
    expect(canAffordPowerForHardwareQuantity(STARTER_GPU, 0, BASE_POWER_CAPACITY_KW, 12)).toBe(true);
    expect(canAffordPowerForHardwareQuantity(STARTER_GPU, 0, BASE_POWER_CAPACITY_KW, 13)).toBe(false);
  });

  test("a bigger hookup fits more", () => {
    expect(canAffordPowerForHardwareQuantity(STARTER_GPU, 0, 20, 100)).toBe(true);
  });
});

describe("buildShopItems", () => {
  test("prices and unlock rows cover decor as well as infrastructure", () => {
    const rows = buildShopItems();
    for (const item of BUILD_CATALOG) {
      expect(rows.some((row) => row.id === item.id)).toBe(true);
    }
    expect(rows.some((row) => row.kind === "decor")).toBe(true);
  });
});
