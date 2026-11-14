import { describe, expect, test } from "bun:test";
import { completeSets, ITEM_KINDS, ITEMS, itemIssues, kindOf, rollItem, SETS, SET_IDS, tradeValue } from "./loot";
import { RECIPES } from "./burrow";
import { planRoom } from "./runGen";

describe("the Littles' finds", () => {
  test("every kind rolls a valid, deterministic instance whose level is the room's depth", () => {
    for (const kind of ITEM_KINDS) {
      const a = rollItem(kind, 3, `seed:${kind}`, `1:${kind}~x`), b = rollItem(kind, 3, `seed:${kind}`, `1:${kind}~x`);
      expect(itemIssues(a)).toEqual([]);
      expect(a).toEqual(b);
      expect(a.level).toBe(3);
      expect(kindOf(a)).toBe(kind);
      expect(tradeValue(a)).toBeGreaterThan(0);
      expect(ITEMS[kind].flavor.length).toBeGreaterThan(10);
    }
  });
  test("size and weight are real: cheese, coins and bricks need two arms; crumbs weigh next to nothing", () => {
    expect(ITEMS["cheese-cube"].bulky).toBe(true);
    expect(ITEMS.coin.bulky).toBe(true);
    expect(ITEMS.brick.bulky).toBe(true);
    expect(ITEMS.crumb.mass).toBeLessThan(ITEMS.coin.mass / 10);
    expect(ITEMS.needle.w).toBe(3);
  });
  test("every item can be found or made: room spots, a disarmed trap's spring, a spider's silk, the workbench", () => {
    const found = new Set<string>(["spring", "spider-silk", ...RECIPES.map(r => r.makes)]);
    for (let i = 0; i < 400; i++) {
      const run = { seed: `obtain-${i}`, little: (["pip", "bolt", "dot", "fennel"] as const)[i % 4], zones: ["kitchen", "living", "kidroom", "garage", "attic"] as const };
      for (const path of ["0", "0-0", "0-1", "0-0-0", "0-1-1", "0-0-0-0", "0-1-0-0-1"]) for (const l of planRoom({ ...run, zones: [...run.zones] }, path).loot) if (l.kind !== "toybox") found.add(l.kind);
    }
    expect(ITEM_KINDS.filter(kind => !found.has(kind))).toEqual([]);
  });
  test("every set's pieces exist, and a full set is recognised only when complete", () => {
    for (const id of SET_IDS) for (const piece of SETS[id].pieces) expect(ITEMS[piece]).toBeDefined();
    const feast = SETS["midnight-feast"].pieces.map((kind, i) => rollItem(kind, 1, `f${i}`, `1:${kind}~f${i}`));
    expect(completeSets(feast)).toEqual(["midnight-feast"]);
    expect(completeSets(feast.slice(1))).toEqual([]);
  });
});
