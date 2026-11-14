export const STARTING_CASH = 10000;

export const GRID = 4;

export const PARK_HALF = 60;

export const DAY_LENGTH = 150;

/**
 * The haunt's clock runs from noon to noon: the engine's day starts at 12:00, so the living's night
 * (dusk to dawn) sits in the middle of one park day and the day closes (restock, the books, the
 * exorcist) at noon while the park is empty. `clockLabel` turns the engine's day fraction into the
 * time a player reads.
 */
export const CLOCK_OFFSET_HOURS = 12;

/** A new haunt's second 0: late afternoon, a few minutes before the first dusk. */
export const DAY_START = DAY_LENGTH * 0.2;

export const ENTRANCE: readonly [number, number, number] = [0, 0, PARK_HALF - 2];

export const GUEST_CAP_BASE = 40;

export const GUEST_CAP_PER_RATING = 0.4;

/** Dusk (17:45): the living start coming through the gate. */
export const OPEN_FRACTION = 0.24;

/** Dawn (07:10): the last of the living go home. */
export const CLOSE_FRACTION = 0.8;

/** "21:30": the time of night a day fraction reads as on the haunt's clock. */
export function clockLabel(dayFraction: number): string {
  const minutes = Math.floor((((dayFraction * 24 + CLOCK_OFFSET_HOURS) % 24) + 24) % 24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** How many of the living the park holds at once: a base crowd the rumor then grows. */
export function guestCap(rating: number): number {
  return Math.round(GUEST_CAP_BASE + rating * GUEST_CAP_PER_RATING);
}

export function snapToTile(value: number): number {
  return Math.round(value / GRID) * GRID;
}

