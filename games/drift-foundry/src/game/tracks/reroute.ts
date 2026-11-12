import { TRACK_OBJECT as O } from "../objects/catalog";
import type { TrackTheme } from "./course";

/**
 * The Reroute: the foreman re-lays the haul roads across the south lot every shift. The course is the
 * `reroute` course in editor.scene.json, grown by the engine's course generator from its dials and
 * a seed that changes each day; its pinned gantry drops a container in late. This file fills the
 * generator's slots with the yard's own content: slag spills on the timed slots, half-lane belts on
 * the lane slots, oil on the glazed corners, tyre ramps and scrap walls on the barricades.
 */
export const REROUTE: TrackTheme = {
  id: "reroute",
  label: "The Reroute",
  blurb: "A new haul road every shift: the foreman lays it overnight, one shortcut, five walls and whatever spills.",
  pavedHalfWidth: 6.5,
  bandZ: -337,
  ground: { low: "#231b14", high: "#4e3b2a", waterline: "#231b14" },
  fog: { color: "#6b5a48", near: 45, far: 260 },
  sky: { horizonColor: "#d08a4a", zenithColor: "#3a2a1e", sunIntensity: 1.7, ambientIntensity: 0.9 },
  baseLevel: 0,
  rivalTake: { rival_hobbs: ["shortcut-1"] },
  // Escape time the line multiplier is judged against: the generated course's own sim time scaled to
  // a kart's pace (see `rerouteTrackDef`); this is only the fallback.
  par: 55,
  dressing: {
    edge: O.edgeTyre,
    edgeSpacing: 6,
    lamp: O.lampStreet,
    lampSpacing: 36,
    scatter: [O.crate, O.coveredCar, O.pipes, O.rack, O.generator],
    scatterCount: 30,
  },
  fill: {
    hazards: {
      timed: { kind: "slag", label: "SLAG SPILLING ACROSS THE REROUTE" },
      lane: { kind: "belt", label: "SCRAP BELT ACROSS HALF THE ROAD", push: -2.5 },
      surface: { kind: "slick", label: "OIL ON THE BEND" },
    },
    gates: {
      jump: [
        { label: "TYRE RAMP", radioLine: "OFF THE TYRES — NEW ROAD, SAME AIR" },
        { label: "SKIP RAMP", radioLine: "OVER THE SKIP — FOREMAN WON'T LIKE THAT" },
        { label: "PALLET KICKER", radioLine: "PALLET KICKER CLEARED — KEEP HER LIT" },
      ],
      block: [
        { label: "SCRAP WALL", radioLine: "THROUGH THE SCRAP WALL — THAT'S THE REROUTE" },
        { label: "CAR STACK", radioLine: "CAR STACK DOWN — WHO PARKED THAT THERE" },
        { label: "CRATE LINE", radioLine: "CRATES EVERYWHERE — STAY ON THE NEW ROAD" },
      ],
    },
    zones: [
      { id: "reroute-lot", label: "SOUTH LOT", radioName: "THE LOT", wallColor: "#e0a050", surface: { id: "dirt", label: "PACKED DIRT", grip: 0.97 } },
      { id: "reroute-haul", label: "NEW HAUL ROAD", radioName: "THE HAUL ROAD", wallColor: "#c8c0a8", surface: { id: "gravel", label: "FRESH GRAVEL", grip: 0.94 } },
      { id: "reroute-gate", label: "SOUTH GATE RUN", radioName: "THE GATE RUN", wallColor: "#ff7a3a", surface: { id: "asphalt", label: "OLD ASPHALT", grip: 1.01 } },
    ],
    landmarks: [O.furnace, O.signalBox, O.pumpRig, O.generator, O.ladle, O.rack],
  },
};
