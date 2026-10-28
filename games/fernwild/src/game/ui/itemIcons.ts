import { libraryIconCredits } from "@jgengine/assets/library/libraryIcons";

import { itemDef } from "../data/items";
import { structureDef } from "../data/structures";

/** game-icons.net icon per item id. */
const BY_ITEM: Readonly<Record<string, string>> = {
  thatch: "gameicons:delapouite/round-straw-bale",
  wood: "gameicons:delapouite/log",
  stone: "gameicons:delapouite/stone-pile",
  flint: "gameicons:delapouite/flint-spark",
  fiber: "gameicons:delapouite/high-grass",
  hide: "gameicons:delapouite/animal-hide",
  metal: "gameicons:faithtoken/minerals",
  obsidian: "gameicons:lorc/crystal-growth",
  crystal: "gameicons:lorc/crystal-cluster",
  oil: "gameicons:delapouite/barrel",
  sparkpowder: "gameicons:lorc/powder",
  argentavis_talon: "gameicons:lorc/bird-claw",
  sarcosuchus_skin: "gameicons:lorc/dorsal-scales",
  sauropod_vertebra: "gameicons:lorc/dinosaur-bones",
  titanoboa_venom: "gameicons:lorc/chemical-drop",
  element: "gameicons:lorc/floating-crystal",
  spider_flag: "gameicons:delapouite/flag-objective",
  raw_meat: "gameicons:lorc/meat",
  raw_prime_meat: "gameicons:delapouite/steak",
  cooked_meat: "gameicons:delapouite/kebab-spit",
  spoiled_meat: "gameicons:lorc/meat",
  narcotic: "gameicons:lorc/pill",
  stimulant: "gameicons:delapouite/medicine-pills",
  stone_pick: "gameicons:lorc/mining",
  stone_hatchet: "gameicons:delapouite/hatchet",
  wooden_club: "gameicons:delapouite/wood-club",
  spear: "gameicons:lorc/stone-spear",
  torch: "gameicons:delapouite/primitive-torch",
  storage_box: "gameicons:delapouite/chest",
  hide_sleeping_bag: "gameicons:delapouite/sleeping-bag",
  cloth_shirt: "gameicons:lucasms/shirt",
  cloth_pants: "gameicons:lorc/trousers",
  cloth_hat: "gameicons:delapouite/outback-hat",
  cloth_gloves: "gameicons:delapouite/gloves",
  cloth_boots: "gameicons:lorc/boots",
  waterskin: "gameicons:delapouite/waterskin",
  slingshot: "gameicons:delapouite/slingshot",
};

/** Families sharing one icon, by id prefix or suffix. */
const ARTIFACT = "gameicons:delapouite/glowing-artifact";
const TROPHY = "gameicons:lorc/trophy";
const BERRY = "gameicons:lorc/elderberry";
const SADDLE = "gameicons:delapouite/saddle";

/** Building pieces by shape. */
const BY_SHAPE: Readonly<Record<string, string>> = {
  campfire: "gameicons:lorc/campfire",
  mortar_and_pestle: "gameicons:skoll/pestle-mortar",
  foundation: "gameicons:lorc/stone-block",
  wall: "gameicons:delapouite/stone-wall",
  doorframe: "gameicons:delapouite/wood-frame",
  door: "gameicons:delapouite/door",
  ceiling: "gameicons:delapouite/packed-planks",
  ramp: "gameicons:delapouite/stairs",
  pillar: "gameicons:delapouite/wood-beam",
};

/** The game-icons.net key an item draws with, or null for an item with none. */
export function itemIconKey(itemId: string): string | null {
  const direct = BY_ITEM[itemId];
  if (direct !== undefined) return direct;
  if (itemId.startsWith("artifact_")) return ARTIFACT;
  if (itemId.includes("_trophy_")) return TROPHY;
  if (itemId.endsWith("berry")) return BERRY;
  const def = itemDef(itemId);
  if (def?.kind === "saddle") return SADDLE;
  const shape = structureDef(itemId)?.shape;
  return shape === undefined ? null : (BY_SHAPE[shape] ?? null);
}

/** Every icon the game ships, for its credits. */
export const ITEM_ICON_KEYS: readonly string[] = [...new Set([...Object.values(BY_ITEM), ARTIFACT, TROPHY, BERRY, SADDLE, ...Object.values(BY_SHAPE)])];

/** One credit line per game-icons.net artist. */
export function itemIconCredits(): string[] {
  return libraryIconCredits(ITEM_ICON_KEYS).flatMap((section) => section.entries.map((entry) => `${entry.label} (${section.heading}): ${entry.detail ?? ""}`));
}
