import type { GameContextObjectEntry } from "@jgengine/core/runtime/gameContext";

import { GOODS, POWER_UPS } from "../cart/goods";

/** Aisle 9's corridor clutter: what stands either side of the main aisle between the shelving. */
export const PROP_PALLET_STACK = "prop_pallet_stack";
export const PROP_ENDCAP = "prop_endcap";
export const PROP_FREEZER = "prop_freezer";
export const PROP_BOX_PILE = "prop_box_pile";
export const PROP_GONDOLA = "prop_gondola";
export const PROP_GONDOLA_TALL = "prop_gondola_tall";
export const PROP_CART_CORRAL = "prop_cart_corral";
export const PROP_WET_FLOOR = "prop_wet_floor";
/** The fluorescent fixtures hung over the aisle and the giant hanging department signs. */
export const PROP_CEILING_LIGHT = "prop_ceiling_light";
export const PROP_AISLE_SIGN = "prop_aisle_sign";
/** One 96 m x 24 m bay of the warehouse roof: deck, trusses, ducts and strip lights. */
export const PROP_CEILING_BAY = "prop_ceiling_bay";

export const GATE_BARRICADE_PLOW = "gate_box_wall";
export const GATE_BARRICADE_JUMP = "gate_pallet_ramp";

export const PICKUP_MARKER = "pickup_marker";
export const PICKUP_STATIONS = { engine: "pickup_push", front: "pickup_bumper", wheels: "pickup_casters", frame: "pickup_basket" } as const;
export const JUMP_CUE = "jump_cue";
export const EXIT_GATE_ARCH = "checkout_arch";
/** A shelf grab spot's display stand; the item on it is its own object. */
export const SHELF_STAND = "shelf_stand";
/** One object per shelf item, keyed by the item id: the product sitting on its stand. */
export function shelfItemObject(itemId: string): string {
  return `item_${itemId}`;
}

/** A spilled bag of marbles, dropped behind a cart. */
export const MARBLE_SPILL = "marble_spill";

/**
 * Props the department tracks are dressed with: shelving along the route edges, fluorescent
 * fixtures overhead, clutter off the course, and the set-pieces that mark each hazard - the orange
 * piles and ball blasters, the tugger crossings, the conveyors and the garden sprinklers.
 */
export const TRACK_OBJECT = {
  edgeGondola: "edge_gondola",
  edgeFreezer: "edge_freezer",
  edgeProduce: "edge_produce",
  edgeHedge: "edge_hedge",
  edgeTvWall: "edge_tv_wall",
  edgeToyShelf: "edge_toy_shelf",
  edgeRacking: "edge_racking",
  lampCeiling: "lamp_ceiling",
  lampGarden: "lamp_garden",
  palletStack: "prop_pallets",
  boxPile: "prop_boxes",
  cone: "prop_cone",
  wetFloor: "prop_wet_floor_sign",
  endcap: "prop_endcap_display",
  cartCorral: "prop_corral",
  tree: "prop_tree",
  bush: "prop_bush",
  flowers: "prop_flowers",
  gnome: "prop_gnome_pile",
  tvBox: "prop_tv_boxes",
  plush: "prop_plush_pile",
  forklift: "prop_forklift",
  tumbleBin: "set_tumble_bin",
  ballBlaster: "set_ball_blaster",
  tugCrossing: "set_tug_crossing",
  conveyor: "set_conveyor",
  sprinkler: "set_sprinkler",
  deptSign: "set_dept_sign",
  bigScreen: "set_big_screen",
} as const;

export const ZONE_PROP_IDS = [
  PROP_PALLET_STACK,
  PROP_ENDCAP,
  PROP_FREEZER,
  PROP_BOX_PILE,
  PROP_GONDOLA,
  PROP_GONDOLA_TALL,
  PROP_CART_CORRAL,
  PROP_WET_FLOOR,
] as const;

export const OBJECT_CATALOG: Record<string, GameContextObjectEntry> = {
  ...Object.fromEntries(ZONE_PROP_IDS.map((id) => [id, {}])),
  [PROP_CEILING_LIGHT]: {},
  [PROP_AISLE_SIGN]: {},
  [PROP_CEILING_BAY]: {},
  [GATE_BARRICADE_PLOW]: {},
  [GATE_BARRICADE_JUMP]: {},
  [PICKUP_MARKER]: {},
  [JUMP_CUE]: {},
  [SHELF_STAND]: {},
  [MARBLE_SPILL]: {},
  ...Object.fromEntries(Object.values(PICKUP_STATIONS).map((id) => [id, {}])),
  [EXIT_GATE_ARCH]: {},
  ...Object.fromEntries(Object.values(TRACK_OBJECT).map((id) => [id, {}])),
  ...Object.fromEntries([...GOODS, ...POWER_UPS].map((item) => [shelfItemObject(item.id), {}])),
};
