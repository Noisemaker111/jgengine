import { TRACK_OBJECT as O } from "../objects/catalog";
import { STANDARD_OPENING, trackDrops } from "./drops";
import { detour, straight, turn, type TrackDef } from "./types";

/**
 * Produce: three long chilled aisles laid across the juice flood from a burst cold-press tank,
 * joined by two tight hairpins round the citrus pyramids. The first aisle swings wide round the
 * flower stand; the salad bar goes straight across it, if the casters can clear the sneeze guard.
 * Oranges avalanche off the pyramids and roll across the aisles on a beat.
 */
export const PRODUCE: TrackDef = {
  id: "produce",
  label: "Produce",
  blurb: "Three chilled aisles over a juice flood and two grape-slick hairpins. The salad bar cuts the corner if you can jump the sneeze guard.",
  origin: 60,
  start: { x: -150, z: 1000, heading: Math.PI / 2, elevation: 0.6 },
  halfWidth: 9,
  pavedHalfWidth: 6.5,
  pieces: [
    straight(60),
    straight(120),
    ...detour(1, 60, 20, 25),
    straight(15),
    turn(-180, 24),
    straight(160),
    turn(180, 24),
    straight(140),
  ],
  branches: [
    { id: "salad-bar", from: 123, to: 251, halfWidth: 5.5, label: "SALAD BAR" },
    // Straight through the walk-in cooler across the first hairpin.
    { id: "cold-room", from: 268, to: 364, halfWidth: 4.5, label: "WALK-IN COOLER", secret: true },
  ],
  hazards: [
    { id: "oranges-stand", kind: "tumble", from: 178, to: 194, cycle: { period: 6, active: 2.4 }, label: "ORANGES ROLLING ACROSS BY THE FLOWER STAND" },
    { id: "oranges-mid-1", kind: "tumble", from: 408, to: 420, cycle: { period: 7, active: 2.6, phase: 1 }, label: "ORANGE AVALANCHE IN THE AISLE" },
    { id: "oranges-mid-2", kind: "tumble", from: 478, to: 490, cycle: { period: 7, active: 2.6, phase: 4.5 }, label: "ORANGE AVALANCHE IN THE AISLE" },
    { id: "oranges-last", kind: "tumble", from: 640, to: 652, cycle: { period: 6, active: 2.2, phase: 2 }, label: "LAST LEMON SLIDE BEFORE THE COOLER" },
    { id: "hairpin-1", kind: "spill", from: 269, to: 344, label: "SQUASHED GRAPES ON THE HAIRPIN" },
    { id: "hairpin-2", kind: "spill", from: 504, to: 580, label: "SQUASHED GRAPES ON THE HAIRPIN" },
  ],
  gates: [
    { id: "produce_plow_melons", requirement: "plow", at: 108, label: "MELON-CRATE WALL", radioLine: "MELONS EVERYWHERE — MIND THE JUICE" },
    { id: "produce_jump_saladbar", requirement: "jump", route: "salad-bar", at: 187, label: "SNEEZE-GUARD HOP", radioLine: "OVER THE SALAD BAR — THAT'S THE SHORT WAY" },
    { id: "produce_jump_scale", requirement: "jump", at: 388, label: "PRODUCE-SCALE RAMP", radioLine: "OFF THE SCALE — 4.2 KILOS OF AIR" },
    { id: "produce_plow_potatoes", requirement: "plow", at: 455, label: "POTATO-SACK STACK", radioLine: "POTATOES SCATTERED — HOT POTATO" },
    { id: "produce_jump_bananas", requirement: "jump", at: 618, label: "BANANA-BOX RAMP", radioLine: "CLEARED THE BANANAS — COOLER'S IN SIGHT" },
    { id: "produce_plow_cooler", requirement: "plow", at: 668, label: "COOLER-ROOM FLAPS", radioLine: "THROUGH THE COOLER FLAPS — GO FOR THE TILLS" },
  ],
  pickups: trackDrops(STANDARD_OPENING, [{ at: 175 }, { at: 360, lane: 1 }, { at: 525 }, { at: 600, lane: -1 }]),
  exitAt: 690,
  zones: [
    { id: "produce-citrus", label: "CITRUS AISLE", radioName: "THE CITRUS AISLE", start: 0, end: 269, wallColor: "#ff9a1e", surface: { id: "misted", label: "MISTED TILE", grip: 0.95 } },
    { id: "produce-grapes", label: "GRAPE HAIRPINS", radioName: "THE HAIRPINS", start: 269, end: 580, wallColor: "#8a3fd6", surface: { id: "grape", label: "GRAPE-SMEARED TILE", grip: 0.92 } },
    { id: "produce-cooler", label: "COOLER RUN", radioName: "THE COOLER", start: 580, end: 690, wallColor: "#5fd0ff", surface: { id: "plate", label: "COOLER FLOOR", grip: 0.98 } },
  ],
  bandZ: 1030,
  ground: { low: "#aebaa3", high: "#c3ccb6", waterline: "#ff9a1e" },
  fog: { color: "#d8e0cf", near: 60, far: 320 },
  sky: { horizonColor: "#f6fbef", zenithColor: "#d9e6d2", sunIntensity: 1.7, ambientIntensity: 1.35 },
  baseLevel: -3.2,
  // Fresh-pressed, not sea: a pulpy orange flood with bright crests and a foamy edge.
  liquid: { level: -1.3, color: "#ff9a1e", waveHeight: 0.06, palette: { deep: "#e0600a", crest: "#ffd27a", foam: "#fff1c9", fresnel: 0.1 } },
  rivalTake: { rival_brick: ["salad-bar"] },
  par: 50,
  stock: {
    goods: ["watermelon", "pumpkin", "chips", "marshmallows", "soda_case", "cereal", "potted_fern", "ice_cream"],
    powerUps: ["rotisserie_chicken", "marbles", "extinguisher", "mop"],
  },
  dressing: {
    edge: O.edgeProduce,
    edgeSpacing: 4.4,
    lamp: O.lampCeiling,
    lampAt: "centre",
    lampSpacing: 16,
    scatter: [O.palletStack, O.boxPile, O.endcap, O.flowers, O.cartCorral],
    scatterCount: 30,
    landmarks: [
      { object: O.deptSign, at: 40, side: 0 },
      // Outside the hairpin, clear of the walk-in cooler cut through its middle.
      { object: O.tumbleBin, at: 300, side: 30 },
      { object: O.endcap, at: [170, 1040] },
      { object: O.flowers, at: 186, side: 32 },
      { object: O.deptSign, at: 545, side: 0 },
      { object: O.wetFloor, at: 690, side: 7 },
    ],
  },
};
