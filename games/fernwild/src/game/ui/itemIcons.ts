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
  mejoberry_seed: "gameicons:lorc/seedling",
  fertilizer: "gameicons:delapouite/fertilizer-bag",
  crop_plot: "gameicons:delapouite/field",
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
  preserving_bin: "gameicons:delapouite/barrel",
  hide_sleeping_bag: "gameicons:delapouite/sleeping-bag",
  cloth_shirt: "gameicons:lucasms/shirt",
  cloth_pants: "gameicons:lorc/trousers",
  cloth_hat: "gameicons:delapouite/outback-hat",
  cloth_gloves: "gameicons:delapouite/gloves",
  cloth_boots: "gameicons:lorc/boots",
  waterskin: "gameicons:delapouite/waterskin",
  slingshot: "gameicons:delapouite/slingshot",
  bola: "gameicons:delapouite/hunting-bolas",
  bow: "gameicons:lorc/pocket-bow",
  stone_arrow: "gameicons:delapouite/plain-arrow",
  tranq_arrow: "gameicons:lorc/arrow-flights",
};

/** Families sharing one icon, by id prefix or suffix. */
const ARTIFACT = "gameicons:delapouite/glowing-artifact";
const TROPHY = "gameicons:lorc/trophy";
const BERRY = "gameicons:lorc/elderberry";
const SADDLE = "gameicons:delapouite/saddle";
const EGG = "gameicons:lorc/egg-clutch";
const KIBBLE = "gameicons:delapouite/dog-bowl";

/** Building pieces by shape. */
const BY_SHAPE: Readonly<Record<string, string>> = {
  campfire: "gameicons:lorc/campfire",
  mortar_and_pestle: "gameicons:skoll/pestle-mortar",
  cooking_pot: "gameicons:delapouite/cooking-pot",
  foundation: "gameicons:lorc/stone-block",
  wall: "gameicons:delapouite/stone-wall",
  doorframe: "gameicons:delapouite/wood-frame",
  door: "gameicons:delapouite/door",
  ceiling: "gameicons:delapouite/packed-planks",
  ramp: "gameicons:delapouite/stairs",
  pillar: "gameicons:delapouite/wood-beam",
};

/** ARK's vital icons on the HUD, one game-icons.net glyph per pool. */
export const VITAL_ICON = {
  health: "gameicons:sbed/health-normal",
  stamina: "gameicons:badges/bolt",
  food: "gameicons:lorc/chicken-leg",
  water: "gameicons:sbed/water-drop",
  weight: "gameicons:delapouite/weight",
  torpor: "gameicons:lorc/sleepy",
  oxygen: "gameicons:lorc/bubbles",
  xp: "gameicons:delapouite/upgrade",
  temperature: "gameicons:lorc/thermometer-scale",
} as const;

/** The game-icons.net key an item draws with, or null for an item with none. */
export function itemIconKey(itemId: string): string | null {
  const direct = BY_ITEM[itemId];
  if (direct !== undefined) return direct;
  if (itemId.startsWith("artifact_")) return ARTIFACT;
  if (itemId.includes("_trophy_")) return TROPHY;
  if (itemId.endsWith("berry")) return BERRY;
  if (itemId.startsWith("egg_")) return EGG;
  if (itemId.startsWith("kibble_")) return KIBBLE;
  const def = itemDef(itemId);
  if (def?.kind === "saddle") return SADDLE;
  const shape = structureDef(itemId)?.shape;
  return shape === undefined ? null : (BY_SHAPE[shape] ?? null);
}

/** Every icon the game ships, for its credits. */
export const ITEM_ICON_KEYS: readonly string[] = [...new Set([...Object.values(BY_ITEM), ARTIFACT, TROPHY, BERRY, SADDLE, EGG, KIBBLE, ...Object.values(BY_SHAPE), ...Object.values(VITAL_ICON)])];

/** One credit line per game-icons.net artist. */
export function itemIconCredits(): string[] {
  return libraryIconCredits(ITEM_ICON_KEYS).flatMap((section) => section.entries.map((entry) => `${entry.label} (${section.heading}): ${entry.detail ?? ""}`));
}
