import { describe, expect, test } from "bun:test";

import { captureProvenance, identityOf } from "./itemIdentity";
import {
  computeEffectiveStats,
  createModularItem,
  install,
  isComplete,
  missingRequiredSlots,
  slotAccepts,
  uninstall,
  type InstalledPart,
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

  for (const { reason, initial } of [
    { reason: "unknown-slot", initial: [{ slotId: "missing", part: reactor }] },
    { reason: "wrong-category", initial: [{ slotId: "core", part: rifle }] },
    {
      reason: "slot-occupied",
      initial: [
        { slotId: "core", part: reactor },
        { slotId: "core", part: { ...reactor, id: "spare_reactor" } },
      ],
    },
  ]) {
    test(`JSON reload rejects initial parts with ${reason}`, () => {
      const saved = JSON.parse(JSON.stringify(initial)) as InstalledPart[];
      const last = saved[saved.length - 1]!;
      expect(install(mech, saved.slice(0, -1), last.slotId, last.part)).toEqual({ status: "rejected", reason });
      expect(() => createModularItem(mech, saved)).toThrow();
      expect(saved).toEqual(initial);
    });
  }

  test("valid JSON reload preserves definition, part IDs, stats, and provenance", () => {
    const item = createModularItem(mech);
    expect(item.install("core", reactor).status).toBe("ok");
    expect(item.install("legs", boosters).status).toBe("ok");
    expect(item.install("rightArm", rifle).status).toBe("ok");
    const provenance = captureProvenance(identityOf("mech", ["salvaged"], item.parts()), [], 42);
    const saved = JSON.parse(JSON.stringify({ def: item.def, parts: item.parts(), provenance })) as {
      def: ModularItemDef;
      parts: InstalledPart[];
      provenance: typeof provenance;
    };
    const reloaded = createModularItem(saved.def, saved.parts);
    expect(reloaded.def).toEqual(mech);
    expect(reloaded.parts()).toEqual(item.parts());
    expect(reloaded.effectiveStats()).toEqual({ weight: 1900, en: 500, mobility: 75, damage: 80 });
    expect(reloaded.isComplete()).toBe(true);
    expect(
      captureProvenance(identityOf(saved.provenance.family, saved.provenance.tags, reloaded.parts()), [], saved.provenance.seed),
    ).toEqual(provenance);
    reloaded.uninstall("legs");
    expect(reloaded.missingRequired()).toEqual(["legs"]);
    expect(reloaded.effectiveStats()).toEqual({ weight: 1500, en: 500, mobility: 50, damage: 80 });
    expect(reloaded.install("legs", boosters).status).toBe("ok");
    expect(reloaded.effectiveStats()).toEqual(item.effectiveStats());
  });

  test("rejected installs preserve a valid reloaded build", () => {
    const saved = JSON.parse(JSON.stringify([
      { slotId: "core", part: reactor },
      { slotId: "legs", part: boosters },
    ])) as InstalledPart[];
    const item = createModularItem(mech, saved);
    const before = JSON.stringify(item.parts());
    expect(item.install("core", rifle)).toEqual({ status: "rejected", reason: "wrong-category" });
    expect(item.install("core", { ...reactor, id: "spare_reactor" })).toEqual({ status: "rejected", reason: "slot-occupied" });
    expect(item.install("missing", rifle)).toEqual({ status: "rejected", reason: "unknown-slot" });
    expect(JSON.stringify(item.parts())).toBe(before);
    expect(item.partInSlot("core")?.id).toBe("reactor");
    expect(item.isComplete()).toBe(true);
    expect(item.effectiveStats()).toEqual({ weight: 1700, en: 500, mobility: 75 });
  });
});
