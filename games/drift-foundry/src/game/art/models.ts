import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { POWER_UPS, GOODS } from "../cart/goods";
import { CHASSIS } from "../cart/chassis";
import { shelfItemObject } from "../objects/catalog";
import { UPGRADE_KINDS } from "./upgrades";

/**
 * Every original model the game ships, authored by `scripts/author-models.mjs`. Module URLs survive
 * both the standalone build and the engine's configured /play host, so each glb is named here once.
 */
const GLB: Record<string, string> = {
  "cart-standard": new URL("./cart-standard.glb", import.meta.url).href,
  "cart-kiddie": new URL("./cart-kiddie.glb", import.meta.url).href,
  "cart-flatbed": new URL("./cart-flatbed.glb", import.meta.url).href,
  "cart-scooter": new URL("./cart-scooter.glb", import.meta.url).href,
  "shopper-player": new URL("./shopper-player.glb", import.meta.url).href,
  "cart-rival-grandma": new URL("./cart-rival-grandma.glb", import.meta.url).href,
  "cart-rival-twins": new URL("./cart-rival-twins.glb", import.meta.url).href,
  "cart-rival-brick": new URL("./cart-rival-brick.glb", import.meta.url).href,
  "cart-rival-guard": new URL("./cart-rival-guard.glb", import.meta.url).href,
  "upgrade-power_walker": new URL("./upgrade-power_walker.glb", import.meta.url).href,
  "upgrade-leaf_blower": new URL("./upgrade-leaf_blower.glb", import.meta.url).href,
  "upgrade-e_assist": new URL("./upgrade-e_assist.glb", import.meta.url).href,
  "upgrade-pallet_plow": new URL("./upgrade-pallet_plow.glb", import.meta.url).href,
  "upgrade-noodle_bumper": new URL("./upgrade-noodle_bumper.glb", import.meta.url).href,
  "upgrade-sign_spoiler": new URL("./upgrade-sign_spoiler.glb", import.meta.url).href,
  "upgrade-spring_casters": new URL("./upgrade-spring_casters.glb", import.meta.url).href,
  "upgrade-fixed_squeak": new URL("./upgrade-fixed_squeak.glb", import.meta.url).href,
  "upgrade-knobby_casters": new URL("./upgrade-knobby_casters.glb", import.meta.url).href,
  "upgrade-wire_basket": new URL("./upgrade-wire_basket.glb", import.meta.url).href,
  "upgrade-cage_basket": new URL("./upgrade-cage_basket.glb", import.meta.url).href,
  "upgrade-bin_lid_armor": new URL("./upgrade-bin_lid_armor.glb", import.meta.url).href,
  "pickup-push": new URL("./pickup-push.glb", import.meta.url).href,
  "pickup-bumper": new URL("./pickup-bumper.glb", import.meta.url).href,
  "pickup-casters": new URL("./pickup-casters.glb", import.meta.url).href,
  "pickup-basket": new URL("./pickup-basket.glb", import.meta.url).href,
  "gate-box-wall": new URL("./gate-box-wall.glb", import.meta.url).href,
  "gate-pallet-ramp": new URL("./gate-pallet-ramp.glb", import.meta.url).href,
  "jump-cue": new URL("./jump-cue.glb", import.meta.url).href,
  "marble-spill": new URL("./marble-spill.glb", import.meta.url).href,
  "item-watermelon": new URL("./item-watermelon.glb", import.meta.url).href,
  "item-kettlebell": new URL("./item-kettlebell.glb", import.meta.url).href,
  "item-paint_can": new URL("./item-paint_can.glb", import.meta.url).href,
  "item-dog_food": new URL("./item-dog_food.glb", import.meta.url).href,
  "item-skillet": new URL("./item-skillet.glb", import.meta.url).href,
  "item-big_tv": new URL("./item-big_tv.glb", import.meta.url).href,
  "item-pumpkin": new URL("./item-pumpkin.glb", import.meta.url).href,
  "item-garden_gnome": new URL("./item-garden_gnome.glb", import.meta.url).href,
  "item-potted_fern": new URL("./item-potted_fern.glb", import.meta.url).href,
  "item-soda_case": new URL("./item-soda_case.glb", import.meta.url).href,
  "item-frozen_pizza": new URL("./item-frozen_pizza.glb", import.meta.url).href,
  "item-ice_cream": new URL("./item-ice_cream.glb", import.meta.url).href,
  "item-game_console": new URL("./item-game_console.glb", import.meta.url).href,
  "item-headphones": new URL("./item-headphones.glb", import.meta.url).href,
  "item-teddy_bear": new URL("./item-teddy_bear.glb", import.meta.url).href,
  "item-chips": new URL("./item-chips.glb", import.meta.url).href,
  "item-paper_towels": new URL("./item-paper_towels.glb", import.meta.url).href,
  "item-cereal": new URL("./item-cereal.glb", import.meta.url).href,
  "item-marshmallows": new URL("./item-marshmallows.glb", import.meta.url).href,
  "item-rubber_duck": new URL("./item-rubber_duck.glb", import.meta.url).href,
  "item-extinguisher": new URL("./item-extinguisher.glb", import.meta.url).href,
  "item-marbles": new URL("./item-marbles.glb", import.meta.url).href,
  "item-mop": new URL("./item-mop.glb", import.meta.url).href,
  "item-bouncy_balls": new URL("./item-bouncy_balls.glb", import.meta.url).href,
  "item-rotisserie_chicken": new URL("./item-rotisserie_chicken.glb", import.meta.url).href,
  gondola: new URL("./gondola.glb", import.meta.url).href,
  "gondola-tall": new URL("./gondola-tall.glb", import.meta.url).href,
  "toy-shelf": new URL("./toy-shelf.glb", import.meta.url).href,
  "tv-wall": new URL("./tv-wall.glb", import.meta.url).href,
  freezer: new URL("./freezer.glb", import.meta.url).href,
  "produce-bin": new URL("./produce-bin.glb", import.meta.url).href,
  racking: new URL("./racking.glb", import.meta.url).href,
  hedge: new URL("./hedge.glb", import.meta.url).href,
  "ceiling-light": new URL("./ceiling-light.glb", import.meta.url).href,
  "ceiling-light-wide": new URL("./ceiling-light-wide.glb", import.meta.url).href,
  "aisle-sign": new URL("./aisle-sign.glb", import.meta.url).href,
  "dept-sign": new URL("./dept-sign.glb", import.meta.url).href,
  "checkout-arch": new URL("./checkout-arch.glb", import.meta.url).href,
  endcap: new URL("./endcap.glb", import.meta.url).href,
  "box-pile": new URL("./box-pile.glb", import.meta.url).href,
  "pallet-stack": new URL("./pallet-stack.glb", import.meta.url).href,
  "wet-floor": new URL("./wet-floor.glb", import.meta.url).href,
  "cart-corral": new URL("./cart-corral.glb", import.meta.url).href,
  "flower-cart": new URL("./flower-cart.glb", import.meta.url).href,
  "gnome-pile": new URL("./gnome-pile.glb", import.meta.url).href,
  "tv-boxes": new URL("./tv-boxes.glb", import.meta.url).href,
  "plush-pile": new URL("./plush-pile.glb", import.meta.url).href,
  forklift: new URL("./forklift.glb", import.meta.url).href,
  "tumble-bin": new URL("./tumble-bin.glb", import.meta.url).href,
  "ball-blaster": new URL("./ball-blaster.glb", import.meta.url).href,
  "tug-crossing": new URL("./tug-crossing.glb", import.meta.url).href,
  sprinkler: new URL("./sprinkler.glb", import.meta.url).href,
  "big-screen": new URL("./big-screen.glb", import.meta.url).href,
  "shutter-scrubber": new URL("./shutter-scrubber.glb", import.meta.url).href,
  "tugger-cart": new URL("./tugger-cart.glb", import.meta.url).href,
};

/** An authored model by its glb name, origin-anchored like every piece the author script writes. */
export function authored(name: string, overrides: Partial<ModelConfig> = {}): ModelConfig {
  const url = GLB[name];
  if (url === undefined) throw new Error(`art: no authored model "${name}"`);
  return { url, anchor: "origin", ...overrides };
}

/** The player's shopper: the chassis under them is its own body, so a cart swap never respawns the camera target. */
export const shopperModel: ModelConfig = authored("shopper-player");

/** The four chassis bodies, keyed by the entity kind the loop draws under the shopper. */
export const chassisModels: Record<string, ModelConfig> = Object.fromEntries(CHASSIS.map((entry) => [entry.entityKind, authored(`cart-${entry.id}`)]));

/** Rivals bring their own cart and shopper, so the field reads apart at speed. */
export const rivalKartModels: Record<string, ModelConfig> = {
  kart_rival_grandma: authored("cart-rival-grandma"),
  kart_rival_twins: authored("cart-rival-twins"),
  kart_rival_brick: authored("cart-rival-brick"),
  kart_rival_guard: authored("cart-rival-guard"),
};

/** The best-run ghost: the standard cart as see-through teal glass, so it never reads as a rival. */
export const ghostKartModel: ModelConfig = authored("cart-standard", {
  material: { color: "#5de0ce", emissive: "#5de0ce", emissiveIntensity: 0.55, roughness: 0.4, alphaMode: "blend", opacity: 0.32 },
});

export const upgradeModels: Record<string, ModelConfig> = Object.fromEntries(
  Object.entries(UPGRADE_KINDS).map(([partId, kind]) => [kind, authored(`upgrade-${partId}`)]),
);

export const stationModels: Record<string, ModelConfig> = {
  pickup_push: authored("pickup-push"),
  pickup_bumper: authored("pickup-bumper"),
  pickup_casters: authored("pickup-casters"),
  pickup_basket: authored("pickup-basket"),
};

/** Each shelf product on its grab stand, keyed by its object id. */
export const shelfItemModels: Record<string, ModelConfig> = Object.fromEntries(
  [...GOODS, ...POWER_UPS].map((item) => [shelfItemObject(item.id), authored(`item-${item.id}`)]),
);
