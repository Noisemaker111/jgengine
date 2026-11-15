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


/**
 * The light of the hour on the haunt's clock, 0-1 each: the low amber of late afternoon and dusk
 * while the living gather, and the pale grey of dawn and day as they go home. Both 0 in the deep night.
 */
export function hourLight(dayFraction: number): { dusk: number; dawn: number } {
  const f = ((dayFraction % 1) + 1) % 1;
  // Late afternoon into dusk: full until 18:15 (0.26), gone by 20:40 (0.36), so the living arrive in it.
  const dusk = f < 0.26 ? 1 : f < 0.36 ? 1 - (f - 0.26) / 0.1 : 0;
  // Dawn: rises from 05:00 (0.71) to full at 07:10 (0.8), then it is day until the next dusk.
  const dawn = f >= 0.71 && f < 0.8 ? (f - 0.71) / 0.09 : f >= 0.8 ? 1 : 0;
  return { dusk, dawn };
}
