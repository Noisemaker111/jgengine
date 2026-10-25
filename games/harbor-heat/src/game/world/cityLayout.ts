import { librarySurfaceScan } from "@jgengine/assets/catalogs/materialLibrary";
import {
  cityRoadSource,
  createCityLayout,
  type CityLotRoad,
  type CityRoadSpec,
  type CityZone,
} from "@jgengine/core/world/cityLayout";

import { districtAt, ROADS, SHORE_X } from "./districts";

/**
 * Harbor Heat's street layout, in one block. Everything else (road widths, kerbs, sidewalks, every
 * building's lot, setback, height and driveway) is derived from these numbers, and each one is a
 * live slider under the dev runner's Tune tab (`?debug=1`, groups `city` and `city <zone>`): drag one
 * and the streets and blocks re-lay on the spot.
 *
 * Defaults are a US coastal city: 3.5 m lanes, four-lane avenues, two-lane streets with a 2.4 m
 * parking lane each side, 3 m sidewalks on a 15 cm kerb. Storeys are 3.33 m so the scanned brick
 * facades (six floors per 20 m tile) put one row of windows on every floor.
 */
export const cityLayout = createCityLayout({
  laneWidth: 3.5,
  avenueLanes: 4,
  streetLanes: 2,
  avenueParking: 0,
  streetParking: 2.4,
  sidewalkWidth: 3,
  kerbHeight: 0.15,
  cornerClearance: 4,
  drivewayWidth: 3,
  storyHeight: 3.33,
  zones: {
    core: { setback: 0, frontage: 30, depth: 26, spacing: 0, minFloors: 6, maxFloors: 18, driveways: false },
    commercial: { setback: 1.5, frontage: 20, depth: 18, spacing: 1, minFloors: 2, maxFloors: 5, driveways: false },
    residential: { setback: 6, frontage: 12, depth: 13, spacing: 4, minFloors: 1, maxFloors: 2, driveways: true },
    industrial: { setback: 4, frontage: 28, depth: 24, spacing: 6, minFloors: 1, maxFloors: 3, driveways: true },
  },
});

/** Scanned asphalt, concrete paving and gutters; the sidewalk keeps its sand tone and takes the grain. */
const STREET_SURFACES = {
  road: librarySurfaceScan("asphalt/dry"),
  sidewalk: librarySurfaceScan("concrete/smooth", { tint: 0 }),
  curb: librarySurfaceScan("concrete/smooth", { tint: 0 }),
};

/** The editor's road `level` meta picks the road class: avenues run north-south, streets cross them. */
const ROAD_SPECS: readonly CityRoadSpec[] = ROADS.map((segment) => ({
  path: [segment.from, segment.to],
  roadClass: segment.level === "avenue" ? "avenue" : "street",
  color: "#33363f",
  markingColor: "#f6cf4a",
  // Crossing ribbons sit at two heights so the junction never z-fights.
  elevation: segment.from[0] === segment.to[0] ? 0.08 : 0.16,
  sidewalk: { color: "#cdc6b6" },
  materials: STREET_SURFACES,
}));

/** The streets as the layout draws them right now; the shell re-renders them when a slider moves. */
export const roadSource = cityRoadSource(cityLayout, ROAD_SPECS);

/** Lot roads for `cityLots`: the same centrelines, with their class. */
export const LOT_ROADS: readonly CityLotRoad[] = ROAD_SPECS.map((spec) => ({
  path: spec.path,
  roadClass: spec.roadClass,
}));

/**
 * Mainsail Boulevard is built on one side only: west of this line is the boardwalk, the dunes and the
 * Gulf, so no lot lands on the sand.
 */
export const SEAFRONT_BUILD_LINE = SHORE_X + 24;

/** Which layout zone a point is: downtown is the core, the docks are industrial, the hills residential. */
export function zoneAt(x: number, z: number): CityZone | null {
  if (x < SEAFRONT_BUILD_LINE) return null;
  switch (districtAt(x, z)?.id) {
    case "downtown":
      return "core";
    case "mainsail_boulevard":
      return "commercial";
    case "port_carmine":
      return "industrial";
    default:
      return "residential";
  }
}
