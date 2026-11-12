import { TRACK_OBJECT as O } from "../objects/catalog";
import type { TrackTheme } from "./course";

/**
 * Slag River: three causeways laid across a lake of molten slag, joined by two tight hairpins. The
 * first causeway swings wide around a pour pool; the broken ladle bridge goes straight across it, if
 * the springs can clear the gap in the middle. Spurts of slag cross the causeways on a beat. The
 * course itself is the `slag-river` course in editor.scene.json.
 */
export const SLAG_RIVER: TrackTheme = {
  id: "slag-river",
  label: "Slag River",
  blurb: "Three causeways over molten slag and two hairpins. The ladle bridge cuts the pour pool if you can jump the gap.",
  pavedHalfWidth: 6.5,
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
  },
};
