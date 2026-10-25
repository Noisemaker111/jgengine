import type { CityZone } from "@jgengine/core/world/cityLayout";

/**
 * One cast of Harbor Heat's buildings. Every building is the same 1 m unit block
 * (`src/art/city-block.glb`) drawn at its lot's real width, depth and storey height; the look is a
 * scanned ambientCG facade projected in metres onto the block's `facade` material, so a five-floor
 * walk-up shows five rows of windows and a 20-floor tower shows twenty.
 */
export interface BuildingSpec {
  id: string;
  /** Material-library facade (`facade/*`) the walls take. */
  facade: string;
  /** City-layout zones this cast is drawn in. */
  zones: readonly CityZone[];
}

export const BUILDING_SPECS: readonly BuildingSpec[] = [
  { id: "bld_glass_curtain", facade: "facade/glass-curtain", zones: ["core"] },
  { id: "bld_brick_grey", facade: "facade/brick-grey", zones: ["core", "commercial", "industrial"] },
  { id: "bld_brick_red", facade: "facade/brick-red", zones: ["commercial", "residential", "industrial"] },
  { id: "bld_brick_brown", facade: "facade/brick-brown", zones: ["commercial", "residential"] },
];

export const buildingsForZone = (zone: CityZone): readonly BuildingSpec[] =>
  BUILDING_SPECS.filter((spec) => spec.zones.includes(zone));
