import { TRACK_OBJECT as O } from "../objects/catalog";
import type { TrackTheme } from "./course";

/**
 * The Flooded Quarry: down a 12 m ramp into a rain-filled pit, along the wet pit floor and out up
 * the far wall. The ledge road skirts the deep pool and carries a scrap frame; the pit wade goes
 * straight through the water, shorter and slower, and leaves the frame behind. The course itself is
 * the `flooded-quarry` course in editor.scene.json.
 */
export const FLOODED_QUARRY: TrackTheme = {
  id: "flooded-quarry",
  label: "Flooded Quarry",
  blurb: "Down into a rain-filled pit and out again. Wade the deep pool or take the ledge and the drop on it.",
  pavedHalfWidth: 7,
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
  },
};
