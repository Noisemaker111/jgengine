import { describe, expect, test } from "bun:test";
import { createItemLedger, salvageItem, salvageValue } from "./salvage";


describe("salvage", () => {
  const table = {
    currency: "cores",
    perLevel: 3,
    rarityMultiplier: { rare: 2 },
  };

  test("yield follows level and rarity", () => {
    expect(salvageValue({ level: 5, rarity: "common" }, table)).toEqual({ currency: "cores", amount: 15 });
    expect(salvageValue({ level: 5, rarity: "rare" }, table)).toEqual({ currency: "cores", amount: 30 });
    expect(salvageValue({ level: 1, rarity: "common" }, { ...table, minimum: 4 })).toEqual({ currency: "cores", amount: 4 });
  });

  test("a salvaged item cannot be salvaged or sold again", () => {
    const ledger = createItemLedger();
    const item = { id: "drop:one", level: 3, rarity: "common" };
    const first = salvageItem(item, table, ledger);
    expect(first).toMatchObject({ ok: true, yield: { currency: "cores", amount: 9 } });
    expect(ledger.canUse(item.id)).toBe(false);
    expect(salvageItem(item, table, ledger)).toEqual({ ok: false, reason: "already-spent" });
    expect(ledger.spend(item.id, "sold")).toBe(false);
    expect(ledger.status(item.id)).toBe("salvaged");
  });

  test("the ledger round-trips as plain data", () => {
    const ledger = createItemLedger();
    ledger.spend("a", "salvaged");
    ledger.spend("b", "sold");
    const copy = createItemLedger(ledger.snapshot());
    expect(copy.status("a")).toBe("salvaged");
    expect(copy.status("b")).toBe("sold");
    expect(copy.status("c")).toBe("owned");
    expect(copy.restore({ a: "lost" as never })).toBe(false);
  });
});

