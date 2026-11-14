import type { AffixPool, RarityTier } from "@jgengine/core/item/affix";
import { itemMass, rollDrop, type ItemDrop } from "@jgengine/core/loot/drop";
import { assertLootCatalog, validateLootItem, type LootBaseDef, type LootCatalog, type LootItem, type LootManufacturerDef } from "@jgengine/core/loot/lootGen";
import type { SalvageTable } from "@jgengine/core/loot/salvage";
import { salvageValue } from "@jgengine/core/loot/salvage";
import type { Zone } from "../world";

/**
 * Everything a Little can carry home. A find is a rolled drop: its kind is the base, its level is
 * the depth of the room it came from, and the same spot in the same run always rolls the same
 * instance. Size and weight are real: a cheese cube needs both arms.
 */
export type ItemKind =
  | "crumb" | "sugar-cube" | "cheese-cube" | "raisin" | "cereal-ring" | "cookie-shard" | "peanut" | "gummy-bear"
  | "watch-battery" | "spring" | "paperclip" | "rubber-band" | "screw" | "toy-gear" | "safety-pin" | "thread-spool" | "tissue"
  | "button" | "marble" | "coin" | "bead" | "earring" | "tiny-key" | "dice" | "brick" | "crayon" | "stamp" | "sequin" | "spider-silk"
  | "thimble" | "needle" | "napkin" | "grapple" | "button-shield" | "candle" | "slingshot"
  | "bottle-cap";
export type Category = "food" | "part" | "curio" | "gear" | "cap";
export type GearEffect = "helmet" | "spear" | "parachute" | "grapple" | "shield" | "torch" | "slingshot";
export type SetId = "sewing-basket" | "junk-drawer" | "midnight-feast" | "treasure-hoard" | "toy-box";

export interface ItemKindDef {
  name: string; category: Category; w: number; h: number; mass: number; value: number; color: string;
  /** One line of flavour, in the Littles' own words. */
  flavor: string;
  /** Needs both arms: slows anyone but a Brute. */
  bulky?: boolean;
  set?: SetId;
  gear?: GearEffect;
  /** Where in the house it turns up most; absent means anywhere. */
  zones?: readonly Zone[];
  /** Shallowest room it can roll in. */
  minDepth?: number;
  /** Pick weight among its category. */
  weight?: number;
}

export const ITEMS: Record<ItemKind, ItemKindDef> = {
  crumb: { name: "Toast crumb", category: "food", w: 1, h: 1, mass: 0.3, value: 3, color: "#c8873f", flavor: "Still faintly buttery. A whole supper for a Little.", set: "midnight-feast", weight: 5 },
  "sugar-cube": { name: "Sugar cube", category: "food", w: 1, h: 1, mass: 0.8, value: 8, color: "#f6f3ec", flavor: "A crystal boulder. Lick it and you can run all night.", set: "midnight-feast", zones: ["kitchen"], weight: 3 },
  "cheese-cube": { name: "Cheese cube", category: "food", w: 2, h: 2, mass: 3.2, value: 24, color: "#f0c445", flavor: "Takes two arms and a strong back. Worth every step.", bulky: true, set: "midnight-feast", zones: ["kitchen"], minDepth: 1, weight: 1.5 },
  raisin: { name: "Raisin", category: "food", w: 1, h: 1, mass: 0.5, value: 6, color: "#5a2d3c", flavor: "A wrinkled purple sack of sweetness.", set: "midnight-feast", weight: 3 },
  "cereal-ring": { name: "Cereal ring", category: "food", w: 1, h: 1, mass: 0.4, value: 5, color: "#e3a43a", flavor: "Fits over your head like a lifebelt.", zones: ["kitchen", "living"], weight: 3 },
  "cookie-shard": { name: "Cookie shard", category: "food", w: 2, h: 1, mass: 1.2, value: 14, color: "#b07a3a", flavor: "A slab of biscuit with a chocolate seam in it.", set: "midnight-feast", minDepth: 1, weight: 2 },
  peanut: { name: "Peanut", category: "food", w: 1, h: 1, mass: 0.6, value: 7, color: "#c99a5b", flavor: "Shell it at home. Never near the dog.", zones: ["living", "garage"], weight: 2 },
  "gummy-bear": { name: "Gummy bear", category: "food", w: 1, h: 1, mass: 0.7, value: 12, color: "#e0413a", flavor: "A wobbling red giant. Squeaks if you squeeze.", zones: ["kidroom", "living"], minDepth: 2, weight: 1 },

  "watch-battery": { name: "Watch battery", category: "part", w: 1, h: 1, mass: 1, value: 26, color: "#c9ced2", flavor: "Lick it and your tongue fizzes. Powers half the burrow.", set: "junk-drawer", minDepth: 1, weight: 1.5 },
  spring: { name: "Trap spring", category: "part", w: 1, h: 1, mass: 0.5, value: 18, color: "#9aa3a8", flavor: "Coiled from a mousetrap. Handle with respect.", weight: 0.6 },
  paperclip: { name: "Paperclip", category: "part", w: 2, h: 1, mass: 0.4, value: 9, color: "#b8c4cc", flavor: "Bend it right and it becomes a grappling hook.", set: "junk-drawer", weight: 3 },
  "rubber-band": { name: "Rubber band", category: "part", w: 1, h: 1, mass: 0.2, value: 6, color: "#c6573b", flavor: "Stretchy rope. Snaps back if you’re careless.", set: "junk-drawer", weight: 3 },
  screw: { name: "Screw", category: "part", w: 2, h: 1, mass: 0.6, value: 10, color: "#d8dde0", flavor: "A steel log with a thread like a spiral stair.", set: "junk-drawer", zones: ["garage", "attic", "living"], weight: 2.5 },
  "toy-gear": { name: "Toy gear", category: "part", w: 1, h: 1, mass: 0.8, value: 16, color: "#e8b52b", flavor: "A plastic cog from a broken clockwork toy.", set: "toy-box", zones: ["kidroom", "attic"], minDepth: 2, weight: 1.5 },
  "safety-pin": { name: "Safety pin", category: "part", w: 2, h: 1, mass: 0.4, value: 12, color: "#cfd6da", flavor: "A clasp, a spike and a hinge in one.", set: "sewing-basket", weight: 2 },
  "thread-spool": { name: "Thread spool", category: "part", w: 1, h: 2, mass: 1.5, value: 12, color: "#4d6fb3", flavor: "A whole reel of rope. The Littles’ favourite thing.", set: "sewing-basket", weight: 2 },
  tissue: { name: "Tissue scrap", category: "part", w: 2, h: 2, mass: 0.2, value: 4, color: "#f4f1ea", flavor: "Light as moth wings. Becomes a parachute.", zones: ["kitchen", "kidroom", "living"], weight: 2 },

  button: { name: "Lost button", category: "curio", w: 1, h: 1, mass: 0.6, value: 15, color: "#6aa0c8", flavor: "Four holes, a polished rim. Makes a fine shield.", set: "sewing-basket", weight: 3 },
  marble: { name: "Marble", category: "curio", w: 1, h: 1, mass: 1.4, value: 30, color: "#3a7bd5", flavor: "A glass planet with a twist of blue inside.", set: "treasure-hoard", zones: ["kidroom", "living"], minDepth: 1, weight: 1.5 },
  coin: { name: "Coin", category: "curio", w: 2, h: 2, mass: 4, value: 48, color: "#c9a24b", flavor: "Heavy as a millstone, bright as the moon. The family won’t miss it.", bulky: true, set: "treasure-hoard", minDepth: 1, weight: 1.4 },
  bead: { name: "Glass bead", category: "curio", w: 1, h: 1, mass: 0.2, value: 14, color: "#c45ab3", flavor: "Look through the hole and the world goes pink.", set: "treasure-hoard", weight: 2.5 },
  earring: { name: "Lost earring", category: "curio", w: 1, h: 1, mass: 0.3, value: 64, color: "#9fe4ff", flavor: "A real sparkle. Somebody cried over this one.", set: "treasure-hoard", minDepth: 2, weight: 0.5 },
  "tiny-key": { name: "Tiny key", category: "curio", w: 1, h: 1, mass: 0.5, value: 40, color: "#d4af37", flavor: "Opens a diary, or a music box, or nothing at all.", set: "junk-drawer", minDepth: 2, weight: 0.8 },
  dice: { name: "Die", category: "curio", w: 1, h: 1, mass: 1, value: 20, color: "#f5f1e6", flavor: "A white cube with black dots. Littles use it to settle arguments.", set: "toy-box", zones: ["living", "kidroom"], weight: 1.5 },
  brick: { name: "Building brick", category: "curio", w: 2, h: 1, mass: 2.2, value: 28, color: "#d23b30", flavor: "Plastic, studded, unbreakable. The best building material there is.", bulky: true, set: "toy-box", zones: ["kidroom", "living"], minDepth: 1, weight: 1.5 },
  crayon: { name: "Crayon stub", category: "curio", w: 2, h: 1, mass: 0.8, value: 11, color: "#7a3fb0", flavor: "Wax for candles, colour for the walls.", set: "toy-box", zones: ["kidroom"], weight: 2 },
  stamp: { name: "Postage stamp", category: "curio", w: 1, h: 1, mass: 0.1, value: 25, color: "#c0473b", flavor: "A tiny painting of a queen. Rolls up like a rug.", set: "treasure-hoard", zones: ["living", "attic"], minDepth: 1, weight: 1 },
  sequin: { name: "Sequin", category: "curio", w: 1, h: 1, mass: 0.1, value: 9, color: "#ffd86b", flavor: "A coin-sized mirror. Catches every light in the room.", weight: 2 },
  "spider-silk": { name: "Spider silk", category: "curio", w: 1, h: 1, mass: 0.1, value: 34, color: "#eef2f5", flavor: "Stronger than thread. Taken from a spider that won’t need it.", weight: 0 },

  thimble: { name: "Thimble helmet", category: "gear", w: 1, h: 1, mass: 1.1, value: 30, color: "#c0c4c6", flavor: "Wear it on your head. Halves every bump and bite.", set: "sewing-basket", gear: "helmet", minDepth: 1, weight: 1 },
  needle: { name: "Sewing-needle spear", category: "gear", w: 3, h: 1, mass: 0.9, value: 32, color: "#dfe6ea", flavor: "F to jab. Spiders hate it; cats remember it.", set: "sewing-basket", gear: "spear", minDepth: 1, weight: 1 },
  napkin: { name: "Napkin parachute", category: "gear", w: 2, h: 2, mass: 0.4, value: 22, color: "#f2ede0", flavor: "Step off any edge and float down like a dandelion.", gear: "parachute", zones: ["kitchen"], minDepth: 1, weight: 0.8 },
  grapple: { name: "Paperclip grapple", category: "gear", w: 2, h: 1, mass: 0.7, value: 34, color: "#b8c4cc", flavor: "Hook, thread, haul. Climbs in a blink and gets you back up any drop.", gear: "grapple", minDepth: 2, weight: 0.5 },
  "button-shield": { name: "Button shield", category: "gear", w: 1, h: 2, mass: 0.9, value: 30, color: "#6aa0c8", flavor: "Turns one pounce or bite a room. Ring it and pray.", gear: "shield", minDepth: 2, weight: 0.5 },
  candle: { name: "Birthday-candle torch", category: "gear", w: 1, h: 2, mass: 0.6, value: 24, color: "#f2d7a4", flavor: "Lights the dark rooms and keeps spiders back. Cats see it too.", gear: "torch", zones: ["kitchen", "kidroom"], minDepth: 1, weight: 0.8 },
  slingshot: { name: "Rubber-band slingshot", category: "gear", w: 2, h: 1, mass: 0.5, value: 26, color: "#c6573b", flavor: "G to fling a pebble across the room. Things that hunt by ear go and look.", gear: "slingshot", minDepth: 1, weight: 0.8 },

  "bottle-cap": { name: "Bottle cap", category: "cap", w: 1, h: 1, mass: 0.5, value: 10, color: "#b8352b", flavor: "The Littles’ money. Ten caps buys a week of crumbs.", weight: 3 },
};
export const ITEM_KINDS = Object.keys(ITEMS) as ItemKind[];
export function isItemKind(value: unknown): value is ItemKind { return typeof value === "string" && Object.hasOwn(ITEMS, value); }
export type Item = ItemDrop;

/** The kind behind a rolled item; every saved item's base is one of these. */
export function kindOf(item: Pick<LootItem, "baseId">): ItemKind {
  if (!isItemKind(item.baseId)) throw new Error(`crumb-run: unknown item base "${item.baseId}"`);
  return item.baseId;
}
export const defOf = (item: Pick<LootItem, "baseId">): ItemKindDef => ITEMS[kindOf(item)];

/** Sets: carried home in one haul, every piece is worth half again and the set pays a bonus. */
export const SETS: Record<SetId, { name: string; pieces: readonly ItemKind[]; bonus: number; flavor: string }> = {
  "sewing-basket": { name: "Sewing Basket", pieces: ["thimble", "needle", "thread-spool", "button", "safety-pin"], bonus: 60, flavor: "Everything a Little needs to make anything." },
  "junk-drawer": { name: "Junk Drawer", pieces: ["paperclip", "rubber-band", "watch-battery", "tiny-key", "screw"], bonus: 50, flavor: "The drawer every house has. Now the burrow has one too." },
  "midnight-feast": { name: "Midnight Feast", pieces: ["crumb", "sugar-cube", "cheese-cube", "raisin", "cookie-shard"], bonus: 40, flavor: "Enough for a party in the walls." },
  "treasure-hoard": { name: "Treasure Hoard", pieces: ["coin", "marble", "earring", "bead", "stamp"], bonus: 120, flavor: "Shiny things, all in one heap. Dragons would be jealous." },
  "toy-box": { name: "Toy Box", pieces: ["brick", "dice", "crayon", "toy-gear"], bonus: 70, flavor: "The kid's best things, in a Little's best hiding place." },
};
export const SET_IDS = Object.keys(SETS) as SetId[];

/** The five-tier ladder; rarity owns how many affixes a roll carries. */
export const RARITIES: readonly RarityTier[] = [
  { id: "common", at: 0, weight: 50, affixCount: 0 },
  { id: "uncommon", at: 1, weight: 28, affixCount: 1, statScale: 1.1, namePart: "Polished" },
  { id: "rare", at: 2, weight: 14, affixCount: 1, statScale: 1.25, namePart: "Gleaming" },
  { id: "epic", at: 3, weight: 6, affixCount: 2, statScale: 1.45, namePart: "Heirloom" },
  { id: "legendary", at: 4, weight: 2, affixCount: 2, statScale: 1.8, namePart: "Legendary" },
];

const POOLS: readonly AffixPool[] = [
  {
    id: "found",
    affixes: [
      { id: "pristine", stat: "value", op: "mul", roll: [1.15, 1.45], weight: 3, namePart: { position: "prefix", text: "Pristine" } },
      { id: "sticky", stat: "value", op: "mul", roll: [0.8, 0.95], weight: 2, namePart: { position: "prefix", text: "Sticky" } },
      { id: "dusty", stat: "value", op: "add", roll: [2, 6], weight: 2, namePart: { position: "suffix", text: "from the Dust" } },
      { id: "storied", stat: "value", op: "add", roll: [6, 16], weight: 1, minLevel: 3, namePart: { position: "suffix", text: "of Old" } },
    ],
  },
  {
    id: "kit",
    affixes: [
      { id: "trusty", stat: "value", op: "mul", roll: [1.1, 1.3], weight: 3, namePart: { position: "prefix", text: "Trusty" } },
      { id: "patched", stat: "value", op: "mul", roll: [0.85, 0.95], weight: 2, namePart: { position: "prefix", text: "Patched" } },
    ],
  },
];

const byCategory = (category: Category) => ITEM_KINDS.filter(kind => ITEMS[kind].category === category);
const BASES: readonly LootBaseDef[] = ITEM_KINDS.map(kind => ({
  id: kind, name: ITEMS[kind].name, baseStats: { value: ITEMS[kind].value }, pools: [ITEMS[kind].category === "gear" ? "kit" : "found"], mass: ITEMS[kind].mass,
}));
const MANUFACTURERS: readonly LootManufacturerDef[] = [
  { id: "pantry", name: "Fresh", bases: byCategory("food"), scale: { value: 1.05 } },
  { id: "drawer", name: "Spare", bases: byCategory("part") },
  { id: "lost", name: "Lost", bases: byCategory("curio"), favoredPools: ["found"] },
  { id: "burrow", name: "Little", bases: byCategory("gear") },
  { id: "fizz", name: "Fizzy", bases: byCategory("cap") },
];

/** Every roll in the house reads this one table; a bad entry throws at module load. */
export const ITEM_CATALOG: LootCatalog = {
  bases: BASES, parts: [], pools: POOLS, rarities: RARITIES, manufacturers: MANUFACTURERS,
  levelScale: [[1, 1], [4, 1.25], [8, 1.5], [12, 1.8]],
};
assertLootCatalog(ITEM_CATALOG);

/** Item level is the room's depth plus one; the same seed always rolls the same item. */
export function rollItem(kind: ItemKind, level: number, seed: string, id: string): Item {
  return rollDrop(ITEM_CATALOG, seed, { id, level: Math.min(12, Math.max(1, Math.round(level))), baseId: kind });
}
/** What the swap-meet pays for an item, in caps: the roll's own value stat. */
export function itemValue(item: Item): number { return Math.max(0, Math.round(item.stats["value"] ?? 0)); }
export function itemWeight(item: Item): number { return Math.round(itemMass(item) * 100) / 100; }
/** Gear's effect, or null for an ordinary find. */
export function gearOf(item: Pick<LootItem, "baseId">): GearEffect | null { return defOf(item).gear ?? null; }

/** What trading an item in pays, through the shared salvage table: never less than its rolled value's third. */
export const TRADE: SalvageTable = {
  currency: "caps", perLevel: 2,
  rarityMultiplier: { common: 1, uncommon: 1.3, rare: 1.7, epic: 2.2, legendary: 3 },
  minimum: 2,
};
export function tradeValue(item: Item): number {
  return Math.max(salvageValue(item, TRADE).amount, Math.round(itemValue(item) * 0.6));
}
export function itemIssues(item: LootItem): string[] {
  return validateLootItem(item, ITEM_CATALOG).map(issue => `${issue.code}: ${issue.detail}`);
}

/** The complete sets inside a group of items, each counted once. */
export function completeSets(items: readonly Pick<LootItem, "baseId">[]): SetId[] {
  const kinds = new Set(items.map(item => item.baseId));
  return SET_IDS.filter(id => SETS[id].pieces.every(piece => kinds.has(piece)));
}
