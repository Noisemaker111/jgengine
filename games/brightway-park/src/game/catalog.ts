export const STARTING_CASH = 10000;

export const GRID = 4;

export const PARK_HALF = 60;

export const DAY_LENGTH = 150;

export const ENTRANCE: readonly [number, number, number] = [0, 0, PARK_HALF - 2];

export const GUEST_CAP_BASE = 40;

export const GUEST_CAP_PER_RATING = 0.4;

export const OPEN_FRACTION = 0.24;

export const CLOSE_FRACTION = 0.92;

/** What a guest cap looks like: a base crowd the rating then grows. */
export function guestCap(rating: number): number {
  return Math.round(GUEST_CAP_BASE + rating * GUEST_CAP_PER_RATING);
}

export function snapToGrid(value: number): number {
  return Math.round(value / GRID) * GRID;
}

