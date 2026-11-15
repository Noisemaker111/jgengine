import { TRACK_OBJECT as O } from "../objects/catalog";
import { STANDARD_OPENING, trackDrops } from "./drops";
import { detour, straight, turn, type TrackDef } from "./types";

/**
 * The Toy Aisle: up to the mezzanine on two long ramps and two hairpins, 26 m from the board-game
 * floor to the ball-pit gallery. Ball blasters on the shelf tops rain foam balls across the ramps on
 * a beat. At the top, the ball pit cuts the gallery's dog-leg - through a net wall and under one
 * more blaster.
 */
export const TOY_AISLE: TrackDef = {
  id: "toy-aisle",
  label: "Toy Aisle",
  blurb: "Two long ramps and two hairpins climb 26 m to the mezzanine while ball blasters rain foam balls across the road.",
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
  branches: [
    { id: "ball-pit", from: 596, to: 703, halfWidth: 6, label: "BALL PIT" },
    // The stock-room ramp behind the plush wall, cutting the first switchback.
    { id: "staff-stairs", from: 262, to: 362, halfWidth: 4.5, label: "STAFF STAIRS", secret: true },
  ],
  hazards: [
    { id: "balls-ramp-1", kind: "tumble", from: 225, to: 236, cycle: { period: 8, active: 3 }, label: "BALL BLASTER ON THE RAMP" },
    { id: "balls-pin-1", kind: "tumble", from: 292, to: 308, cycle: { period: 7, active: 2.5, phase: 2.5 }, label: "MARBLE RUN SPILLING ON THE HAIRPIN" },
    { id: "balls-ramp-2", kind: "tumble", from: 425, to: 436, cycle: { period: 8, active: 3, phase: 4 }, label: "BALL BLASTER ON THE RAMP" },
    { id: "balls-pin-2", kind: "tumble", from: 512, to: 528, cycle: { period: 7, active: 2.5, phase: 5.5 }, label: "MARBLE RUN SPILLING ON THE HAIRPIN" },
    { id: "balls-pit", kind: "tumble", route: "ball-pit", from: 34, to: 46, cycle: { period: 5, active: 2 }, label: "BALL PIT ERUPTING" },
  ],
  gates: [
    { id: "toy_plow_blocks", requirement: "plow", at: 108, label: "BLOCK-TOWER WALL", radioLine: "BLOCKS EVERYWHERE — START CLIMBING" },
    { id: "toy_jump_skate", requirement: "jump", at: 190, label: "SKATE RAMP", radioLine: "OFF THE SKATE RAMP — KEEP HER CLIMBING" },
    { id: "toy_plow_plush", requirement: "plow", at: 400, label: "PLUSH MOUNTAIN", radioLine: "THROUGH THE PLUSHIES — ONE MORE RAMP" },
    { id: "toy_jump_trainset", requirement: "jump", at: 455, label: "TRAIN-SET LOOP", radioLine: "OVER THE TRAIN SET — NEARLY AT THE TOP" },
    { id: "toy_plow_net", requirement: "plow", route: "ball-pit", at: 640, label: "BALL-PIT NET", radioLine: "THROUGH THE NET — STRAIGHT TO THE TILLS" },
  ],
  pickups: trackDrops(STANDARD_OPENING, [{ at: 245 }, { at: 360, lane: 1 }, { at: 545 }, { at: 650, lane: -1 }]),
  exitAt: 716,
  zones: [
    { id: "toy-floor", label: "BOARD-GAME FLOOR", radioName: "BOARD GAMES", start: 0, end: 260, wallColor: "#ff5a8a", surface: { id: "foam", label: "FOAM PLAY TILES", grip: 0.99 } },
    { id: "toy-ramps", label: "MEZZANINE RAMPS", radioName: "THE RAMPS", start: 260, end: 563, wallColor: "#ffc23a", surface: { id: "grip", label: "GRIP-TAPE RAMP", grip: 1.02 } },
    { id: "toy-gallery", label: "BALL-PIT GALLERY", radioName: "THE GALLERY", start: 563, end: 716, wallColor: "#3fb6ff", surface: { id: "balls", label: "STRAY BALLS", grip: 0.93 } },
  ],
  bandZ: -1640,
  ground: { low: "#cdb3c0", high: "#ddc6d1", waterline: "#cdb3c0" },
  fog: { color: "#e8d2de", near: 55, far: 280 },
  sky: { horizonColor: "#fff3f8", zenithColor: "#e6d2ff", sunIntensity: 1.6, ambientIntensity: 1.35 },
  baseLevel: 0,
  floor: "#c9a9bc",
  rivalTake: { rival_brick: ["ball-pit"] },
  par: 63,
  stock: {
    goods: ["teddy_bear", "rubber_duck", "game_console", "marshmallows", "chips", "headphones"],
    powerUps: ["bouncy_balls", "marbles", "mop", "extinguisher"],
  },
  dressing: {
    edge: O.edgeToyShelf,
    edgeSpacing: 4.4,
    lamp: O.lampCeiling,
    lampAt: "centre",
    tumble: O.ballBlaster,
    lampSpacing: 18,
    scatter: [O.plush, O.boxPile, O.endcap, O.palletStack, O.cone],
    scatterCount: 32,
    landmarks: [
      { object: O.ballBlaster, at: 300, side: 34 },
      { object: O.ballBlaster, at: 520, side: -34 },
      { object: O.deptSign, at: 30, side: 0 },
      { object: O.plush, at: 230, side: 14 },
      { object: O.plush, at: 430, side: -14 },
      { object: O.bigScreen, at: 640, side: 30 },
    ],
  },
};
