export const DAY_LENGTH = 600;

const YEAR_DAYS = 360;

export const YEAR_SECONDS = YEAR_DAYS * DAY_LENGTH;

const SEASONS = ["Spring", "Summer", "Autumn", "Winter"] as const;

export function yearOf(day: number): number {
  return Math.floor(day / YEAR_DAYS) + 1;
}

export function dayOfYear(day: number): number {
  return ((day % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS;
}

export function seasonOf(day: number): (typeof SEASONS)[number] {
  const index = Math.floor((dayOfYear(day) / YEAR_DAYS) * SEASONS.length);
  return SEASONS[index] ?? SEASONS[0];
}

export function dateLabel(day: number): string {
  return `Year ${yearOf(day)}, day ${dayOfYear(day) + 1}`;
}
