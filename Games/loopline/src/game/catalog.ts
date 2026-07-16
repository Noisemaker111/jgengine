export const CASH = "cash";

export const STARTING_CASH = 6000;

export const GRID = 4;

export const PARK_HALF = 60;

export const DAY_LENGTH = 150;

export const ENTRANCE: readonly [number, number, number] = [0, 0, PARK_HALF - 2];

export const GUEST_CAP_BASE = 60;

export const GUEST_CAP_PER_RATING = 0.6;

export const OPEN_FRACTION = 0.24;

export const CLOSE_FRACTION = 0.92;

export interface Milestone {
  rating: number;
  unlock: string;
  label: string;
}

export const MILESTONES: readonly Milestone[] = [
  { rating: 60, unlock: "tier_flowers", label: "Flower beds & lamps" },
  { rating: 120, unlock: "tier_fountain", label: "Fountain & drink stall" },
  { rating: 220, unlock: "tier_ferris", label: "Ferris wheel & souvenirs" },
  { rating: 360, unlock: "tier_janitor", label: "Janitor post" },
  { rating: 540, unlock: "tier_dropzone", label: "Drop tower" },
  { rating: 760, unlock: "tier_gardens", label: "Grand gardens" },
];

export function guestCap(rating: number): number {
  return Math.round(GUEST_CAP_BASE + rating * GUEST_CAP_PER_RATING);
}

export function snapToGrid(value: number): number {
  return Math.round(value / GRID) * GRID;
}

export function withinPark(x: number, z: number): boolean {
  return Math.abs(x) <= PARK_HALF - GRID && Math.abs(z) <= PARK_HALF - GRID;
}
