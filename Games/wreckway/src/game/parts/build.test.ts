import { describe, expect, test } from "bun:test";
import type { InstalledPart } from "@jgengine/core/item/modularItem";

import { swapPart, tuningFrom } from "./build";
import { KART_DEF, partById, PARTS } from "./catalog";

describe("wreckway modular kart stats", () => {
  test("bare chassis has weak baseline stats and no capabilities", () => {
    const tuning = tuningFrom([]);
    expect(tuning.topSpeed).toBeCloseTo(KART_DEF.baseStats.topSpeed!, 5);
    expect(tuning.hasPlow).toBe(false);
    expect(tuning.jumpPower).toBe(0);
    expect(tuning.armorCharges).toBe(0);
  });

  test("installing the truck engine raises top speed and hurts handling", () => {
    const truckEngine = partById("truck_engine")!;
    const { installed } = swapPart([], truckEngine);
    const tuning = tuningFrom(installed);
    const bare = tuningFrom([]);
    expect(tuning.topSpeed).toBeGreaterThan(bare.topSpeed);
    expect(tuning.turnRate).toBeLessThan(bare.turnRate);
  });

  test("plow blade grants plow capability", () => {
    const plow = partById("plow_blade")!;
    const { installed } = swapPart([], plow);
    expect(tuningFrom(installed).hasPlow).toBe(true);
  });

  test("coil springs grant jump power", () => {
    const springs = partById("coil_springs")!;
    const { installed } = swapPart([], springs);
    expect(tuningFrom(installed).jumpPower).toBeGreaterThan(0);
  });

  test("armor-capable frame parts grant one armor charge", () => {
    const armor = partById("armor_plating")!;
    const { installed } = swapPart([], armor);
    expect(tuningFrom(installed).armorCharges).toBe(1);
  });

  test("swapping a second part into an occupied slot ejects the old part", () => {
    const hoodPlate = partById("hood_plate")!;
    const fanVanes = partById("fan_blade_vanes")!;
    const first = swapPart([], hoodPlate);
    expect(first.ejected).toBeNull();

    const second = swapPart(first.installed, fanVanes);
    expect(second.ejected?.id).toBe("hood_plate");
    expect(second.installed.filter((entry) => entry.slotId === "front")).toHaveLength(1);
    expect(second.installed.find((entry) => entry.slotId === "front")?.part.id).toBe("fan_blade_vanes");
  });

  test("swapping into a different slot never ejects an unrelated part", () => {
    const engine = partById("salvage_v6")!;
    const wheels = partById("steel_rims")!;
    const withEngine = swapPart([], engine);
    const withWheels = swapPart(withEngine.installed, wheels);
    expect(withWheels.ejected).toBeNull();
    expect(withWheels.installed).toHaveLength(2);
  });

  test("all twelve parts declare a real, non-neutral stat vector or capability", () => {
    expect(PARTS.length).toBeGreaterThanOrEqual(12);
    for (const part of PARTS) {
      const values = Object.values(part.stats);
      expect(values.some((value) => value !== 0)).toBe(true);
    }
  });

  test("every part id resolves through the catalog", () => {
    for (const part of PARTS) {
      expect(partById(part.id)).not.toBeNull();
    }
    expect(partById("does_not_exist")).toBeNull();
  });

  test("computeEffectiveStats composes additively across installed parts", () => {
    const engine = partById("truck_engine")!;
    const armor = partById("armor_plating")!;
    const parts: InstalledPart[] = [
      { slotId: "engine", part: engine },
      { slotId: "frame", part: armor },
    ];
    const tuning = tuningFrom(parts);
    const baseTopSpeed = KART_DEF.baseStats.topSpeed!;
    expect(tuning.topSpeed).toBeCloseTo(baseTopSpeed + engine.stats.topSpeed + armor.stats.topSpeed, 5);
    expect(tuning.armorCharges).toBe(1);
  });
});
