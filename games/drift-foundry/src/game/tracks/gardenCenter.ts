import { TRACK_OBJECT as O } from "../objects/catalog";
import { STANDARD_OPENING, trackDrops } from "./drops";
import { detour, straight, turn, type TrackDef } from "./types";

/**
 * The Garden Centre: out the side doors into the rain, down a 12 m ramp past the patio sets into the
 * sunken nursery, along the mud between the planters and out up the lumber-yard ramp. The path
 * skirts the koi pond and carries a basket mod; the pond wade goes straight through the water,
 * shorter and slower, and leaves the mod behind.
 */
export const GARDEN_CENTER: TrackDef = {
  id: "garden-center",
  label: "Garden Centre",
  blurb: "Outdoors after the rain: down into the sunken nursery, through the mud and back up the lumber ramp. Wade the koi pond or take the path.",
  origin: 60,
  start: { x: -300, z: -2150, heading: Math.PI / 2 },
  halfWidth: 10,
  pavedHalfWidth: 7,
  pieces: [
    straight(60),
    straight(120),
    straight(100, { rise: -12 }),
    turn(90, 40),
    straight(70),
    turn(-90, 40),
    straight(40),
    ...detour(1, 60, 20, 20),
    straight(30),
    turn(-90, 40),
    straight(120, { rise: 12 }),
    straight(30),
  ],
  branches: [{ id: "koi-pond", from: 459, to: 576, halfWidth: 7, label: "KOI POND" }],
  hazards: [
    { id: "mud-patio", kind: "puddle", from: 292, to: 353, label: "SPRINKLER PUDDLE" },
    { id: "mud-nursery", kind: "puddle", from: 416, to: 456, label: "MUD BETWEEN THE PLANTERS" },
    { id: "mud-exit", kind: "puddle", from: 579, to: 612, label: "HOSE LEFT RUNNING" },
    { id: "pond", kind: "puddle", route: "koi-pond", from: 4, to: 78, push: 1, label: "KOI POND - SORRY, FISH" },
  ],
  gates: [
    { id: "garden_plow_mulch", requirement: "plow", at: 108, label: "MULCH-BAG WALL", radioLine: "MULCH EVERYWHERE — DOWN WE GO" },
    { id: "garden_jump_pavers", requirement: "jump", at: 200, label: "PATIO-PAVER RAMP", radioLine: "OFF THE PAVERS — HOLD IT ON THE WET" },
    { id: "garden_plow_hoses", requirement: "plow", at: 322, label: "HOSE-REEL WALL", radioLine: "HOSE REELS DOWN — SPLASH ON" },
    { id: "garden_jump_planter", requirement: "jump", at: 596, label: "RAISED-PLANTER RAMP", radioLine: "OVER THE PLANTER — NOW CLIMB OUT" },
    { id: "garden_plow_gnomes", requirement: "plow", at: 700, label: "GNOME ARMY", radioLine: "THROUGH THE GNOMES — THEY'LL REMEMBER THIS" },
    { id: "garden_jump_lumber", requirement: "jump", at: 772, label: "LUMBER-STACK RAMP", radioLine: "OVER THE LUMBER — BACK INDOORS" },
  ],
  pickups: trackDrops(STANDARD_OPENING, [{ at: 300 }, { at: 518, lane: 2 }, { at: 640 }, { at: 740, lane: -1 }]),
  exitAt: 792,
  zones: [
    { id: "garden-patio", label: "OUTDOOR PATIO", radioName: "THE PATIO", start: 0, end: 220, wallColor: "#c9b38a", surface: { id: "pavers", label: "WET PAVERS", grip: 0.93 } },
    { id: "garden-nursery", label: "SUNKEN NURSERY", radioName: "THE NURSERY", start: 220, end: 609, wallColor: "#4f9a4a", surface: { id: "mud", label: "POTTING MUD", grip: 0.88 } },
    { id: "garden-lumber", label: "LUMBER-YARD CLIMB", radioName: "THE LUMBER YARD", start: 609, end: 792, wallColor: "#d8b47a", surface: { id: "sawdust", label: "SAWDUST", grip: 0.96 } },
  ],
  bandZ: -2250,
  ground: { low: "#3f4a33", high: "#6f7a52", waterline: "#3c4a4c" },
  fog: { color: "#71807d", near: 40, far: 230 },
  sky: { horizonColor: "#8a9692", zenithColor: "#3a4448", sunIntensity: 1.0, ambientIntensity: 1.1 },
  baseLevel: 0,
  liquid: { level: -11.55, color: "#2f6a5e", waveHeight: 0.14, palette: { deep: "#0f2a26", foam: "#b9d3c4" } },
  rivalTake: { rival_twins: ["koi-pond"] },
  par: 84,
  stock: {
    goods: ["garden_gnome", "potted_fern", "pumpkin", "paint_can", "dog_food", "watermelon", "rubber_duck"],
    powerUps: ["bouncy_balls", "mop", "extinguisher", "rotisserie_chicken"],
  },
  dressing: {
    indoor: false,
    edge: O.edgeHedge,
    edgeSpacing: 3.6,
    lamp: O.lampGarden,
    lampSpacing: 46,
    scatter: [O.tree, O.bush, O.flowers, O.palletStack, O.gnome],
    scatterCount: 40,
    landmarks: [
      { object: O.sprinkler, at: 330, side: -14 },
      { object: O.sprinkler, at: 430, side: 14 },
      { object: O.deptSign, at: 30, side: 0 },
      { object: O.tree, at: 520, side: -36 },
      { object: O.gnome, at: 700, side: 13 },
    ],
  },
};
