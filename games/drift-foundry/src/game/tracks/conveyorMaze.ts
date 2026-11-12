import { TRACK_OBJECT as O } from "../objects/catalog";
import type { TrackTheme } from "./course";

/**
 * The Conveyor Maze, on the night shift: a narrow serpentine of right angles through the sorting
 * sheds, under searchlights. Belts run under the road - some carry you, some fight you, some only
 * cover half a lane. The belt hall runs straight through the first shed on a fast belt, past a ramp.
 * The course itself is the `conveyor-maze` course in editor.scene.json.
 */
export const CONVEYOR_MAZE: TrackTheme = {
  id: "conveyor-maze",
  label: "Conveyor Maze",
  blurb: "Night in the sorting sheds: narrow right angles, belts that carry or fight you, and a fast belt hall over a ramp.",
  pavedHalfWidth: 8,
  bandZ: 1760,
  ground: { low: "#0d0f16", high: "#262a36", waterline: "#0d0f16" },
  fog: { color: "#0e1224", near: 30, far: 170 },
  sky: { horizonColor: "#1d2340", zenithColor: "#070910", sunIntensity: 0.35, ambientIntensity: 0.4 },
  baseLevel: 0,
  rivalTake: { rival_hobbs: ["belt-hall"] },
  par: 63,
  dressing: {
    edge: O.edgeTyre,
    edgeSpacing: 5,
    lamp: O.lampSearch,
    lampSpacing: 26,
    scatter: [O.crate, O.militaryCrate, O.rack, O.cabinet, O.powerBox],
    scatterCount: 34,
  },
};
