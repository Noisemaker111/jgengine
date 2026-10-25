import { TRACK_OBJECT as O } from "../objects/catalog";
import { STANDARD_OPENING, trackDrops } from "./drops";
import { detour, straight, turn, type TrackDef } from "./types";

/**
 * The Flooded Quarry: down a 12 m ramp into a rain-filled pit, along the wet pit floor and out up
 * the far wall. The ledge road skirts the deep pool and carries a scrap frame; the pit wade goes
 * straight through the water, shorter and slower, and leaves the frame behind.
 */
export const FLOODED_QUARRY: TrackDef = {
  id: "flooded-quarry",
  label: "Flooded Quarry",
  blurb: "Down into a rain-filled pit and out again. Wade the deep pool or take the ledge and the drop on it.",
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
  branches: [{ id: "pit-wade", from: 459, to: 576, halfWidth: 7, label: "PIT WADE" }],
  hazards: [
    { id: "flood-south", kind: "flood", from: 292, to: 353, label: "STANDING WATER" },
    { id: "flood-floor", kind: "flood", from: 416, to: 456, label: "STANDING WATER" },
    { id: "flood-exit", kind: "flood", from: 579, to: 612, label: "STANDING WATER" },
    { id: "pool", kind: "flood", route: "pit-wade", from: 4, to: 78, push: 1, label: "DEEP POOL" },
  ],
  gates: [
    { id: "pit_plow_spoil", requirement: "plow", at: 108, label: "SPOIL HEAP", radioLine: "THROUGH THE SPOIL — DOWN WE GO" },
    { id: "pit_jump_ramp", requirement: "jump", at: 200, label: "HAUL-RAMP LIP", radioLine: "OFF THE LIP — HOLD IT ON THE WET" },
    { id: "pit_plow_pump", requirement: "plow", at: 322, label: "PUMP-PIPE WALL", radioLine: "PUMP PIPES DOWN — SPLASH ON" },
    { id: "pit_jump_crusher", requirement: "jump", at: 596, label: "CRUSHER-FEED RAMP", radioLine: "OVER THE FEED — NOW CLIMB OUT" },
    { id: "pit_plow_rockfall", requirement: "plow", at: 700, label: "ROCKFALL", radioLine: "THROUGH THE ROCKFALL — RIM'S UP THERE" },
    { id: "pit_jump_rim", requirement: "jump", at: 772, label: "RIM BERM", radioLine: "OVER THE RIM — OUT OF THE PIT" },
  ],
  pickups: trackDrops(STANDARD_OPENING, [{ at: 300 }, { at: 518, lane: 2 }, { at: 640 }, { at: 740, lane: -1 }]),
  exitAt: 792,
  zones: [
    { id: "pit-rim", label: "QUARRY RIM", radioName: "THE RIM", start: 0, end: 220, wallColor: "#a9a294", surface: { id: "gravel", label: "WET GRAVEL", grip: 0.93 } },
    { id: "pit-floor", label: "FLOODED PIT FLOOR", radioName: "THE PIT", start: 220, end: 609, wallColor: "#6f8f95", surface: { id: "mud", label: "SLURRY MUD", grip: 0.88 } },
    { id: "pit-climb", label: "HAUL-ROAD CLIMB", radioName: "THE CLIMB", start: 609, end: 792, wallColor: "#d4c29a", surface: { id: "rock", label: "BROKEN ROCK", grip: 0.96 } },
  ],
  bandZ: -2250,
  ground: { low: "#34332f", high: "#6d675d", waterline: "#3c4a4c" },
  fog: { color: "#6c7a7c", near: 40, far: 230 },
  sky: { horizonColor: "#7d8a8c", zenithColor: "#3a4448", sunIntensity: 1.0, ambientIntensity: 1.1 },
  weather: "rain",
  baseLevel: 0,
  liquid: { level: -11.55, color: "#3d5a5e", waveHeight: 0.18, palette: { deep: "#12262a", foam: "#9fb3ad" } },
  rivalTake: { rival_moss: ["pit-wade"] },
  par: 84,
  dressing: {
    edge: O.edgeBoulder,
    edgeSpacing: 7,
    lamp: O.lampStreet,
    lampSpacing: 46,
    scatter: [O.boulder, O.rock, O.generator, O.coveredCar],
    scatterCount: 30,
    landmarks: [
      { object: O.pumpRig, at: 330, side: -14 },
      { object: O.pumpRig, at: 430, side: 14 },
      { object: O.furnace, at: [-200, -2080] },
      { object: O.boulder, at: 520, side: -36 },
    ],
  },
};
