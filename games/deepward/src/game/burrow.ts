import { ITEMS, kindOf, type Item, type ItemKind } from "./loot";
import { LITTLE_IDS, type LittleId } from "./littles";
import type { Zone } from "../world";

/**
 * The burrow in the kitchen wall, and everything banked loot turns into: upgrades that change every
 * run, gear crafted at the workbench, charts that open more of the house, and new Littles moving in.
 * Every cost is exact items from the stash plus bottle caps.
 */
export type UpgradeId = "workbench" | "larder" | "mapRoom" | "satchel" | "trophies";
export interface Cost { items: Partial<Record<ItemKind, number>>; caps: number }
export interface UpgradeDef { name: string; levels: readonly { cost: Cost; effect: string }[]; flavor: string }

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  workbench: { name: "Workbench", flavor: "A cotton reel table with a razor-blade saw.", levels: [
    { cost: { items: {}, caps: 0 }, effect: "Craft a grapple, a button shield and a slingshot." },
    { cost: { items: { "toy-gear": 1, spring: 1, screw: 1 }, caps: 30 }, effect: "Adds a vise: craft napkin parachutes and candle torches." },
  ] },
  larder: { name: "Larder", flavor: "Bottle caps stacked into shelves.", levels: [
    { cost: { items: { crumb: 2, raisin: 1 }, caps: 10 }, effect: "Eat before a run from the stash's food: start well fed, +25 health." },
    { cost: { items: { "cheese-cube": 1, "sugar-cube": 1 }, caps: 25 }, effect: "A proper supper: well fed is +50 health." },
  ] },
  mapRoom: { name: "Map room", flavor: "A postcard pinned to the stud, with a pin-and-thread route.", levels: [
    { cost: { items: { paperclip: 1, "watch-battery": 1 }, caps: 20 }, effect: "Read one room ahead through every door. Wren moves in. Unlocks the charts." },
  ] },
  satchel: { name: "Satchel loft", flavor: "A sock-cuff sling that turns into a bigger pack.", levels: [
    { cost: { items: { "thread-spool": 1, "safety-pin": 1 }, caps: 20 }, effect: "Pack 5 × 3 and 13 weight." },
    { cost: { items: { "thread-spool": 1, button: 2, "rubber-band": 1 }, caps: 45 }, effect: "Pack 5 × 4 and 16 weight." },
  ] },
  trophies: { name: "Trophy shelf", flavor: "Where finished sets live.", levels: [
    { cost: { items: {}, caps: 15 }, effect: "Every banked set shows on the shelf and pays its bonus again as caps." },
  ] },
};
export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

/** Charts: the house beyond the kitchen and the living room, each opened at the map room. */
export const CHARTS: Record<Exclude<Zone, "kitchen" | "living">, { cost: Cost; flavor: string }> = {
  kidroom: { cost: { items: { crayon: 1 }, caps: 15 }, flavor: "Up the stairs: the kid's bedroom, full of toys and a sleeping giant." },
  garage: { cost: { items: { screw: 1, spring: 1 }, caps: 25 }, flavor: "Through the hall: the cold garage, all parts and traps." },
  attic: { cost: { items: { "tiny-key": 1, "thread-spool": 1 }, caps: 40 }, flavor: "Up through the hatch: the attic, where the old treasure sleeps." },
};
export const STARTING_ZONES: readonly Zone[] = ["kitchen", "living"];

/** Gear the workbench can make, and the bench level it needs. */
export interface RecipeDef { makes: ItemKind; needs: Partial<Record<ItemKind, number>>; caps: number; bench: number }
export const RECIPES: readonly RecipeDef[] = [
  { makes: "grapple", needs: { paperclip: 1, "thread-spool": 1 }, caps: 5, bench: 1 },
  { makes: "button-shield", needs: { button: 1, "safety-pin": 1 }, caps: 5, bench: 1 },
  { makes: "slingshot", needs: { "rubber-band": 1, paperclip: 1 }, caps: 5, bench: 1 },
  { makes: "napkin", needs: { tissue: 1, "rubber-band": 1 }, caps: 8, bench: 2 },
  { makes: "candle", needs: { crayon: 1, "safety-pin": 1 }, caps: 8, bench: 2 },
];

/** What a cost still lacks against a stash and a purse, in the stash's own words. */
export function missing(stash: readonly Item[], caps: number, cost: Cost): string[] {
  const out: string[] = [];
  for (const [kind, count] of Object.entries(cost.items) as [ItemKind, number][]) {
    const have = stash.filter(item => item.baseId === kind).length;
    if (have < count) out.push(`${count - have} ${ITEMS[kind].name}`);
  }
  if (caps < cost.caps) out.push(`${cost.caps - caps} caps`);
  return out;
}
/** Take a cost's exact items out of the stash: the lowest-value instance of each kind first. */
export function pay(stash: readonly Item[], caps: number, cost: Cost): { stash: Item[]; caps: number } {
  if (missing(stash, caps, cost).length > 0) throw new Error("The burrow cannot afford that yet.");
  let rest = [...stash];
  for (const [kind, count] of Object.entries(cost.items) as [ItemKind, number][]) {
    for (let n = 0; n < count; n++) {
      const pick = rest.filter(item => kindOf(item) === kind).sort((a, b) => (a.stats["value"] ?? 0) - (b.stats["value"] ?? 0))[0]!;
      rest = rest.filter(item => item.id !== pick.id);
    }
  }
  return { stash: rest, caps: caps - cost.caps };
}

/** Pack size and weight at a satchel level. */
export function packOf(satchel: number): { w: number; h: number; weight: number } {
  return satchel >= 2 ? { w: 5, h: 4, weight: 16 } : satchel >= 1 ? { w: 5, h: 3, weight: 13 } : { w: 4, h: 3, weight: 10 };
}
/** Well fed bonus health at a larder level. */
export function wellFed(larder: number): number { return larder >= 2 ? 50 : larder >= 1 ? 25 : 0; }

const GOALS = [
  "First run: slip out through the crack, grab whatever you can carry, and come back the way you came.",
  "Build the larder at the workbench (two crumbs and a raisin): every run starts well fed.",
  "Build the map room (a paperclip and a watch battery): read the rooms behind each door, and Wren moves in.",
  "Chart the kid's bedroom at the workbench with a crayon stub. Toys, marbles and a sleeping giant.",
  "Build the satchel loft for a bigger pack.",
  "Bring a whole set home in one run (the stash lists them) for a big bonus, and Dot moves in.",
  "Chart the garage and the attic. The deeper the room, the better the treasure.",
  "Go deeper. Six rooms in and out again, and Old Fennel moves in.",
] as const;
type GoalHome = { extractions: number; upgrades: Record<UpgradeId, number>; zones: readonly Zone[]; sets: readonly string[] };
/** Which step of the burrow's guidance a home is on: 0 is the very first run. */
export function goalStep(home: GoalHome): number {
  if (home.extractions === 0) return 0;
  if (home.upgrades.larder === 0) return 1;
  if (home.upgrades.mapRoom === 0) return 2;
  if (home.zones.length < 3) return 3;
  if (home.upgrades.satchel === 0) return 4;
  if (home.sets.length === 0) return 5;
  if (home.zones.length < 5) return 6;
  return 7;
}
/** The burrow's next suggestion, in the order a new player meets things. */
export function nextGoal(home: GoalHome): string { return GOALS[goalStep(home)]!; }

/** What the burrow has done, for the nook's move-in rules. */
export interface Milestones { mapRoom: number; bulkyBanked: number; setsBanked: number; deepestExtraction: number }
export function unlockedLittles(m: Milestones): LittleId[] {
  return LITTLE_IDS.filter(id => id === "pip" || id === "bolt"
    || (id === "wren" && m.mapRoom >= 1)
    || (id === "tuck" && m.bulkyBanked >= 3)
    || (id === "dot" && m.setsBanked >= 1)
    || (id === "fennel" && m.deepestExtraction >= 6));
}
