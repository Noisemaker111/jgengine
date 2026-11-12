import { TRACK_OBJECT as O } from "../objects/catalog";
import type { TrackTheme } from "./course";

/**
 * Smelter Climb: up through the smelter on two long ramps and two hairpins, 26 m from the casting
 * floor to the tapping gallery. Ladles pour across the ramps on a beat. At the top, the tapping
 * floor cuts the gallery's dog-leg - through a plow wall and under one more pour. The course itself
 * is the `smelter-climb` course in editor.scene.json.
 */
export const SMELTER_CLIMB: TrackTheme = {
  id: "smelter-climb",
  label: "Smelter Climb",
  blurb: "Two long ramps and two hairpins climb 26 m through the smelter while the ladles pour across the road.",
  pavedHalfWidth: 6.5,
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
  },
};
