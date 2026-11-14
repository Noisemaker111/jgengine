import { CORRIDOR_DRIVE_HALF_WIDTH, EXIT_Z, HAUL_ROAD_HALF_WIDTH } from "../run/constants";
import { ZONES } from "../zones/catalog";
import { trackDrops } from "./drops";
import { straight, type TrackDef } from "./types";

/**
 * Aisle 9: the store's main aisle, due north from the customer-service desk to the self-checkouts,
 * 37 m between the shelving and eight full-width barricades the night stockers left in the way.
 * Snacks, then the frozen foods (the floor is iced over), then bulk and paint. Because it runs
 * straight up +z from z = 0, its run metres are world z and its lateral offset is world x.
 */
export const AISLE_NINE: TrackDef = {
  id: "aisle-nine",
  label: "Aisle 9",
  blurb: "The main aisle to the checkouts: snacks, an iced-over frozen section, bulk and paint, and eight walls in the way.",
  origin: 60,
  start: { x: 0, z: -60, heading: 0 },
  halfWidth: CORRIDOR_DRIVE_HALF_WIDTH,
  pavedHalfWidth: HAUL_ROAD_HALF_WIDTH,
  pieces: [straight(60 + EXIT_Z + 60)],
  branches: [],
  hazards: [],
  gates: [
    { id: "nine_plow_cereal", requirement: "plow", at: 110, label: "CEREAL-BOX WALL", radioLine: "CEREAL EVERYWHERE — SOMEBODY GET A BROOM" },
    { id: "nine_jump_pallet", requirement: "jump", at: 150, label: "SODA-PALLET RAMP", radioLine: "OFF THE SODA PALLET — NICE AIR" },
    { id: "nine_plow_icecream", requirement: "plow", at: 210, label: "ICE-CREAM TUB BLOCKADE", radioLine: "TUBS SCATTERED — BRAIN FREEZE" },
    { id: "nine_jump_ice", requirement: "jump", at: 250, label: "BAGGED-ICE RAMP", radioLine: "OVER THE ICE BAGS — LOOKED GOOD FROM HERE" },
    { id: "nine_plow_peas", requirement: "plow", at: 300, label: "FROZEN-PEA PYRAMID", radioLine: "PEA PYRAMID DOWN — DON'T LOOK BACK" },
    { id: "nine_jump_gondola", requirement: "jump", at: 350, label: "FALLEN GONDOLA", radioLine: "OVER THE FALLEN SHELF — BIG AIR" },
    { id: "nine_plow_paint", requirement: "plow", at: 400, label: "PAINT-CAN PYRAMID", radioLine: "PAINT CANS EVERYWHERE — ALMOST AT THE TILLS" },
    { id: "nine_jump_last", requirement: "jump", at: 440, label: "LAST PALLET RAMP", radioLine: "LAST RAMP — SEE YOU AT SELF-CHECKOUT" },
  ],
  // The aisle's own mod displays: the leaf blower holds through the opening sprint and the e-assist
  // only comes after the shutters' first surge.
  pickups: trackDrops([18, 30, 44, 58, 72, 88, 104, 126], [{ at: 175, lane: 1 }, { at: 245, lane: -1 }, { at: 320, lane: 1 }, { at: 410 }]),
  exitAt: EXIT_Z,
  zones: ZONES,
  bandZ: 225,
  ground: ZONES[1]!.ground,
  fog: ZONES[1]!.fog,
  sky: ZONES[1]!.sky,
  baseLevel: 0,
  rivalTake: {},
  par: 36,
  stock: {
    goods: ["chips", "cereal", "marshmallows", "paper_towels", "frozen_pizza", "ice_cream", "soda_case", "paint_can", "dog_food", "kettlebell", "skillet"],
    powerUps: ["extinguisher", "marbles", "mop", "bouncy_balls", "rotisserie_chicken"],
    spacing: 22,
  },
};
