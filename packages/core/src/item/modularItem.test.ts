import { describe, expect, test } from "bun:test";

import {
  computeEffectiveStats,
  createModularItem,
  install,
  isComplete,
  missingRequiredSlots,
  slotAccepts,
  uninstall,
  type ModularItemDef,
  type PartDef,
} from "./modularItem";

const mech: ModularItemDef = {
  id: "mech_frame",
  baseStats: { weight: 1000, en: 0, mobility: 50 },
  slots: [
    { id: "rightArm", accepts: ["arm-weapon"] },
    { id: "core", accepts: "core", required: true },
    { id: "legs", accepts: ["legs"], required: true },
  ],
};

const rifle: PartDef = { id: "rifle", category: "arm-weapon", stats: { weight: 200, damage: 80 } };
const reactor: PartDef = { id: "reactor", category: "core", stats: { weight: 300, en: 500 } };
const boosters: PartDef = { id: "boosters", category: "legs", stats: { weight: 400 }, multipliers: { mobility: 1.5 } };

describe("modular item", () => {
  test("slotAccepts matches single and list categories", () => {
    expect(slotAccepts(mech.slots[0]!, "arm-weapon")).toBe(true);
    expect(slotAccepts(mech.slots[1]!, "core")).toBe(true);
    expect(slotAccepts(mech.slots[1]!, "legs")).toBe(false);
  });

  test("install validates slot, category, and occupancy", () => {
    const result = install(mech, [], "rightArm", rifle);
    expect(result).toEqual({ status: "ok", installed: [{ slotId: "rightArm", part: rifle }] });
    expect(install(mech, [], "core", rifle)).toEqual({ status: "rejected", reason: "wrong-category" });
    expect(install(mech, [], "missing", rifle)).toEqual({ status: "rejected", reason: "unknown-slot" });
    if (result.status !== "ok") throw new Error("expected install to succeed");
    expect(install(mech, result.installed, "rightArm", rifle)).toEqual({ status: "rejected", reason: "slot-occupied" });
  });

  test("computeEffectiveStats rolls up adds then multipliers over base", () => {
    const parts = [
      { slotId: "rightArm", part: rifle },
      { slotId: "core", part: reactor },
      { slotId: "legs", part: boosters },
    ];
    expect(computeEffectiveStats(mech, parts)).toEqual({ weight: 1900, en: 500, mobility: 75, damage: 80 });
  });

  test("required slots gate completeness", () => {
    expect(missingRequiredSlots(mech, [{ slotId: "core", part: reactor }])).toEqual(["legs"]);
    expect(isComplete(mech, [{ slotId: "core", part: reactor }])).toBe(false);
    const full = [
      { slotId: "core", part: reactor },
      { slotId: "legs", part: boosters },
    ];
    expect(isComplete(mech, full)).toBe(true);
  });

  test("uninstall removes a filled slot", () => {
    const parts = [
      { slotId: "core", part: reactor },
      { slotId: "legs", part: boosters },
    ];
    expect(uninstall(parts, "legs")).toEqual([{ slotId: "core", part: reactor }]);
  });

  test("stateful wrapper installs, recomputes, and reports completeness", () => {
    const item = createModularItem(mech);
    expect(item.install("core", reactor).status).toBe("ok");
    expect(item.install("core", reactor).status).toBe("rejected");
    item.install("legs", boosters);
    item.install("rightArm", rifle);
    expect(item.effectiveStats()).toEqual({ weight: 1900, en: 500, mobility: 75, damage: 80 });
    expect(item.isComplete()).toBe(true);
    expect(item.partInSlot("core")).toBe(reactor);
    item.uninstall("legs");
    expect(item.missingRequired()).toEqual(["legs"]);
  });
});
