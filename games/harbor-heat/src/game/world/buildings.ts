import type { CityZone } from "../../engine-local/city/cityLayout";

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
  /** Wall paint from the art direction's palette; the scan's own colour fades in over it by `scanTint`. */
  paint: string;
  /** How much of the scan's own colour replaces `paint`, 0..1: low keeps the pastel, high shows the brick and windows. */
  scanTint: number;
  /** City-layout zones this cast is drawn in. */
  zones: readonly CityZone[];
}

export const BUILDING_SPECS: readonly BuildingSpec[] = [
  { id: "bld_glass_curtain", facade: "facade/glass-curtain", paint: "#8fd8d0", scanTint: 0.75, zones: ["core"] },
  { id: "bld_glass_peach", facade: "facade/glass-curtain", paint: "#f2c9a8", scanTint: 0.7, zones: ["core"] },
  { id: "bld_brick_peach", facade: "facade/brick-grey", paint: "#f2c9a8", scanTint: 0.6, zones: ["core", "commercial", "industrial"] },
  { id: "bld_brick_mint", facade: "facade/brick-red", paint: "#7fd1c4", scanTint: 0.55, zones: ["commercial", "residential", "industrial"] },
  { id: "bld_brick_cream", facade: "facade/brick-brown", paint: "#f6e3c4", scanTint: 0.55, zones: ["commercial", "residential"] },
  { id: "bld_brick_coral", facade: "facade/brick-red", paint: "#f2a08a", scanTint: 0.6, zones: ["core", "commercial", "residential"] },
];

export const buildingsForZone = (zone: CityZone): readonly BuildingSpec[] =>
  BUILDING_SPECS.filter((spec) => spec.zones.includes(zone));
