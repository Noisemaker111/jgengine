import { CORRIDOR_DRIVE_HALF_WIDTH, EXIT_Z, HAUL_ROAD_HALF_WIDTH } from "../run/constants";
import { ZONES } from "../zones/catalog";
import { trackDrops } from "./drops";
import { straight, type TrackDef } from "./types";

/**
 * Row Six: the original escape corridor, due north from the start line, 37 m between the fences and
 * eight full-width barricades. Because it runs straight up +z from z = 0, its run metres are world z
 * and its lateral offset is world x - every number the corridor was first authored in still holds.
 */
export const ROW_SIX: TrackDef = {
  id: "row-six",
  label: "Row Six",
  blurb: "The straight corridor out of the yard: three zones, eight barricades, nowhere to hide.",
  origin: 60,
  start: { x: 0, z: -60, heading: 0 },
  halfWidth: CORRIDOR_DRIVE_HALF_WIDTH,
  pavedHalfWidth: HAUL_ROAD_HALF_WIDTH,
  pieces: [straight(60 + EXIT_Z + 60)],
  branches: [],
  hazards: [],
  gates: [
    { id: "gate_canyon_plow", requirement: "plow", at: 110, label: "CRUSHED-CAR WALL", radioLine: "PLOWED THE CAR WALL — SHE'S UGLY BUT SHE'S FAST" },
    { id: "gate_canyon_jump", requirement: "jump", at: 150, label: "TIRE-STACK RAMP", radioLine: "CLEARED THE TIRE STACK — NICE AIR" },
    { id: "gate_flats_plow_1", requirement: "plow", at: 210, label: "FRIDGE BLOCKADE", radioLine: "FRIDGE BLOCKADE DOWN — KEEP ROLLING" },
    { id: "gate_flats_jump", requirement: "jump", at: 250, label: "WASHER-PILE RAMP", radioLine: "OVER THE WASHER PILE — LOOKED GOOD FROM HERE" },
    { id: "gate_flats_plow_2", requirement: "plow", at: 300, label: "STOVE-STACK LINE", radioLine: "STOVE STACK SCATTERED — DON'T LOOK BACK" },
    { id: "gate_gantry_jump_1", requirement: "jump", at: 350, label: "CONTAINER GAP", radioLine: "CONTAINER GAP CLEARED — BIG AIR" },
    { id: "gate_gantry_plow", requirement: "plow", at: 400, label: "CRANE DEBRIS FIELD", radioLine: "PLOWED THE CRANE DEBRIS — ALMOST HOME" },
    { id: "gate_gantry_jump_2", requirement: "jump", at: 440, label: "FINAL GANTRY LEAP", radioLine: "FINAL GANTRY LEAP — SEE YOU AT THE GATE" },
  ],
  // The corridor's own drop marks: the truck engine holds through the opening sprint and the EV only
  // comes after the crusher's first surge.
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
};
