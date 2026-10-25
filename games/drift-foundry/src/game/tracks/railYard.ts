import { TRACK_OBJECT as O } from "../objects/catalog";
import { STANDARD_OPENING, trackDrops } from "./drops";
import { detour, straight, turn, type TrackDef } from "./types";

/**
 * The Rail Yard: a wide, fast run of right angles through the marshalling yard, crossed twice by
 * freight that does not stop for karts. The long way swings round the signal box; the shed cut goes
 * straight through the engine shed, doors and oily floor and all. On the back straight a gantry drops
 * a container into the road a little over twenty seconds in - be past it or plow it.
 */
export const RAIL_YARD: TrackDef = {
  id: "rail-yard",
  label: "Rail Yard",
  blurb: "Right angles through the marshalling yard, two live freight crossings and a gantry that drops a container on the late.",
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
  branches: [{ id: "shed-cut", from: 334, to: 489, halfWidth: 6, label: "SHED CUT" }],
  hazards: [
    { id: "crossing-a", kind: "train", from: 210, to: 218, cycle: { period: 12, active: 4, phase: 5 }, label: "FREIGHT ON THE INBOUND LINE" },
    { id: "crossing-b", kind: "train", from: 612, to: 620, cycle: { period: 10, active: 3.5, phase: 1 }, label: "FREIGHT ON THE MARSHALLING LINE" },
    { id: "shed-oil", kind: "slick", route: "shed-cut", from: 18, to: 100, label: "OIL-SOAKED SHED FLOOR" },
  ],
  gates: [
    { id: "rail_plow_sleepers", requirement: "plow", at: 108, label: "SLEEPER STACK", radioLine: "SLEEPERS SPLIT — WATCH THE CROSSING" },
    { id: "rail_jump_buffer", requirement: "jump", at: 252, label: "BUFFER-STOP RAMP", radioLine: "OVER THE BUFFERS — NICE AIR" },
    { id: "rail_plow_shed", requirement: "plow", route: "shed-cut", at: 405, label: "ENGINE SHED DOORS", radioLine: "THROUGH THE SHED DOORS — SHORT WAY HOME" },
    { id: "rail_plow_container", requirement: "plow", at: 598, dropsAt: 24, label: "DROPPED CONTAINER", radioLine: "CONTAINER SMASHED — THE GANTRY MISSED YOU" },
    { id: "rail_jump_last", requirement: "jump", at: 735, label: "LAST BUFFER RAMP", radioLine: "LAST BUFFERS CLEARED — GATE'S RIGHT THERE" },
  ],
  pickups: trackDrops(STANDARD_OPENING, [{ at: 282 }, { at: 400, lane: 1 }, { at: 560 }, { at: 700, lane: -1 }]),
  exitAt: 748,
  zones: [
    { id: "rail-sidings", label: "INBOUND SIDINGS", radioName: "THE SIDINGS", start: 0, end: 269, wallColor: "#8fa3b8", surface: { id: "ballast", label: "PACKED BALLAST", grip: 0.97 } },
    { id: "rail-shed", label: "ENGINE SHED YARD", radioName: "THE SHED YARD", start: 269, end: 575, wallColor: "#c7b07a", surface: { id: "concrete", label: "SHED APRON", grip: 1 } },
    { id: "rail-marshal", label: "MARSHALLING LINE", radioName: "THE MARSHALLING LINE", start: 575, end: 748, wallColor: "#d9d2c3", surface: { id: "asphalt", label: "YARD ROAD", grip: 1.02 } },
  ],
  bandZ: -870,
  ground: { low: "#2b2824", high: "#56504a", waterline: "#2b2824" },
  fog: { color: "#8b97a3", near: 60, far: 320 },
  sky: { horizonColor: "#a9bccf", zenithColor: "#3d5672", sunIntensity: 2.2, ambientIntensity: 1.05 },
  baseLevel: 0,
  rivalTake: { rival_hobbs: ["shed-cut"], rival_moss: ["shed-cut"] },
  par: 64,
  dressing: {
    edge: O.edgeRail,
    edgeSpacing: 6,
    lamp: O.lampStreet,
    lampSpacing: 38,
    scatter: [O.coveredCar, O.cabinet, O.rack, O.crate, O.powerBox],
    scatterCount: 30,
    landmarks: [
      { object: O.signalBox, at: 412, side: 40 },
      { object: O.gantryLeg, at: 598, side: 13 },
      { object: O.gantryLeg, at: 598, side: -13 },
      { object: O.furnace, at: [-60, -1030] },
      { object: O.rack, at: 140, side: 16 },
      { object: O.generator, at: 330, side: -16 },
    ],
  },
};
