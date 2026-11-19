import { TRACK_OBJECT as O } from "../objects/catalog";
import type { TrackTheme } from "./course";

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
