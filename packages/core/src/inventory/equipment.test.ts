import { describe, expect, test } from "bun:test";

import { devtools } from "../devtools/devtools";
import {
  createEquipment,
  type EquipItemDef,
  type EquipSlotDef,
  type EquipmentState,
} from "./equipment";

const SLOTS: readonly EquipSlotDef[] = [
  { id: "weapon" },
  { id: "offhand" },
  { id: "chest", accepts: ["armor"] },
  { id: "boots", accepts: ["armor"] },
];

const GEAR: Record<string, EquipItemDef> = {
  rifle: { slots: ["weapon"], kind: "weapon" },
  pistol: { slots: ["weapon"], kind: "weapon" },
  shield: { slots: ["offhand"], kind: "shield" },
  greatsword: { slots: ["weapon", "offhand"], kind: "weapon" },
  plate: { slots: ["chest"], kind: "armor" },
  greaves: { slots: ["boots"], kind: "armor" },
  potion: { slots: [], kind: "consumable" },
  trinket: { slots: ["chest"], kind: "consumable" },
};

const lookup = (itemId: string): EquipItemDef | null => GEAR[itemId] ?? null;

function makeEquipment(devtoolsName?: string) {
  return createEquipment(SLOTS, lookup, devtoolsName === undefined ? {} : { devtoolsName });
}

function twoHandedSlots(): readonly EquipSlotDef[] {
  return [
    { id: "weapon", blocks: ["offhand"] },
    { id: "offhand" },
  ];
}

describe("equip rules by item slot", () => {
  test("an item declares the slots it may occupy, and another slot is refused by name", () => {
    const gear = makeEquipment();
    const refused = gear.equip("chest", "rifle");
    expect(refused.status).toBe("rejected");
    if (refused.status !== "rejected") return;
    expect(refused.reason).toBe("wrong-slot");
    expect(refused.detail).toContain('"rifle"');
    expect(refused.detail).toContain("weapon");
    expect(gear.worn()).toEqual([]);
  });

  test("a slot refuses an item whose kind it does not accept", () => {
    const gear = makeEquipment();
    const refused = gear.equip("chest", "trinket");
    expect(refused.status).toBe("rejected");
    if (refused.status !== "rejected") return;
    expect(refused.reason).toBe("wrong-slot");
    expect(refused.detail).toContain("consumable");
  });

  test("undeclared slots, empty slots and untyped items are refused with the reason", () => {
    const gear = makeEquipment();
    expect(gear.equip("tail", "plate")).toMatchObject({ status: "rejected", reason: "unknown-slot" });
    expect(gear.unequip("chest")).toMatchObject({ status: "rejected", reason: "empty-slot" });
    expect(gear.equip("chest", "not-in-catalog")).toMatchObject({ status: "rejected", reason: "not-equippable" });
  });

  test("equipping into a filled slot hands back the replaced item instead of losing it", () => {
    const gear = makeEquipment();
    expect(gear.equip("weapon", "rifle").status).toBe("ok");
    const swap = gear.equip("weapon", "pistol");
    expect(swap.status).toBe("ok");
    if (swap.status !== "ok") return;
    expect(swap.replaced).toBe("rifle");
    expect(gear.state()).toEqual({ slots: [["weapon", "pistol"]] });
  });

  test("the same item cannot be worn twice", () => {
    const gear = makeEquipment();
    gear.equip("weapon", "greatsword");
    const again = gear.equip("offhand", "greatsword");
    expect(again).toMatchObject({ status: "rejected", reason: "already-equipped" });
  });

  test("equipBest fills the first free preferred slot, then replaces the first one", () => {
    const gear = makeEquipment();
    const first = gear.equipBest("greatsword");
    expect(first.status).toBe("ok");
    if (first.status !== "ok") return;
    expect(first.slotId).toBe("weapon");

    const spare = makeEquipment();
    spare.equip("weapon", "rifle");
    const elsewhere = spare.equipBest("greatsword");
    expect(elsewhere.status).toBe("ok");
    if (elsewhere.status !== "ok") return;
    expect(elsewhere.slotId).toBe("offhand");
    expect(elsewhere.replaced).toBeNull();

    const full = makeEquipment();
    full.equip("weapon", "rifle");
    full.equip("offhand", "shield");
    const replaced = full.equipBest("greatsword");
    expect(replaced.status).toBe("ok");
    if (replaced.status !== "ok") return;
    expect(replaced.slotId).toBe("weapon");
    expect(replaced.replaced).toBe("rifle");
  });

  test("equipBest refuses an item the rules reject everywhere, naming the reason", () => {
    const gear = createEquipment([{ id: "chest", accepts: ["armor"] }], lookup);
    expect(gear.equipBest("rifle")).toMatchObject({ status: "rejected", reason: "unknown-slot" });
    expect(gear.equipBest("potion")).toMatchObject({ status: "rejected", reason: "not-equippable" });
  });

  test("unequip clears one slot and returns its item", () => {
    const gear = makeEquipment();
    gear.equip("chest", "plate");
    gear.equip("boots", "greaves");
    const off = gear.unequip("chest");
    expect(off.status).toBe("ok");
    if (off.status !== "ok") return;
    expect(off.itemId).toBe("plate");
    expect(gear.worn()).toEqual([{ slotId: "boots", itemId: "greaves" }]);
    expect(gear.slotOf("plate")).toBeNull();
    expect(gear.slotOf("greaves")).toBe("boots");
  });
});

describe("two-handed blocking", () => {
  test("a two-handed weapon refuses to equip while its blocked slot holds something", () => {
    const gear = createEquipment(twoHandedSlots(), (itemId) =>
      itemId === "greatsword" ? { slots: ["weapon"], kind: "weapon" } : GEAR[itemId] ?? null);
    gear.equip("offhand", "shield");
    const refused = gear.equip("weapon", "greatsword");
    expect(refused.status).toBe("rejected");
    if (refused.status !== "rejected") return;
    expect(refused.reason).toBe("blocked");
    expect(refused.detail).toContain("offhand");

    gear.unequip("offhand");
    expect(gear.equip("weapon", "greatsword").status).toBe("ok");
  });

  test("the blocked slot refuses to fill while the two-handed weapon is worn", () => {
    const gear = createEquipment(twoHandedSlots(), lookup);
    gear.equip("weapon", "greatsword");
    const refused = gear.equip("offhand", "shield");
    expect(refused).toMatchObject({ status: "rejected", reason: "blocked" });
    if (refused.status !== "rejected") return;
    expect(refused.detail).toContain("weapon");
  });
});

describe("equipment state out and back in", () => {
  test("worn() follows declared slot order, not equip order", () => {
    const gear = makeEquipment();
    gear.equip("boots", "greaves");
    gear.equip("weapon", "rifle");
    expect(gear.worn().map((entry) => entry.slotId)).toEqual(["weapon", "boots"]);
    expect(gear.slotIds()).toEqual(["weapon", "offhand", "chest", "boots"]);
  });

  test("state round-trips through a detached snapshot", () => {
    const gear = makeEquipment();
    gear.equip("weapon", "rifle");
    gear.equip("chest", "plate");
    const saved = gear.state();
    expect(saved).toEqual({ slots: [["weapon", "rifle"], ["chest", "plate"]] });

    const restored = makeEquipment();
    expect(restored.restore(saved)).toBe(true);
    expect(restored.worn()).toEqual(gear.worn());

    gear.reset();
    expect(gear.worn()).toEqual([]);
    expect(saved.slots.length).toBe(2);
  });

  test("restore refuses malformed or rule-breaking state without touching what is worn", () => {
    const gear = makeEquipment();
    gear.equip("weapon", "rifle");

    const bad: EquipmentState[] = [
      { slots: [["tail", "plate"]] },
      { slots: [["chest", "rifle"]] },
      { slots: [["chest", "plate"], ["chest", "plate"]] },
      { slots: [["chest", "plate"], ["boots", "plate"]] },
      { slots: [["chest", ""]] },
    ];
    for (const state of bad) expect(gear.restore(state)).toBe(false);
    expect(gear.worn()).toEqual([{ slotId: "weapon", itemId: "rifle" }]);
  });

  test("restore refuses a two-handed set that fills both weapon and its blocked slot", () => {
    const gear = createEquipment(twoHandedSlots(), lookup);
    expect(gear.restore({ slots: [["weapon", "greatsword"], ["offhand", "shield"]] })).toBe(false);
    expect(gear.worn()).toEqual([]);
  });

  test("restore accepts pairs in any order", () => {
    const gear = makeEquipment();
    expect(gear.restore({ slots: [["boots", "greaves"], ["weapon", "rifle"]] })).toBe(true);
    expect(gear.worn()).toEqual([{ slotId: "weapon", itemId: "rifle" }, { slotId: "boots", itemId: "greaves" }]);
  });

  test("duplicate slot ids and duplicate declared slots are refused", () => {
    expect(() => createEquipment([{ id: "weapon" }, { id: "weapon" }], lookup)).toThrow(RangeError);
    expect(() => createEquipment([{ id: " " }], lookup)).toThrow(RangeError);
  });
});

describe("devtools probe", () => {
  test("reports filled slots and drops its probe on dispose", () => {
    const name = "inventory.test.equipment";
    const gear = makeEquipment(name);
    gear.equip("weapon", "rifle");
    expect(devtools.probes.read()[name]).toEqual({ filled: 1, slots: { weapon: "rifle" } });
    gear.dispose();
    expect(devtools.probes.read()[name]).toBeUndefined();
  });
});
