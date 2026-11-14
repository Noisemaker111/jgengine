import { libraryIconCredits } from "@jgengine/assets/library/libraryIcons";

import { itemDef } from "./items";
import { structureDef } from "./structures";

/** game-icons.net icon per item id. */
const BY_ITEM: Readonly<Record<string, string>> = {
  thatch: "gameicons:delapouite/round-straw-bale",
  wood: "gameicons:delapouite/log",
  stone: "gameicons:delapouite/stone-pile",
  flint: "gameicons:delapouite/flint-spark",
  fiber: "gameicons:delapouite/high-grass",
  salvage: "gameicons:lorc/gear-hammer",
  metal: "gameicons:faithtoken/minerals",
  metal_ingot: "gameicons:lorc/metal-bar",
  metal_pick: "gameicons:delapouite/war-pick",
  metal_hatchet: "gameicons:lorc/wood-axe",
  refining_forge: "gameicons:delapouite/furnace",
  obsidian: "gameicons:lorc/crystal-growth",
  crystal: "gameicons:lorc/crystal-cluster",
  oil: "gameicons:delapouite/barrel",
  sparkpowder: "gameicons:lorc/powder",
  mejoberry_seed: "gameicons:lorc/seedling",
  fertilizer: "gameicons:delapouite/fertilizer-bag",
  crop_plot: "gameicons:delapouite/field",
  homer_beacon: "gameicons:lorc/radar-dish",
  arcwire_coil: "gameicons:lorc/electrical-crescent",
  hoover_turbine: "gameicons:delapouite/turbine",
  coilcobra_capacitor: "gameicons:lorc/processor",
  element: "gameicons:lorc/floating-crystal",
  hive_flag: "gameicons:delapouite/flag-objective",
  biogel: "gameicons:lorc/potion-ball",
  prime_biogel: "gameicons:lorc/round-bottom-flask",
  gel_ration: "gameicons:delapouite/jelly-beans",
  soured_gel: "gameicons:lorc/goo-explosion",
  drain_spike: "gameicons:delapouite/spark-plug",
  stimulant: "gameicons:delapouite/medicine-pills",
  stone_pick: "gameicons:lorc/mining",
  stone_hatchet: "gameicons:delapouite/hatchet",
  wooden_club: "gameicons:delapouite/wood-club",
  spear: "gameicons:lorc/stone-spear",
  torch: "gameicons:delapouite/primitive-torch",
  storage_box: "gameicons:delapouite/chest",
  preserving_bin: "gameicons:delapouite/barrel",
  bedroll: "gameicons:delapouite/sleeping-bag",
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
  emp_arrow: "gameicons:lorc/arrow-flights",
  obsidian_arrow: "gameicons:lorc/broadhead-arrow",
  element_pick: "gameicons:delapouite/pick-of-destiny",
  snow_mask: "gameicons:delapouite/steampunk-goggles",
  oilskin_coat: "gameicons:delapouite/pirate-coat",
  hive_greaves: "gameicons:delapouite/greaves",
  hive_gauntlets: "gameicons:delapouite/gauntlet",
  hive_treads: "gameicons:lorc/steeltoe-boots",
};

/** Families sharing one icon, by id prefix or suffix. */
const ARTIFACT = "gameicons:lorc/circuitry";
const TROPHY = "gameicons:lorc/trophy";
const BERRY = "gameicons:lorc/elderberry";
const SADDLE = "gameicons:lorc/gear-hammer";
const EGG = "gameicons:delapouite/power-generator";
const FIRMWARE = "gameicons:lorc/microchip";

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
  if (itemId.startsWith("firmware_")) return FIRMWARE;
  const def = itemDef(itemId);
  if (def?.kind === "saddle") return SADDLE;
  const shape = structureDef(itemId)?.shape;
  return shape === undefined ? null : (BY_SHAPE[shape] ?? null);
}

/** Every icon the game ships, for its credits. */
export const ITEM_ICON_KEYS: readonly string[] = [...new Set([...Object.values(BY_ITEM), ARTIFACT, TROPHY, BERRY, SADDLE, EGG, FIRMWARE, ...Object.values(BY_SHAPE), ...Object.values(VITAL_ICON)])];

/** One credit line per game-icons.net artist. */
export function itemIconCredits(): string[] {
  return libraryIconCredits(ITEM_ICON_KEYS).flatMap((section) => section.entries.map((entry) => `${entry.label} (${section.heading}): ${entry.detail ?? ""}`));
}
