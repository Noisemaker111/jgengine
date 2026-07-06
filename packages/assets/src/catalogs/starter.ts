import { createAssetCatalog, type AssetCatalog } from "@jgengine/core/scene/assetCatalog";

/**
 * Starter asset catalog for JGengine games.
 *
 * Assumes the starter packs have been downloaded (e.g. via `npx @jgengine/assets init`).
 * Each entry maps a logical asset key to a public URL path.
 *
 * Categories:
 *   - nature:   rocks, trees, bushes, cacti, logs
 *   - weapon:   swords, axes, guns, shields, bows
 *   - item:     potions, coins, chests, keys, food
 *   - prop:     crates, barrels, campfires, fences, signs
 *   - building: houses, towers, walls, doors
 *   - vehicle:  cars, boats, planes, carts
 */

export interface StarterCatalogOptions {
  /** Base URL path where models are served, e.g. "/models" */
  basePath?: string;
}

function path(base: string, pack: string, file: string): string {
  return `${base}/${pack}/${file}.glb`;
}

/**
 * Create an AssetCatalog pre-populated with starter asset mappings.
 *
 * @example
 *   const assets = createStarterCatalog({ basePath: "/models" });
 *   assets.resolve("nature/rock_large"); // => { url: "/models/kenney-nature/rock_large.glb" }
 */
export function createStarterCatalog(options: StarterCatalogOptions = {}): AssetCatalog {
  const base = options.basePath ?? "/models";
  const catalog = createAssetCatalog();

  // ── Nature ──
  catalog.register("nature/rock_large", { url: path(base, "kenney-nature", "cliff_block_rock") });
  catalog.register("nature/rock_small", { url: path(base, "kenney-nature", "stone_smallTop") });
  catalog.register("nature/rock_flat", { url: path(base, "kenney-nature", "stone_flat") });
  catalog.register("nature/tree_pine", { url: path(base, "kenney-nature", "tree_pine") });
  catalog.register("nature/tree_pineTall", { url: path(base, "kenney-nature", "tree_pineTall") });
  catalog.register("nature/tree_pineSmall", { url: path(base, "kenney-nature", "tree_pineSmall") });
  catalog.register("nature/tree_oak", { url: path(base, "kenney-nature", "tree_oak") });
  catalog.register("nature/bush", { url: path(base, "kenney-nature", "plant_bush") });
  catalog.register("nature/bushSmall", { url: path(base, "kenney-nature", "plant_bushSmall") });
  catalog.register("nature/grass", { url: path(base, "kenney-nature", "grass") });
  catalog.register("nature/grassLarge", { url: path(base, "kenney-nature", "grass_large") });
  catalog.register("nature/cactus_short", { url: path(base, "kenney-nature", "cactus_short") });
  catalog.register("nature/cactus_tall", { url: path(base, "kenney-nature", "cactus_tall") });
  catalog.register("nature/log", { url: path(base, "kenney-nature", "log") });
  catalog.register("nature/log_stack", { url: path(base, "kenney-nature", "log_stack") });
  catalog.register("nature/mushroom", { url: path(base, "kenney-nature", "mushroom") });
  catalog.register("nature/mushroom_red", { url: path(base, "kenney-nature", "mushroom_red") });

  // ── Weapons ──
  catalog.register("weapon/sword", { url: path(base, "kenney-weapon-pack", "sword") });
  catalog.register("weapon/sword_broad", { url: path(base, "kenney-weapon-pack", "sword_broad") });
  catalog.register("weapon/axe", { url: path(base, "kenney-weapon-pack", "axe") });
  catalog.register("weapon/axe_double", { url: path(base, "kenney-weapon-pack", "axe_double") });
  catalog.register("weapon/bow", { url: path(base, "kenney-weapon-pack", "bow") });
  catalog.register("weapon/shield", { url: path(base, "kenney-weapon-pack", "shield") });
  catalog.register("weapon/shield_round", { url: path(base, "kenney-weapon-pack", "shield_round") });
  catalog.register("weapon/dagger", { url: path(base, "kenney-weapon-pack", "dagger") });
  catalog.register("weapon/spear", { url: path(base, "kenney-weapon-pack", "spear") });
  catalog.register("weapon/wand", { url: path(base, "kenney-weapon-pack", "wand") });
  catalog.register("weapon/pistol", { url: path(base, "kenney-weapon-pack", "pistol") });
  catalog.register("weapon/rifle", { url: path(base, "kenney-weapon-pack", "rifle") });
  catalog.register("weapon/shotgun", { url: path(base, "kenney-weapon-pack", "shotgun") });
  catalog.register("weapon/sniper", { url: path(base, "kenney-weapon-pack", "sniper") });
  catalog.register("weapon/launcher", { url: path(base, "kenney-weapon-pack", "launcher") });

  // ── Items ──
  catalog.register("item/potion_red", { url: path(base, "kenney-survival-kit", "potions") });
  catalog.register("item/potion_blue", { url: path(base, "kenney-survival-kit", "potions_blue") });
  catalog.register("item/coin", { url: path(base, "kenney-survival-kit", "coin") });
  catalog.register("item/chest", { url: path(base, "kenney-furniture-kit", "cabinet_bedroom") });
  catalog.register("item/chest_small", { url: path(base, "kenney-furniture-kit", "cabinet_small") });
  catalog.register("item/key", { url: path(base, "kenney-survival-kit", "key") });
  catalog.register("item/backpack", { url: path(base, "kenney-survival-kit", "backpack") });
  catalog.register("item/gem", { url: path(base, "kenney-survival-kit", "gem") });
  catalog.register("item/scroll", { url: path(base, "kenney-survival-kit", "scroll") });
  catalog.register("item/book", { url: path(base, "kenney-furniture-kit", "book") });
  catalog.register("item/apple", { url: path(base, "kenney-food-kit", "apple") });
  catalog.register("item/banana", { url: path(base, "kenney-food-kit", "banana") });
  catalog.register("item/bread", { url: path(base, "kenney-food-kit", "bread") });
  catalog.register("item/cheese", { url: path(base, "kenney-food-kit", "cheese") });
  catalog.register("item/fish", { url: path(base, "kenney-food-kit", "fish") });
  catalog.register("item/meat", { url: path(base, "kenney-food-kit", "meat") });
  catalog.register("item/potion_green", { url: path(base, "kenney-food-kit", "soda") });

  // ── Props ──
  catalog.register("prop/crate", { url: path(base, "kenney-furniture-kit", "crate") });
  catalog.register("prop/crate_closed", { url: path(base, "kenney-furniture-kit", "crate") });
  catalog.register("prop/barrel", { url: path(base, "kenney-furniture-kit", "barrel") });
  catalog.register("prop/campfire", { url: path(base, "kenney-nature", "campfire_logs") });
  catalog.register("prop/campfire_stones", { url: path(base, "kenney-nature", "campfire_stones") });
  catalog.register("prop/tent", { url: path(base, "kenney-survival-kit", "tent") });
  catalog.register("prop/fence", { url: path(base, "kenney-nature", "fence") });
  catalog.register("prop/fence_broken", { url: path(base, "kenney-nature", "fence_broken") });
  catalog.register("prop/sign", { url: path(base, "kenney-nature", "sign") });
  catalog.register("prop/lantern", { url: path(base, "kenney-survival-kit", "lantern") });
  catalog.register("prop/torch", { url: path(base, "kenney-survival-kit", "torch") });
  catalog.register("prop/bed", { url: path(base, "kenney-furniture-kit", "bed") });
  catalog.register("prop/chair", { url: path(base, "kenney-furniture-kit", "chair") });
  catalog.register("prop/table", { url: path(base, "kenney-furniture-kit", "table") });
  catalog.register("prop/shelf", { url: path(base, "kenney-furniture-kit", "shelf") });

  // ── Buildings ──
  catalog.register("building/house_small", { url: path(base, "kenney-fantasy-town-kit", "house_small") });
  catalog.register("building/house_large", { url: path(base, "kenney-fantasy-town-kit", "house_large") });
  catalog.register("building/house_tower", { url: path(base, "kenney-fantasy-town-kit", "house_tower") });
  catalog.register("building/tower", { url: path(base, "kenney-fantasy-town-kit", "tower") });
  catalog.register("building/wall", { url: path(base, "kenney-fantasy-town-kit", "wall") });
  catalog.register("building/door", { url: path(base, "kenney-fantasy-town-kit", "door") });
  catalog.register("building/well", { url: path(base, "kenney-fantasy-town-kit", "well") });

  // ── Vehicles ──
  catalog.register("vehicle/car_sedan", { url: path(base, "kenney-car-kit", "sedan") });
  catalog.register("vehicle/car_police", { url: path(base, "kenney-car-kit", "police") });
  catalog.register("vehicle/car_taxi", { url: path(base, "kenney-car-kit", "taxi") });
  catalog.register("vehicle/truck", { url: path(base, "kenney-car-kit", "truck") });
  catalog.register("vehicle/van", { url: path(base, "kenney-car-kit", "van") });
  catalog.register("vehicle/ambulance", { url: path(base, "kenney-car-kit", "ambulance") });
  catalog.register("vehicle/boat_small", { url: path(base, "kenney-pirate-kit", "boat_small") });
  catalog.register("vehicle/boat_large", { url: path(base, "kenney-pirate-kit", "boat_large") });
  catalog.register("vehicle/plane", { url: path(base, "kenney-space-kit", "spacecraft") });

  return catalog;
}
