import type { SpoilRule } from "@jgengine/core/inventory/spoilage";
import type { ToolProfile } from "@jgengine/core/world/resourceNode";

import { SPECIES } from "./species";
import { STRUCTURES } from "./structures";

/**
 * Food goes off in the bag, a unit at a time per stack, as in ARK: raw meat in 10 minutes, cooked meat
 * in 20, both into spoiled meat, the narcotic's base. Spoiled meat itself rots away in an hour.
 */
export const SPOILS: Readonly<Record<string, SpoilRule>> = {
  raw_meat: { seconds: 600, into: "spoiled_meat" },
  raw_prime_meat: { seconds: 600, into: "spoiled_meat" },
  cooked_meat: { seconds: 1200, into: "spoiled_meat" },
  spoiled_meat: { seconds: 3600, into: null },
};

/** What eating or drinking one unit does to the survivor. */
export interface Consume {
  food?: number;
  water?: number;
  health?: number;
  stamina?: number;
  torpor?: number;
}

/** A tool's swing: how it gathers, how far it reaches and what it hits for. */
export interface ToolDef {
  /** Gathering against trees, rocks and bushes. */
  gather: ToolProfile;
  /** Metres. */
  reach: number;
  /** Damage at 100% melee. */
  damage: number;
  /** Torpor added per hit (clubs knock out). */
  torpor?: number;
  /** Stamina per swing. */
  stamina: number;
  /** Seconds between swings. */
  cooldown: number;
  /** What a structure tier sees this hit as (ARK: wood ignores fists and stone tools). Default `"primitive"`. */
  damageClass?: "fist" | "primitive" | "ranged" | "metal";
}

export type ItemKind = "resource" | "consumable" | "tool" | "structure" | "armor" | "saddle" | "ammo";

/** One item as the survivor carries it: weight in kg per unit and how many stack in one slot. */
export interface ItemDef {
  id: string;
  label: string;
  kind: ItemKind;
  weight: number;
  stack: number;
  consume?: Consume;
  tool?: ToolDef;
  /** Short words for the tooltip, ours not ARK's. */
  note: string;
}

const resource = (id: string, label: string, weight: number, stack: number, note: string): ItemDef => ({ id, label, kind: "resource", weight, stack, note });
const berry = (id: string, label: string, consume: Consume, note: string): ItemDef => ({ id, label, kind: "consumable", weight: 0.1, stack: 100, consume, note });

/**
 * Bare hands: ARK's 8-damage punch, thatch from trees, a little stone from rocks. A punch knocks out
 * as well as hurts: ARK deals 1.75x a fist's damage as torpor, so a dodo sleeps before it dies.
 * Each tool's `torpor` is what one hit lands on a creature.
 */
export const FIST: ToolDef = {
  gather: { power: 1, biases: { thatch: 1, wood: 0.35, stone: 0.5, flint: 0.25, fiber: 0, raw_meat: 0.5, hide: 0.5 }, defaultBias: 0 },
  reach: 1.6,
  damage: 8,
  torpor: 8 * 1.75,
  damageClass: "fist",
  stamina: 5,
  cooldown: 0.55,
};

/** Hand picking with E: fiber and berries from bushes, stones off the ground. */
export const PICK_UP: ToolDef = {
  gather: { power: 1, biases: { fiber: 1, stone: 1, flint: 1 }, defaultBias: 1 },
  reach: 2.2,
  damage: 0,
  stamina: 0,
  cooldown: 0.35,
};

export const ITEMS: readonly ItemDef[] = [
  resource("thatch", "Thatch", 0.02, 200, "Bundled twigs and leaves, punched from trees."),
  resource("wood", "Wood", 0.5, 100, "Logs chopped from trees. A hatchet gets far more."),
  resource("stone", "Stone", 0.5, 100, "Broken rock. A hatchet on boulders gets plenty."),
  resource("flint", "Flint", 0.05, 100, "Sharp stone flakes. A pick on boulders gets plenty."),
  resource("fiber", "Fiber", 0.01, 300, "Plant fiber pulled from bushes by hand."),
  resource("hide", "Hide", 0.01, 200, "Skin from a carcass."),
  resource("metal", "Metal", 1, 300, "Raw ore from the glinting rocks high in the mountains."),
  resource("obsidian", "Obsidian", 1, 100, "Black volcanic glass from the volcano and the high cliffs."),
  resource("crystal", "Crystal", 1, 100, "Clear shards from the highest peaks and the snow."),
  resource("oil", "Oil", 0.2, 100, "Thick black oil from the dark rocks on the frozen shore."),
  resource("sparkpowder", "Sparkpowder", 0.01, 100, "Ground flint and stone that lights fires."),
  // ARK's cave artifacts: one on a pedestal at the end of each cave, back half an hour after it is taken.
  resource("artifact_clever", "Artifact of the Clever", 1, 1, "A glowing relic from the deepest chamber of the central cave; the island's guardian wants it."),
  resource("artifact_skylord", "Artifact of the Skylord", 1, 1, "A glowing relic from the deepest chamber of the north-west cave; the island's guardian wants it."),
  resource("artifact_hunter", "Artifact of the Hunter", 1, 1, "A glowing relic from the deepest chamber of the lower south cave; the island's guardian wants it."),
  resource("artifact_devourer", "Artifact of the Devourer", 1, 1, "A glowing relic from the deepest chamber of the north-east cave; the island's guardian wants it."),
  resource("artifact_pack", "Artifact of the Pack", 1, 1, "A glowing relic from the deepest chamber of the upper south cave; the island's guardian wants it."),
  resource("artifact_massive", "Artifact of the Massive", 1, 1, "A glowing relic from the deepest chamber of the lava cave; the island's guardian wants it."),
  resource("artifact_immune", "Artifact of the Immune", 1, 1, "A glowing relic from the deepest chamber of the swamp cave; the island's guardian wants it."),
  resource("artifact_strong", "Artifact of the Strong", 1, 1, "A glowing relic from the deepest chamber of the snow cave; the island's guardian wants it."),
  // The Broodmother's tribute trophies, found on the bodies of the creatures that carry them, and what she leaves.
  resource("argentavis_talon", "Argentavis Talon", 2, 100, "Found on a dead Argentavis. The Broodmother's Beta and Alpha tribute asks for them."),
  resource("sarcosuchus_skin", "Sarcosuchus Skin", 2, 100, "Found on a dead Sarco. The Broodmother's Beta and Alpha tribute asks for them."),
  resource("sauropod_vertebra", "Sauropod Vertebra", 2, 100, "Found on a dead Brontosaurus or Diplodocus. The Broodmother's Beta and Alpha tribute asks for them."),
  resource("titanoboa_venom", "Titanoboa Venom", 2, 100, "Found on a dead Titanoboa. The Broodmother's Beta and Alpha tribute asks for them."),
  resource("element", "Element", 0.1, 100, "Strange glowing matter the guardians leave behind."),
  resource("spider_flag", "Spider Flag", 2, 1, "A banner of the Broodmother, for whoever beat her. Placing it comes later."),
  resource("broodmother_trophy_gamma", "Gamma Broodmother Trophy", 5, 1, "Proof you beat the Gamma Broodmother."),
  resource("broodmother_trophy_beta", "Beta Broodmother Trophy", 5, 1, "Proof you beat the Beta Broodmother."),
  resource("broodmother_trophy_alpha", "Alpha Broodmother Trophy", 5, 1, "Proof you beat the Alpha Broodmother."),
  { id: "raw_meat", label: "Raw Meat", kind: "consumable", weight: 0.1, stack: 40, consume: { food: 10, health: -5 }, note: "Edible, barely. Cook it on a campfire." },
  { id: "raw_prime_meat", label: "Raw Prime Meat", kind: "consumable", weight: 0.1, stack: 20, consume: { food: 15, health: -5 }, note: "The best cut. Carnivores tame fastest on it." },
  { id: "cooked_meat", label: "Cooked Meat", kind: "consumable", weight: 0.1, stack: 40, consume: { food: 20, health: 8 }, note: "Filling and heals a little." },
  { id: "spoiled_meat", label: "Spoiled Meat", kind: "consumable", weight: 0.1, stack: 50, consume: { food: 5, health: -10, torpor: 25 }, note: "Rotten. Good for making narcotics." },
  berry("mejoberry", "Mejoberry", { food: 1.5, water: 0.2 }, "A sweet berry plant-eaters love."),
  berry("amarberry", "Amarberry", { food: 1.5, water: 0.2 }, "A common red berry."),
  berry("azulberry", "Azulberry", { food: 1.5, water: 0.2 }, "A common blue berry."),
  berry("tintoberry", "Tintoberry", { food: 1.5, water: 0.2 }, "A common yellow berry."),
  berry("narcoberry", "Narcoberry", { food: 1.5, torpor: 8 }, "Makes the eater drowsy."),
  berry("stimberry", "Stimberry", { food: 1.5, water: -5, torpor: -7.5 }, "Wakes the eater up and dries them out."),
  { id: "narcotic", label: "Narcotic", kind: "consumable", weight: 0.1, stack: 100, consume: { health: -5, torpor: 40 }, note: "Force-fed to a sleeping creature to keep it under." },
  { id: "stimulant", label: "Stimulant", kind: "consumable", weight: 0.1, stack: 100, consume: { stamina: 30, water: -10, torpor: -40 }, note: "Wakes the eater fast." },
  {
    id: "stone_pick", label: "Stone Pick", kind: "tool", weight: 1, stack: 1, note: "Thatch from trees, flint from rocks, ore from metal, obsidian, crystal and oil rocks.",
    tool: { gather: { power: 1.5, biases: { thatch: 1.6, wood: 0.25, flint: 1.6, stone: 0.35, metal: 1.6, obsidian: 1.6, crystal: 1.6, oil: 1.6, raw_meat: 1.4, hide: 0.4 }, defaultBias: 0 }, reach: 2.2, damage: 15, stamina: 3, cooldown: 0.7 },
  },
  {
    id: "stone_hatchet", label: "Stone Hatchet", kind: "tool", weight: 1, stack: 1, note: "Wood from trees, stone from rocks.",
    tool: { gather: { power: 1.5, biases: { wood: 2.2, thatch: 0.3, stone: 2.2, flint: 0.25, metal: 0.3, obsidian: 0.25, crystal: 0.25, oil: 0.25, hide: 1.4, raw_meat: 0.4 }, defaultBias: 0 }, reach: 2.2, damage: 10, stamina: 3, cooldown: 0.7 },
  },
  {
    id: "wooden_club", label: "Wooden Club", kind: "tool", weight: 1, stack: 1, note: "Knocks creatures out.",
    // ARK's club lands about 3.75x its damage as torpor: a level-1 raptor (180 torpor) sleeps in 9 hits, a
    // phiomia (240) in 12. Fists land more per swing than they did, but the club still outsleeps them.
    tool: { gather: { power: 1, biases: {}, defaultBias: 0 }, reach: 2.3, damage: 5, torpor: 20, stamina: 6, cooldown: 0.9 },
  },
  {
    id: "spear", label: "Spear", kind: "tool", weight: 2, stack: 1, note: "A long, sharp stick for fighting.",
    tool: { gather: { power: 1, biases: { raw_meat: 1, hide: 0.5 }, defaultBias: 0 }, reach: 2.8, damage: 25, stamina: 7, cooldown: 0.9 },
  },
  { id: "torch", label: "Torch", kind: "tool", weight: 0.5, stack: 1, note: "Light and a little warmth.", tool: { gather: { power: 1, biases: {}, defaultBias: 0 }, reach: 1.8, damage: 8, stamina: 5, cooldown: 0.7 } },
  { id: "storage_box", label: "Storage Box", kind: "structure", weight: 4, stack: 100, note: "Holds 15 stacks. Placing it comes later." },
  { id: "hide_sleeping_bag", label: "Hide Sleeping Bag", kind: "structure", weight: 2, stack: 1, note: "A one-time respawn point." },
  { id: "cloth_shirt", label: "Cloth Shirt", kind: "armor", weight: 1, stack: 1, note: "Keeps the sun off." },
  { id: "cloth_pants", label: "Cloth Pants", kind: "armor", weight: 1, stack: 1, note: "Keeps the sun off." },
  { id: "cloth_hat", label: "Cloth Hat", kind: "armor", weight: 0.5, stack: 1, note: "Keeps the sun off." },
  { id: "cloth_gloves", label: "Cloth Gloves", kind: "armor", weight: 0.5, stack: 1, note: "Keeps the sun off." },
  { id: "cloth_boots", label: "Cloth Boots", kind: "armor", weight: 0.5, stack: 1, note: "Keeps the sun off." },
  { id: "waterskin", label: "Waterskin", kind: "consumable", weight: 0.5, stack: 1, consume: { water: 20 }, note: "Carry a drink with you." },
  { id: "slingshot", label: "Slingshot", kind: "tool", weight: 1, stack: 1, note: "Throws stones that knock creatures out.", tool: { gather: { power: 1, biases: {}, defaultBias: 0 }, reach: 2, damage: 5, torpor: 8, damageClass: "ranged", stamina: 4, cooldown: 1 } },
  ...STRUCTURES.map((entry): ItemDef => ({ id: entry.id, label: entry.label, kind: "structure", weight: entry.weight, stack: 100, note: entry.note })),
  ...Object.values(SPECIES).flatMap((def): ItemDef[] =>
    def.saddle === null ? [] : [{ id: def.saddle, label: `${def.label} Saddle`, kind: "saddle", weight: Math.max(4, Math.round(def.weight.base / 40)), stack: 1, note: `Lets you ride a tamed ${def.label}.` }],
  ),
];

const BY_ID = new Map(ITEMS.map((item) => [item.id, item]));

export function itemDef(id: string): ItemDef | null {
  return BY_ID.get(id) ?? null;
}

export function itemLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}

/** Stack limits and kinds for the engine's inventory model. */
export const itemTraits = {
  stackLimit: (id: string) => BY_ID.get(id)?.stack ?? 1,
  kind: (id: string) => BY_ID.get(id)?.kind ?? null,
};
