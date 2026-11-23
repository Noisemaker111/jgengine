import type { GameContext } from "@jgengine/core/runtime/gameContext";
import {
  BAG,
  HOTBAR,
} from "../bags";
import {
  cavesOf,
} from "../caves";
import {
  creaturesView,
} from "../creatures";
import {
  BROOD_TIERS,
} from "../data/bosses";
import {
  EGG_SIZES,
  KIBBLE_TIERS,
  eggItem,
  kibbleItem,
} from "../data/kibble";
import {
  STRUCTURES,
} from "../data/structures";

const PIECES: ReadonlySet<string> = new Set(STRUCTURES.map((entry) => entry.id));

/** What proofs and flows read about bags: its part of the capture probe. */
export function bagsProbe(ctx: GameContext) {
  const creatures = creaturesView(ctx);
  const tamesOn = creatures.viewing?.taming?.foods ?? null;
  const keyOf = (item: string): number => ctx.player.inventory.state(HOTBAR).slots.findIndex((slot) => slot?.itemId === item) + 1;
  return {
    thatch: ctx.player.inventory.count(BAG, "thatch"),
    wood: ctx.player.inventory.count(BAG, "wood"),
    stone: ctx.player.inventory.count(BAG, "stone"),
    fiber: ctx.player.inventory.count(BAG, "fiber"),
    flint: ctx.player.inventory.count(BAG, "flint"),
    berries: ["mejoberry", "amarberry", "azulberry", "tintoberry"].reduce((sum, item) => sum + ctx.player.inventory.count(BAG, item), 0),
    rawMeat: ctx.player.inventory.count(BAG, "raw_meat"),
    hide: ctx.player.inventory.count(BAG, "hide"),
    narcoberries: ctx.player.inventory.count(BAG, "narcoberry"),
    spoiledMeat: ctx.player.inventory.count(BAG, "spoiled_meat"),
    narcotics: ctx.player.inventory.count(BAG, "narcotic"),
    clubs: ctx.player.inventory.count(BAG, "wooden_club") + ctx.player.inventory.count(HOTBAR, "wooden_club"),
    // The bag slot holding a saddle, to double-click into a tame's inventory; -1 with none.
    saddleSlot: ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot !== null && slot.itemId.endsWith("_saddle")),
    cookedMeat: ctx.player.inventory.count(BAG, "cooked_meat"),
    hatchets: ctx.player.inventory.count(HOTBAR, "stone_hatchet") + ctx.player.inventory.count(BAG, "stone_hatchet"),
    // The bag slot of the first building piece, to double-click onto the hotbar (-1 with none), and the
    // hotbar key (1-based) holding one (0 with none). Campfires standing.
    pieceSlot: ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot !== null && PIECES.has(slot.itemId)),
    pieceKey: ctx.player.inventory.state(HOTBAR).slots.findIndex((slot) => slot !== null && PIECES.has(slot.itemId)) + 1,
    mejoberries: ctx.player.inventory.count(BAG, "mejoberry") + ctx.player.inventory.count(HOTBAR, "mejoberry"),
    // The hotbar key (1-based) holding each tool; 0 when it is not on the hotbar.
    pickKey: keyOf("stone_pick"),
    hatchetKey: keyOf("stone_hatchet"),
    spearKey: keyOf("spear"),
    // The bag's raw meat slot, and the raw meat in the open container (-1 with none open).
    meatSlot: ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot?.itemId === "raw_meat"),
    picks: ctx.player.inventory.count(HOTBAR, "stone_pick") + ctx.player.inventory.count(BAG, "stone_pick"),
    // The bag slot of the first stack the creature whose inventory is open tames on (what you double-click to feed it); -1 with none.
    foodSlot: tamesOn === null ? -1 : ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot !== null && tamesOn.includes(slot.itemId)),
    // Wild eggs and kibble carried, any size or tier.
    eggsCarried: EGG_SIZES.reduce((sum, size) => sum + ctx.player.inventory.count(BAG, eggItem(size)), 0),
    kibble: KIBBLE_TIERS.reduce((sum, tier) => sum + ctx.player.inventory.count(BAG, kibbleItem(tier)), 0),
    // Metal ingots carried, and the hotbar key (1-based) a metal pick sits on, 0 with none there.
    ingots: ctx.player.inventory.count(BAG, "metal_ingot"),
    metalPickKey: keyOf("metal_pick"),
    // The bag slot holding kibble (any tier), raw prime meat and raw meat, to double-click into a downed creature; -1 with none.
    kibbleSlot: ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot !== null && slot.itemId.startsWith("kibble_")),
    primeSlot: ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot?.itemId === "raw_prime_meat"),
    rawMeatSlot: ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot?.itemId === "raw_meat"),
    stoneSlot: ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot?.itemId === "stone"),
    woodSlot: ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot?.itemId === "wood"),
    // Artifacts carried in the bag and on the hotbar, and pedestals still holding one.
    artifacts: cavesOf(ctx).reduce((sum, cave) => sum + ctx.player.inventory.count(BAG, cave.artifact) + ctx.player.inventory.count(HOTBAR, cave.artifact), 0),
    // Stacks the survivor carries in the bag and on the hotbar.
    carrying: [BAG, HOTBAR].reduce((sum, id) => sum + ctx.player.inventory.state(id).slots.filter((slot) => slot !== null).length, 0),
    element: ctx.player.inventory.count(BAG, "element"),
    // Broodmother trophies carried, and brood gear (made only around one) carried.
    broodTrophies: BROOD_TIERS.reduce((sum, tier) => sum + ctx.player.inventory.count(BAG, `broodmother_trophy_${tier.id}`), 0),
    broodGear: ["brood_greaves", "brood_gauntlets", "brood_treads"].reduce((sum, item) => sum + [BAG, HOTBAR].reduce((n, id) => n + ctx.player.inventory.count(id, item), 0), 0),
    tranqArrows: ctx.player.inventory.count(BAG, "tranq_arrow") + ctx.player.inventory.count(HOTBAR, "tranq_arrow"),
    stones: ctx.player.inventory.count(BAG, "stone") + ctx.player.inventory.count(HOTBAR, "stone"),
  };
}
