export interface BuildingZone {
  readonly id: string;
  readonly position: readonly [number, number];
  readonly footprint: { readonly w: number; readonly d: number };
  readonly count: number;
  readonly stories: readonly [number, number];
  readonly roofHeight: number;
  readonly seed: string;
}

export const BUILDING_ZONES: readonly BuildingZone[] = [
  { id: "a-north", position: [95, -30], footprint: { w: 15, d: 15 }, count: 12, stories: [5, 11], roofHeight: 38, seed: "turbine-city-a-north" },
  { id: "a-south", position: [-70, -170], footprint: { w: 14, d: 14 }, count: 11, stories: [4, 9], roofHeight: 32, seed: "turbine-city-a-south" },
  { id: "b-east", position: [-125, -195], footprint: { w: 14, d: 14 }, count: 12, stories: [5, 10], roofHeight: 35, seed: "turbine-city-b-east" },
  { id: "b-west", position: [-235, -5], footprint: { w: 15, d: 15 }, count: 13, stories: [6, 12], roofHeight: 42, seed: "turbine-city-b-west" },
  { id: "c-ridge", position: [-40, 178], footprint: { w: 14, d: 14 }, count: 11, stories: [4, 9], roofHeight: 32, seed: "turbine-city-c-ridge" },
  { id: "central", position: [135, -45], footprint: { w: 15, d: 15 }, count: 10, stories: [3, 8], roofHeight: 28, seed: "turbine-city-central" },
];
