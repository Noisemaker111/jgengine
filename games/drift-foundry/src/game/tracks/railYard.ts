import { TRACK_OBJECT as O } from "../objects/catalog";
import type { TrackTheme } from "./course";

/**
 * The Rail Yard: a wide, fast run of right angles through the marshalling yard, crossed twice by
 * freight that does not stop for karts. The long way swings round the signal box; the shed cut goes
 * straight through the engine shed, doors and oily floor and all. On the back straight a gantry drops
 * a container into the road a little over twenty seconds in - be past it or plow it. The course
 * itself is the `rail-yard` course in editor.scene.json.
 */
export const RAIL_YARD: TrackTheme = {
  id: "rail-yard",
  label: "Rail Yard",
  blurb: "Right angles through the marshalling yard, two live freight crossings and a gantry that drops a container on the late.",
  pavedHalfWidth: 8.5,
  bandZ: -870,
  ground: { low: "#2b2824", high: "#56504a", waterline: "#2b2824" },
  fog: { color: "#8b97a3", near: 60, far: 320 },
  sky: { horizonColor: "#a9bccf", zenithColor: "#3d5672", sunIntensity: 2.2, ambientIntensity: 1.05 },
  baseLevel: 0,
  rivalTake: { rival_hobbs: ["shed-cut"], rival_moss: ["shed-cut"] },
  par: 64,
  dressing: {
    edge: O.edgeRail,
    edgeSpacing: 6,
    lamp: O.lampStreet,
    lampSpacing: 38,
    scatter: [O.coveredCar, O.cabinet, O.rack, O.crate, O.powerBox],
    scatterCount: 30,
  },
};
