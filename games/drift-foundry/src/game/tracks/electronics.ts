import { TRACK_OBJECT as O } from "../objects/catalog";
import { STANDARD_OPENING, trackDrops } from "./drops";
import { detour, straight, turn, type TrackDef } from "./types";

/**
 * Electronics, after the lights go down: a narrow serpentine of right angles between the TV walls,
 * every screen still playing the same demo reel. Returns conveyors run under the floor - some carry
 * you, some fight you, some only cover half the aisle. The stockroom runs straight through the
 * back on a fast belt, past a ramp.
 */
export const ELECTRONICS: TrackDef = {
  id: "electronics",
  label: "Electronics",
  blurb: "Lights out between the TV walls: narrow right angles, returns conveyors that carry or fight you, and a fast stockroom belt over a ramp.",
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
  branches: [{ id: "stockroom", from: 103, to: 224, halfWidth: 5.5, label: "STOCKROOM" }],
  hazards: [
    { id: "stockroom-belt", kind: "belt", route: "stockroom", from: 6, to: 70, push: 4.5, label: "FAST BELT IN THE STOCKROOM" },
    { id: "long-way-belt", kind: "belt", from: 140, to: 186, offset: [-8, 0], push: -2.5, label: "RETURNS BELT ON THE LONG WAY" },
    { id: "feed-belt", kind: "belt", from: 252, to: 298, push: 3, label: "RESTOCK BELT" },
    { id: "return-belt", kind: "belt", from: 406, to: 462, offset: [0, 8], push: -3, label: "RETURNS BELT - TAKE THE OTHER LANE" },
    { id: "sorter-belt", kind: "belt", from: 570, to: 636, offset: [-8, 0], push: 3.5, label: "GAMING-CORNER BELT" },
    { id: "out-belt", kind: "belt", from: 712, to: 760, push: 3, label: "CHECKOUT BELT" },
  ],
  gates: [
    { id: "elec_plow_tvboxes", requirement: "plow", at: 92, label: "BOXED-TV WALL", radioLine: "TV BOXES EVERYWHERE — INTO THE MAZE" },
    { id: "elec_jump_stockroom", requirement: "jump", route: "stockroom", at: 160, label: "STOCKROOM RAMP", radioLine: "OFF THE STOCKROOM RAMP — BELT'S DOING THE WORK" },
    { id: "elec_jump_speakers", requirement: "jump", at: 275, label: "SPEAKER-STACK HUMP", radioLine: "OVER THE SUBWOOFERS — LEFT, RIGHT, LEFT" },
    { id: "elec_plow_printers", requirement: "plow", at: 430, label: "PRINTER-BOX STACK", radioLine: "PRINTERS BURST — PC LOAD LETTER" },
    { id: "elec_jump_cables", requirement: "jump", at: 600, label: "CABLE-REEL GAP", radioLine: "CLEARED THE CABLES — TWO MORE CORNERS" },
    { id: "elec_plow_security", requirement: "plow", at: 690, label: "ANTI-THEFT GATE", radioLine: "THROUGH THE SECURITY GATE — IT'S BEEPING, KEEP GOING" },
  ],
  pickups: trackDrops(STANDARD_OPENING, [{ at: 150, lane: 2 }, { at: 330 }, { at: 520 }, { at: 675 }]),
  exitAt: 760,
  zones: [
    { id: "elec-returns", label: "RETURNS DESK", radioName: "RETURNS", start: 0, end: 227, wallColor: "#3fe0d4", surface: { id: "rubber", label: "RUBBER MATTING", grip: 1 } },
    { id: "elec-tvwall", label: "TV-WALL MAZE", radioName: "THE TV WALL", start: 227, end: 545, wallColor: "#5a6cff", surface: { id: "polish", label: "FRESH-POLISHED FLOOR", grip: 0.94 } },
    { id: "elec-gaming", label: "GAMING CORNER", radioName: "THE GAMING CORNER", start: 545, end: 760, wallColor: "#ff4f9a", surface: { id: "carpet", label: "DEMO-STAND CARPET", grip: 0.98 } },
  ],
  bandZ: 1760,
  ground: { low: "#15182a", high: "#2a2f48", waterline: "#15182a" },
  fog: { color: "#141a36", near: 30, far: 170 },
  sky: { horizonColor: "#232a52", zenithColor: "#080a16", sunIntensity: 0.45, ambientIntensity: 0.55 },
  baseLevel: 0,
  // Lights out: dark demo-floor carpet, so the TV walls are the light in the room.
  floor: "#2c3048",
  // The showroom's house lights are off: a faint blue spill and the screens themselves.
  light: { key: { intensity: 0.12, color: "#7f8cff" }, fill: { intensity: 0.22, color: "#4a5bb0", groundColor: "#1a1d36" }, environment: 0.12, emissive: { house: 0.04 } },
  rivalTake: { rival_brick: ["stockroom"] },
  par: 63,
  stock: {
    goods: ["big_tv", "game_console", "headphones", "soda_case", "chips", "marshmallows"],
    powerUps: ["extinguisher", "mop", "marbles", "bouncy_balls"],
  },
  dressing: {
    edge: O.edgeTvWall,
    edgeSpacing: 4.4,
    lamp: O.lampCeiling,
    lampAt: "centre",
    lampSpacing: 22,
    scatter: [O.tvBox, O.boxPile, O.palletStack, O.cone, O.endcap],
    scatterCount: 34,
    landmarks: [
      { object: O.bigScreen, at: 330, side: -14 },
      { object: O.bigScreen, at: 520, side: 14 },
      { object: O.deptSign, at: 30, side: 0 },
      { object: O.tvBox, at: 430, side: 12 },
      { object: O.wetFloor, at: 700, side: -6 },
    ],
  },
};
