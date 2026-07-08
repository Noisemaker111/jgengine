export const WEEKS = 53;
export const DAYS = 7;
export const CELL_COUNT = WEEKS * DAYS;

export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const ANCHOR = Date.UTC(2024, 0, 7);

/** One day of a contribution calendar, positioned on a week×weekday grid. */
export interface DayCell {
  index: number;
  week: number;
  weekday: number;
  count: number;
  level: number;
  label: string;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** GitHub's quartile bucketing of a day's contribution count (0 = none … 4 = most). */
export function levelForCount(count: number): number {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

export function dateOf(index: number): Date {
  return new Date(ANCHOR + index * 86400000);
}

export function dateLabel(index: number): string {
  return labelFromISO(dateOf(index).toISOString().slice(0, 10));
}

export function labelFromISO(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAY_NAMES[d.getUTCDay()]}, ${MONTH_NAMES[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Deterministic plausible contribution year for demos / offline fallback. */
export function generateYear(seed: number): DayCell[] {
  const rng = mulberry32(seed);
  const seasonPhase = rng() * Math.PI * 2;
  const cells: DayCell[] = [];
  let streakHeat = 0;

  for (let week = 0; week < WEEKS; week += 1) {
    const season = 0.5 + 0.5 * Math.sin(seasonPhase + (week / WEEKS) * Math.PI * 2);
    streakHeat = rng() < 0.16 ? 1.6 + rng() * 2.2 : streakHeat * 0.72;

    for (let weekday = 0; weekday < DAYS; weekday += 1) {
      const index = week * DAYS + weekday;
      const weekendDrag = weekday === 0 || weekday === 6 ? 0.35 : 1;
      const base = season * 5 * weekendDrag + streakHeat * weekendDrag;
      const jitter = rng() * rng() * 6;
      const idle = rng() < 0.28 - season * 0.14 ? 0 : 1;
      const count = Math.max(0, Math.round((base + jitter) * idle));

      cells.push({ index, week, weekday, count, level: levelForCount(count), label: dateLabel(index) });
    }
  }
  return cells;
}
