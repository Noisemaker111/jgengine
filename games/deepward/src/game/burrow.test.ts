import { describe, expect, test } from "bun:test";
import { CHARTS, missing, nextGoal, packOf, pay, RECIPES, unlockedLittles, UPGRADES, UPGRADE_IDS } from "./burrow";
import { ITEMS, rollItem } from "./loot";
import { newHome } from "./state";

const stash = (...kinds: Parameters<typeof rollItem>[0][]) => kinds.map((kind, i) => rollItem(kind, 1 + (i % 3), `b:${kind}:${i}`, `1:${kind}~b${i}`));

describe("the burrow", () => {
  test("a cost takes its exact items, the cheapest instance first, and names what is still missing", () => {
    const shelf = stash("paperclip", "paperclip", "watch-battery", "crumb");
    const cost = UPGRADES.mapRoom.levels[0]!.cost;
    expect(missing(shelf, 0, cost)).toEqual(["20 caps"]);
    const paid = pay(shelf, 25, cost);
    expect(paid.caps).toBe(5);
    expect(paid.stash.map(i => i.baseId).sort()).toEqual(["crumb", "paperclip"]);
    expect(() => pay(shelf, 0, cost)).toThrow();
  });
  test("every upgrade, recipe and chart costs things a run can find", () => {
    for (const id of UPGRADE_IDS) for (const level of UPGRADES[id].levels) for (const kind of Object.keys(level.cost.items)) expect(ITEMS[kind as keyof typeof ITEMS]).toBeDefined();
    for (const r of RECIPES) { expect(ITEMS[r.makes].category).toBe("gear"); for (const kind of Object.keys(r.needs)) expect(ITEMS[kind as keyof typeof ITEMS]).toBeDefined(); }
    for (const chart of Object.values(CHARTS)) for (const kind of Object.keys(chart.cost.items)) expect(ITEMS[kind as keyof typeof ITEMS]).toBeDefined();
  });
  test("the satchel loft grows the pack, and Littles move in as the burrow grows", () => {
    expect(packOf(0)).toEqual({ w: 4, h: 3, weight: 10 });
    expect(packOf(2)).toEqual({ w: 5, h: 4, weight: 16 });
    expect(unlockedLittles({ mapRoom: 0, bulkyBanked: 0, setsBanked: 0, deepestExtraction: 0 })).toEqual(["pip", "bolt"]);
    expect(unlockedLittles({ mapRoom: 1, bulkyBanked: 3, setsBanked: 1, deepestExtraction: 6 })).toEqual(["pip", "bolt", "wren", "tuck", "dot", "fennel"]);
  });
  test("the next goal walks a new player from the first run to the far end of the house", () => {
    const home = newHome();
    expect(nextGoal(home)).toContain("First run");
    expect(nextGoal({ ...home, extractions: 1 })).toContain("larder");
    expect(nextGoal({ ...home, extractions: 3, upgrades: { ...home.upgrades, larder: 1 } })).toContain("map room");
  });
});
