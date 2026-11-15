import { describe, expect, test } from "bun:test";
import { CHARTS, clockOf, collectionOf, herbsOf, hushOf, missing, nextGoal, packOf, pay, RECIPES, unlockedLittles, UPGRADES, UPGRADE_IDS } from "./burrow";
import { ITEMS, rollItem } from "./loot";
import { newHome, newRun } from "./state";

const stash = (...kinds: Parameters<typeof rollItem>[0][]) => kinds.map((kind, i) => rollItem(kind, 1 + (i % 3), `b:${kind}:${i}`, `1:${kind}~b${i}`));

describe("the burrow", () => {
  test("the slippers hush, the clock lengthens, the herbs heal, and the collection makes every Little stronger", () => {
    expect(hushOf(0)).toBe(1); expect(hushOf(1)).toBeLessThan(1); expect(hushOf(2)).toBeLessThan(hushOf(1));
    expect(clockOf(2)).toBeGreaterThan(clockOf(1)); expect(herbsOf(0)).toBe(0); expect(herbsOf(2)).toBeGreaterThan(herbsOf(1));
    expect(collectionOf(1)).toMatchObject({ carry: 0, health: 0 });
    expect(collectionOf(2).carry).toBe(1);
    expect(collectionOf(7)).toMatchObject({ carry: 3, health: 35, next: null });
    const home = newHome();
    const plain = newRun(1, home), strong = newRun(1, { ...home, sets: ["sewing-basket", "junk-drawer", "toy-box", "midnight-feast"], upgrades: { ...home.upgrades, clock: 1 } });
    expect(strong.capacity).toBeGreaterThan(plain.capacity);
    expect(strong.maxHealth).toBe(plain.maxHealth + 10);
    expect(strong.nightSeconds).toBe(plain.nightSeconds + 30);
  });
  test("the guidance leads past the attic into the basement and on to the collection", () => {
    const home = { ...newHome(), extractions: 9, upgrades: { ...newHome().upgrades, larder: 1, mapRoom: 1, satchel: 1 }, sets: ["toy-box"], zones: ["kitchen", "living", "kidroom", "garage", "attic"] as const };
    const deep = { ...home, zones: [...home.zones], milestones: { ...newHome().milestones, deepestExtraction: 6 } };
    expect(nextGoal(deep)).toContain("basement");
    expect(nextGoal({ ...deep, zones: [...deep.zones, "basement"] })).toContain("Moth");
    expect(nextGoal({ ...deep, zones: [...deep.zones, "basement"], milestones: { ...deep.milestones, cellarBanked: 1 } })).toContain("four different sets");
  });
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
    expect(unlockedLittles({ mapRoom: 0, bulkyBanked: 0, setsBanked: 0, deepestExtraction: 0, cellarBanked: 0 })).toEqual(["pip", "bolt"]);
    expect(unlockedLittles({ mapRoom: 1, bulkyBanked: 3, setsBanked: 1, deepestExtraction: 6, cellarBanked: 0 })).toEqual(["pip", "bolt", "wren", "tuck", "dot", "fennel"]);
    expect(unlockedLittles({ mapRoom: 1, bulkyBanked: 3, setsBanked: 1, deepestExtraction: 6, cellarBanked: 1 })).toContain("moth");
  });
  test("the next goal walks a new player from the first run to the far end of the house", () => {
    const home = newHome();
    expect(nextGoal(home)).toContain("First run");
    expect(nextGoal({ ...home, extractions: 1 })).toContain("larder");
    expect(nextGoal({ ...home, extractions: 3, upgrades: { ...home.upgrades, larder: 1 } })).toContain("map room");
  });
});
