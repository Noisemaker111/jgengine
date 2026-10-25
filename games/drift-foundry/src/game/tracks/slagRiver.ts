import { TRACK_OBJECT as O } from "../objects/catalog";
import { STANDARD_OPENING, trackDrops } from "./drops";
import { detour, straight, turn, type TrackDef } from "./types";

/**
 * Slag River: three causeways laid across a lake of molten slag, joined by two tight hairpins. The
 * first causeway swings wide around a pour pool; the broken ladle bridge goes straight across it, if
 * the springs can clear the gap in the middle. Spurts of slag cross the causeways on a beat.
 */
export const SLAG_RIVER: TrackDef = {
  id: "slag-river",
  label: "Slag River",
  blurb: "Three causeways over molten slag and two hairpins. The ladle bridge cuts the pour pool if you can jump the gap.",
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
  branches: [{ id: "ladle-bridge", from: 123, to: 251, halfWidth: 5.5, label: "LADLE BRIDGE" }],
  hazards: [
    { id: "spurt-pool", kind: "slag", from: 178, to: 194, cycle: { period: 6, active: 2.4 }, label: "SLAG SPURT ON THE POOL ROAD" },
    { id: "spurt-mid-1", kind: "slag", from: 408, to: 420, cycle: { period: 7, active: 2.6, phase: 1 }, label: "SLAG ACROSS THE CAUSEWAY" },
    { id: "spurt-mid-2", kind: "slag", from: 478, to: 490, cycle: { period: 7, active: 2.6, phase: 4.5 }, label: "SLAG ACROSS THE CAUSEWAY" },
    { id: "spurt-last", kind: "slag", from: 640, to: 652, cycle: { period: 6, active: 2.2, phase: 2 }, label: "LAST SPURT BEFORE THE SHED" },
    { id: "hairpin-1", kind: "slick", from: 269, to: 344, label: "SLAG-GLAZED HAIRPIN" },
    { id: "hairpin-2", kind: "slick", from: 504, to: 580, label: "SLAG-GLAZED HAIRPIN" },
  ],
  gates: [
    { id: "slag_plow_crust", requirement: "plow", at: 108, label: "SLAG-CRUST WALL", radioLine: "PLOWED THE CRUST — MIND THE HEAT" },
    { id: "slag_jump_ladle", requirement: "jump", route: "ladle-bridge", at: 187, label: "LADLE BRIDGE GAP", radioLine: "OVER THE LADLE GAP — THAT'S THE SHORT WAY" },
    { id: "slag_jump_skimmer", requirement: "jump", at: 388, label: "SKIMMER RAMP", radioLine: "OVER THE SKIMMER — STAY ON THE CAUSEWAY" },
    { id: "slag_plow_pigs", requirement: "plow", at: 455, label: "PIG-IRON STACK", radioLine: "PIG IRON SCATTERED — HOT HANDS" },
    { id: "slag_jump_trough", requirement: "jump", at: 618, label: "COOLING TROUGH", radioLine: "CLEARED THE TROUGH — SHED'S IN SIGHT" },
    { id: "slag_plow_shed", requirement: "plow", at: 668, label: "POUR-SHED SHUTTER", radioLine: "THROUGH THE SHUTTER — GO FOR THE GATE" },
  ],
  pickups: trackDrops(STANDARD_OPENING, [{ at: 175 }, { at: 360, lane: 1 }, { at: 525 }, { at: 600, lane: -1 }]),
  exitAt: 690,
  zones: [
    { id: "slag-causeway", label: "SLAG CAUSEWAY", radioName: "THE CAUSEWAY", start: 0, end: 269, wallColor: "#ff6a1a", surface: { id: "crust", label: "SLAG CRUST", grip: 0.95 } },
    { id: "slag-hairpins", label: "LADLE HAIRPINS", radioName: "THE HAIRPINS", start: 269, end: 580, wallColor: "#ff8f3a", surface: { id: "glaze", label: "GLAZED SLAG", grip: 0.92 } },
    { id: "slag-shed", label: "POUR-SHED RUN", radioName: "THE POUR SHED", start: 580, end: 690, wallColor: "#c9541c", surface: { id: "plate", label: "STEEL PLATE", grip: 0.98 } },
  ],
  bandZ: 1030,
  ground: { low: "#140d0a", high: "#3a2116", waterline: "#ff5a14" },
  fog: { color: "#5a2410", near: 40, far: 240 },
  sky: { horizonColor: "#ff4a14", zenithColor: "#2a0d06", sunIntensity: 1.5, ambientIntensity: 0.75 },
  baseLevel: -3.2,
  // Molten, not sea: dark crust at depth, hot crests, an orange lick at the banks, little sky in it.
  liquid: { level: -1.3, color: "#ff5a12", waveHeight: 0.08, palette: { deep: "#6a1400", crest: "#ffb238", foam: "#ff8a1e", fresnel: 0.12 } },
  rivalTake: { rival_hobbs: ["ladle-bridge"] },
  par: 50,
  dressing: {
    edge: O.edgeBarrel,
    edgeSpacing: 7,
    lamp: O.lampSearch,
    lampSpacing: 42,
    scatter: [O.pipes, O.propane, O.barrelStove, O.militaryCrate],
    scatterCount: 26,
    landmarks: [
      { object: O.ladle, at: 186, side: 32 },
      { object: O.ladle, at: 300, side: -30 },
      { object: O.furnace, at: [170, 1040] },
      { object: O.furnace, at: [-80, 1140] },
      { object: O.pumpRig, at: 545, side: 30 },
      { object: O.signalBox, at: 690, side: 13 },
    ],
  },
};
