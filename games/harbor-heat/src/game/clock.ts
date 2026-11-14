/**
 * The one day length every system reads. A shift runs dusk to midnight, 18:00 to 24:00, which is six
 * real minutes at this length; the tide, the residents' routines, the away catch-up and the capture
 * states all measure the day with this number instead of keeping their own copy.
 */
export const DAY_SECONDS = 1440;

/** Game-clock seconds into the day at which `hour` (0–24, fractional) falls. */
export function secondsAtHour(hour: number): number {
  return (hour / 24) * DAY_SECONDS;
}
