import { expect, test } from "bun:test";

import { pickWeighted, tierAt } from "../parts";
import { seededRng } from "../random/rng";

/**
 * @recipe Loot table by rarity
 * A Ladder turns a roll into a rarity, and a Table per rarity picks the item.
 */
test("loot table by rarity", () => {
  const rng = seededRng("loot");
  const rarities = [{ id: "common", at: 0 }, { id: "rare", at: 80 }, { id: "epic", at: 97 }];
  const pools: Record<string, string[]> = { common: ["stick", "rag"], rare: ["sword"], epic: ["crown"] };
  const drop = () => {
    const rarity = tierAt(rarities, rng() * 100)?.id ?? "common";
    return { rarity, item: pickWeighted(rng, pools[rarity] ?? [], () => 1) };
  };

  const drops = Array.from({ length: 2000 }, drop);
  const count = (rarity: string) => drops.filter((d) => d.rarity === rarity).length;
  expect(drops.every((d) => pools[d.rarity]?.includes(d.item ?? ""))).toBe(true);
  expect(count("common")).toBeGreaterThan(count("rare"));
  expect(count("rare")).toBeGreaterThan(count("epic"));
  expect(count("epic")).toBeGreaterThan(0);
});
