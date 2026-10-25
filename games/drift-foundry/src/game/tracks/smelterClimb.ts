import { TRACK_OBJECT as O } from "../objects/catalog";
import { STANDARD_OPENING, trackDrops } from "./drops";
import { detour, straight, turn, type TrackDef } from "./types";

/**
 * Smelter Climb: up through the smelter on two long ramps and two hairpins, 26 m from the casting
 * floor to the tapping gallery. Ladles pour across the ramps on a beat. At the top, the tapping
 * floor cuts the gallery's dog-leg - through a plow wall and under one more pour.
 */
export const SMELTER_CLIMB: TrackDef = {
  id: "smelter-climb",
  label: "Smelter Climb",
  blurb: "Two long ramps and two hairpins climb 26 m through the smelter while the ladles pour across the road.",
  origin: 60,
  start: { x: -140, z: -1700, heading: Math.PI / 2 },
  halfWidth: 9,
  pavedHalfWidth: 6.5,
  pieces: [
    straight(60),
    straight(120),
    straight(140, { rise: 10 }),
    turn(-180, 26, { rise: 1.5 }),
    straight(140, { rise: 10 }),
    turn(180, 26, { rise: 1.5 }),
    straight(30, { rise: 3 }),
    ...detour(-1, 45, 20, 25),
    straight(40, { rise: 3 }),
  ],
  branches: [{ id: "tapping-floor", from: 596, to: 703, halfWidth: 6, label: "TAPPING FLOOR" }],
  hazards: [
    { id: "pour-ramp-1", kind: "slag", from: 225, to: 236, cycle: { period: 8, active: 3 }, label: "LADLE POURING ON THE RAMP" },
    { id: "pour-pin-1", kind: "slag", from: 292, to: 308, cycle: { period: 7, active: 2.5, phase: 2.5 }, label: "SPILL ON THE HAIRPIN" },
    { id: "pour-ramp-2", kind: "slag", from: 425, to: 436, cycle: { period: 8, active: 3, phase: 4 }, label: "LADLE POURING ON THE RAMP" },
    { id: "pour-pin-2", kind: "slag", from: 512, to: 528, cycle: { period: 7, active: 2.5, phase: 5.5 }, label: "SPILL ON THE HAIRPIN" },
    { id: "pour-tap", kind: "slag", route: "tapping-floor", from: 34, to: 46, cycle: { period: 5, active: 2 }, label: "TAP HOLE OPEN" },
  ],
  gates: [
    { id: "smelt_plow_moulds", requirement: "plow", at: 108, label: "MOULD STACK", radioLine: "MOULDS DOWN — START CLIMBING" },
    { id: "smelt_jump_ramp", requirement: "jump", at: 190, label: "RAMP LIP", radioLine: "OFF THE LIP — KEEP HER CLIMBING" },
    { id: "smelt_plow_scrap", requirement: "plow", at: 400, label: "SCRAP CHARGE", radioLine: "THROUGH THE SCRAP CHARGE — ONE MORE RAMP" },
    { id: "smelt_jump_rail", requirement: "jump", at: 455, label: "CRANE RAIL", radioLine: "OVER THE CRANE RAIL — NEARLY AT THE TOP" },
    { id: "smelt_plow_tap", requirement: "plow", route: "tapping-floor", at: 640, label: "TAPPING WALL", radioLine: "THROUGH THE TAPPING WALL — STRAIGHT TO THE GATE" },
  ],
  pickups: trackDrops(STANDARD_OPENING, [{ at: 245 }, { at: 360, lane: 1 }, { at: 545 }, { at: 650, lane: -1 }]),
  exitAt: 716,
  zones: [
    { id: "smelt-floor", label: "CASTING FLOOR", radioName: "THE CASTING FLOOR", start: 0, end: 260, wallColor: "#b8481a", surface: { id: "plate", label: "CHECKER PLATE", grip: 0.99 } },
    { id: "smelt-ramps", label: "LADLE RAMPS", radioName: "THE RAMPS", start: 260, end: 563, wallColor: "#e07a2a", surface: { id: "grit", label: "GRITTED RAMP", grip: 1.02 } },
    { id: "smelt-gallery", label: "TAPPING GALLERY", radioName: "THE GALLERY", start: 563, end: 716, wallColor: "#ffb347", surface: { id: "dust", label: "OXIDE DUST", grip: 0.93 } },
  ],
  bandZ: -1640,
  ground: { low: "#1e140e", high: "#4c2e1b", waterline: "#1e140e" },
  fog: { color: "#3d1c10", near: 35, far: 210 },
  sky: { horizonColor: "#c2541a", zenithColor: "#1c0f0a", sunIntensity: 1.1, ambientIntensity: 0.6 },
  baseLevel: 0,
  rivalTake: { rival_hobbs: ["tapping-floor"] },
  par: 63,
  dressing: {
    edge: O.edgeBarrier,
    edgeSpacing: 6,
    lamp: O.lampSearch,
    lampSpacing: 34,
    scatter: [O.pipes, O.compressor, O.generator, O.propane, O.rack],
    scatterCount: 28,
    landmarks: [
      { object: O.furnace, at: 300, side: 34 },
      { object: O.furnace, at: 520, side: -34 },
      { object: O.ladle, at: 230, side: 14 },
      { object: O.ladle, at: 430, side: -14 },
      { object: O.ladle, at: 640, side: 30 },
      { object: O.pumpRig, at: 60, side: -16 },
    ],
  },
};
