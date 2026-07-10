import { describe, expect, test } from "bun:test";
import { content } from "../../content";
import { lootTables } from "./loot-tables";

describe("loot tables", () => {
  test("rank tables and the mystery crate exist", () => {
    expect(lootTables.map((table) => table.id).sort()).toEqual([
      "drops_boss",
      "drops_elite",
      "drops_grunt",
      "drops_veteran",
      "mystery_crate",
    ]);
  });

  test("mystery crate rolls weapons only, rare or better", () => {
    const crate = lootTables.find((table) => table.id === "mystery_crate")!;
    expect(crate.entries.length).toBeGreaterThan(0);
    for (const entry of crate.entries) {
      expect(entry.item).toBeDefined();
      expect(entry.item!.endsWith("_common") || entry.item!.endsWith("_uncommon")).toBe(false);
    }
  });

  test("every item entry resolves through content", () => {
    for (const table of lootTables) {
      for (const entry of table.entries) {
        if (entry.item !== undefined) {
          expect(content.itemById?.(entry.item)).not.toBeNull();
        }
        expect(entry.weight).toBeGreaterThan(0);
      }
    }
  });

  test("boss table skews to epic and legendary weapons", () => {
    const boss = lootTables.find((table) => table.id === "drops_boss")!;
    const weaponEntries = boss.entries.filter((entry) => entry.item?.includes("_epic") || entry.item?.includes("_legendary"));
    const otherWeapons = boss.entries.filter(
      (entry) =>
        entry.item !== undefined &&
        !entry.item.startsWith("ammo_") &&
        !entry.item.startsWith("medkit") &&
        !weaponEntries.includes(entry),
    );
    expect(weaponEntries.length).toBeGreaterThan(0);
    expect(otherWeapons.length).toBe(0);
  });
});
