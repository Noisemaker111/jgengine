import { TRACK_OBJECT as O } from "../objects/catalog";
import { STANDARD_OPENING, trackDrops } from "./drops";
import { detour, straight, turn, type TrackDef } from "./types";

/**
 * The Conveyor Maze, on the night shift: a narrow serpentine of right angles through the sorting
 * sheds, under searchlights. Belts run under the road - some carry you, some fight you, some only
 * cover half a lane. The belt hall runs straight through the first shed on a fast belt, past a ramp.
 */
export const CONVEYOR_MAZE: TrackDef = {
  id: "conveyor-maze",
  label: "Conveyor Maze",
  blurb: "Night in the sorting sheds: narrow right angles, belts that carry or fight you, and a fast belt hall over a ramp.",
  origin: 60,
  start: { x: -60, z: 1500, heading: 0 },
  halfWidth: 8,
  pavedHalfWidth: 8,
  pieces: [
    straight(60),
    straight(100),
    ...detour(-1, 60, 16, 20),
    straight(20),
    turn(90, 14),
    straight(50),
    turn(-90, 14),
    straight(60),
    turn(-90, 14),
    straight(60),
    turn(90, 14),
    straight(60),
    turn(90, 14),
    straight(70),
    turn(-90, 14),
    straight(50),
    turn(-90, 14),
    straight(60),
  ],
  branches: [{ id: "belt-hall", from: 103, to: 224, halfWidth: 5.5, label: "BELT HALL" }],
  hazards: [
    { id: "hall-belt", kind: "belt", route: "belt-hall", from: 6, to: 70, push: 4.5, label: "FAST BELT IN THE HALL" },
    { id: "long-way-belt", kind: "belt", from: 140, to: 186, offset: [-8, 0], push: -2.5, label: "RETURN BELT ON THE LONG WAY" },
    { id: "feed-belt", kind: "belt", from: 252, to: 298, push: 3, label: "FEED BELT" },
    { id: "return-belt", kind: "belt", from: 406, to: 462, offset: [0, 8], push: -3, label: "RETURN BELT - TAKE THE OTHER LANE" },
    { id: "sorter-belt", kind: "belt", from: 570, to: 636, offset: [-8, 0], push: 3.5, label: "SORTER BELT" },
    { id: "out-belt", kind: "belt", from: 712, to: 760, push: 3, label: "OUTFEED BELT" },
  ],
  gates: [
    { id: "belt_plow_pallets", requirement: "plow", at: 92, label: "PALLET WALL", radioLine: "PALLETS EVERYWHERE — INTO THE MAZE" },
    { id: "belt_jump_hall", requirement: "jump", route: "belt-hall", at: 160, label: "HALL RAMP", radioLine: "OFF THE HALL RAMP — BELT'S DOING THE WORK" },
    { id: "belt_jump_feed", requirement: "jump", at: 275, label: "FEED-BELT HUMP", radioLine: "OVER THE HUMP — LEFT, RIGHT, LEFT" },
    { id: "belt_plow_bales", requirement: "plow", at: 430, label: "BALE STACK", radioLine: "BALES BURST — MIND THE RETURN BELT" },
    { id: "belt_jump_sorter", requirement: "jump", at: 600, label: "SORTER GAP", radioLine: "CLEARED THE SORTER — TWO MORE CORNERS" },
    { id: "belt_plow_shutter", requirement: "plow", at: 690, label: "SHUTTER DOOR", radioLine: "THROUGH THE SHUTTER — OUTFEED TO THE GATE" },
  ],
  pickups: trackDrops(STANDARD_OPENING, [{ at: 150, lane: 2 }, { at: 330 }, { at: 520 }, { at: 675 }]),
  exitAt: 760,
  zones: [
    { id: "belt-dock", label: "LOADING DOCK", radioName: "THE DOCK", start: 0, end: 227, wallColor: "#3fe0d4", surface: { id: "rubber", label: "BELT RUBBER", grip: 1 } },
    { id: "belt-maze", label: "SORTING MAZE", radioName: "THE MAZE", start: 227, end: 545, wallColor: "#f0c419", surface: { id: "epoxy", label: "WET EPOXY", grip: 0.94 } },
    { id: "belt-outfeed", label: "OUTFEED SHEDS", radioName: "THE OUTFEED", start: 545, end: 760, wallColor: "#ff4f9a", surface: { id: "plate", label: "TREAD PLATE", grip: 0.98 } },
  ],
  bandZ: 1760,
  ground: { low: "#0d0f16", high: "#262a36", waterline: "#0d0f16" },
  fog: { color: "#0e1224", near: 30, far: 170 },
  sky: { horizonColor: "#1d2340", zenithColor: "#070910", sunIntensity: 0.35, ambientIntensity: 0.4 },
  baseLevel: 0,
  rivalTake: { rival_hobbs: ["belt-hall"] },
  par: 63,
  dressing: {
    edge: O.edgeTyre,
    edgeSpacing: 5,
    lamp: O.lampSearch,
    lampSpacing: 26,
    scatter: [O.crate, O.militaryCrate, O.rack, O.cabinet, O.powerBox],
    scatterCount: 34,
    landmarks: [
      { object: O.signalBox, at: 330, side: -13 },
      { object: O.pumpRig, at: 520, side: 13 },
      { object: O.rack, at: 430, side: 12 },
      { object: O.generator, at: 700, side: -12 },
    ],
  },
};
