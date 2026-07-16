import { CELL_COUNT, DAYS, MONTH_NAMES, WEEKDAY_NAMES, dateOf, type DayCell } from "./calendar";

export interface ContributionStats {
  total: number;
  activeDays: number;
  activeDaysPct: number;
  avgPerActiveDay: number;
  avgPerWeek: number;
  currentStreak: number;
  longestStreak: number;
  peakDay: { count: number; label: string };
  busiestWeekday: { name: string; total: number };
  mostActiveMonth: { label: string; total: number };
  last30Days: number;
}

function monthKey(index: number): string {
  const d = dateOf(index);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Roll a contribution calendar into headline stats (totals, streaks, peaks, cadence).
 * @internal
 */
export function summarize(cells: readonly DayCell[]): ContributionStats {
  const weekdayTotals = new Array<number>(DAYS).fill(0);
  const monthTotals = new Map<string, number>();

  if (cells.length === 0) {
    return {
      total: 0,
      activeDays: 0,
      activeDaysPct: 0,
      avgPerActiveDay: 0,
      avgPerWeek: 0,
      currentStreak: 0,
      longestStreak: 0,
      peakDay: { count: 0, label: "" },
      busiestWeekday: { name: WEEKDAY_NAMES[0]!, total: 0 },
      mostActiveMonth: { label: "", total: 0 },
      last30Days: 0,
    };
  }

  let total = 0;
  let activeDays = 0;
  let longestStreak = 0;
  let running = 0;
  let peak: DayCell = cells[0]!;

  for (const cell of cells) {
    total += cell.count;
    if (cell.count > 0) {
      activeDays += 1;
      running += 1;
      if (running > longestStreak) longestStreak = running;
    } else {
      running = 0;
    }
    if (cell.count > peak.count) peak = cell;
    weekdayTotals[cell.weekday]! += cell.count;
    const mk = monthKey(cell.index);
    monthTotals.set(mk, (monthTotals.get(mk) ?? 0) + cell.count);
  }

  let currentStreak = 0;
  for (let i = cells.length - 1; i >= 0 && cells[i]!.count > 0; i -= 1) currentStreak += 1;

  let busiestWeekday = 0;
  for (let d = 1; d < DAYS; d += 1) {
    if (weekdayTotals[d]! > weekdayTotals[busiestWeekday]!) busiestWeekday = d;
  }

  let topMonth = "";
  let topMonthTotal = -1;
  for (const [key, value] of monthTotals) {
    if (value > topMonthTotal) {
      topMonthTotal = value;
      topMonth = key;
    }
  }

  const last30 = cells.slice(-30).reduce((sum, cell) => sum + cell.count, 0);
  const weeks = CELL_COUNT / DAYS;

  return {
    total,
    activeDays,
    activeDaysPct: Math.round((activeDays / cells.length) * 100),
    avgPerActiveDay: activeDays === 0 ? 0 : Math.round((total / activeDays) * 10) / 10,
    avgPerWeek: Math.round((total / weeks) * 10) / 10,
    currentStreak,
    longestStreak,
    peakDay: { count: peak.count, label: peak.label },
    busiestWeekday: { name: WEEKDAY_NAMES[busiestWeekday]!, total: weekdayTotals[busiestWeekday]! },
    mostActiveMonth: { label: topMonth, total: Math.max(0, topMonthTotal) },
    last30Days: last30,
  };
}
