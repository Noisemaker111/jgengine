import { TRACK_OBJECT as O } from "../objects/catalog";
import { STANDARD_OPENING, trackDrops } from "./drops";
import { detour, straight, turn, type TrackDef } from "./types";

/**
 * The Warehouse Loading Bay: a wide, fast run of right angles through receiving, crossed twice by
 * tugger trains hauling pallet carts that do not stop for shoppers. The long way swings round the
 * dispatch office; the trailer cut drives straight through a parked semi-trailer, doors, spilled
 * hydraulic oil and all. On the back straight a forklift drops a pallet into the lane a little over
 * twenty seconds in - be past it or plow it.
 */
export const LOADING_BAY: TrackDef = {
  id: "loading-bay",
  label: "Loading Bay",
  blurb: "Right angles through the warehouse, two live tugger-train crossings and a forklift that drops a pallet in the lane if you are late.",
  origin: 60,
  start: { x: -120, z: -1150, heading: 0 },
  halfWidth: 11,
  pavedHalfWidth: 8.5,
  pieces: [
    straight(60),
    straight(120),
    turn(90, 50),
    straight(70),
    turn(-90, 40),
    ...detour(-1, 60, 24, 30),
    straight(20),
    turn(-90, 40),
    straight(80),
    turn(90, 40),
    straight(60),
  ],
  branches: [{ id: "trailer-cut", from: 334, to: 489, halfWidth: 6, label: "TRAILER CUT" }],
  hazards: [
    { id: "crossing-a", kind: "tugger", from: 210, to: 218, cycle: { period: 12, active: 4, phase: 5 }, label: "TUGGER TRAIN ON THE RECEIVING LANE" },
    { id: "crossing-b", kind: "tugger", from: 612, to: 620, cycle: { period: 10, active: 3.5, phase: 1 }, label: "TUGGER TRAIN ON THE OUTBOUND LANE" },
    { id: "trailer-oil", kind: "spill", route: "trailer-cut", from: 18, to: 100, label: "HYDRAULIC OIL IN THE TRAILER" },
  ],
  gates: [
    { id: "bay_plow_crates", requirement: "plow", at: 108, label: "CRATE STACK", radioLine: "CRATES SPLIT — WATCH THE CROSSING" },
    { id: "bay_jump_dockplate", requirement: "jump", at: 252, label: "DOCK-PLATE RAMP", radioLine: "OFF THE DOCK PLATE — NICE AIR" },
    { id: "bay_plow_trailer", requirement: "plow", route: "trailer-cut", at: 405, label: "TRAILER DOORS", radioLine: "THROUGH THE TRAILER — SHORT WAY HOME" },
    { id: "bay_plow_dropped", requirement: "plow", at: 598, dropsAt: 24, label: "DROPPED PALLET", radioLine: "PALLET SMASHED — THE FORKLIFT MISSED YOU" },
    { id: "bay_jump_last", requirement: "jump", at: 735, label: "LAST DOCK RAMP", radioLine: "LAST RAMP CLEARED — TILLS ARE RIGHT THERE" },
  ],
  pickups: trackDrops(STANDARD_OPENING, [{ at: 282 }, { at: 400, lane: 1 }, { at: 560 }, { at: 700, lane: -1 }]),
  exitAt: 748,
  zones: [
    { id: "bay-receiving", label: "RECEIVING DOCK", radioName: "RECEIVING", start: 0, end: 269, wallColor: "#8fa3b8", surface: { id: "sealed", label: "SEALED CONCRETE", grip: 0.97 } },
    { id: "bay-trailers", label: "TRAILER BAY", radioName: "THE TRAILERS", start: 269, end: 575, wallColor: "#f0c419", surface: { id: "concrete", label: "DOCK APRON", grip: 1 } },
    { id: "bay-outbound", label: "OUTBOUND LANES", radioName: "OUTBOUND", start: 575, end: 748, wallColor: "#d9d2c3", surface: { id: "epoxy", label: "EPOXY LANES", grip: 1.02 } },
  ],
  bandZ: -870,
  ground: { low: "#8a8f94", high: "#b8bcbf", waterline: "#8a8f94" },
  fog: { color: "#b9c2ca", near: 60, far: 320 },
  sky: { horizonColor: "#d2dae0", zenithColor: "#7d8b98", sunIntensity: 1.9, ambientIntensity: 1.15 },
  baseLevel: 0,
  floor: "#8f8f8a",
  rivalTake: { rival_brick: ["trailer-cut"], rival_twins: ["trailer-cut"] },
  par: 64,
  stock: {
    goods: ["kettlebell", "dog_food", "paint_can", "soda_case", "big_tv", "paper_towels", "skillet"],
    powerUps: ["extinguisher", "marbles", "mop", "bouncy_balls", "rotisserie_chicken"],
  },
  dressing: {
    edge: O.edgeRacking,
    edgeSpacing: 5,
    lamp: O.lampCeiling,
    lampAt: "centre",
    lampSpacing: 24,
    scatter: [O.palletStack, O.boxPile, O.forklift, O.cone, O.cartCorral],
    scatterCount: 32,
    landmarks: [
      { object: O.forklift, at: 412, side: 40 },
      { object: O.forklift, at: 598, side: 14 },
      { object: O.deptSign, at: 30, side: 0 },
      { object: O.palletStack, at: 140, side: 16 },
      { object: O.boxPile, at: 330, side: -16 },
    ],
  },
};
