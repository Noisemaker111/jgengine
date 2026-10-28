import { csvNumber } from "./csv";

/** A DBH class of measured trees: its middle and the 10th, 50th and 90th percentile crown width. */
export interface CrownWidthClassRow {
  dbhCm: number;
  p10M: number;
  p50M: number;
  p90M: number;
}

/** DBH class edges, cm. */
const EDGES = [5, 10, 15, 20, 30, 40, 50, 65, 80, 100, 130] as const;
const MIN_TREES = 10;

function quantile(sorted: readonly number[], q: number): number {
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const below = sorted[lo] ?? 0;
  return below + ((sorted[Math.min(sorted.length - 1, lo + 1)] ?? below) - below) * (at - lo);
}

const round1 = (x: number): number => Math.round(x * 10) / 10;

/**
 * Crown width percentiles by DBH class of every Tallo record of `scientific` ("Genus species") with DBH
 * and crown radius; classes with fewer than 10 trees are left out.
 */
export function talloCrownWidthClasses(rows: readonly Record<string, string>[], scientific: string): { trees: number; classes: CrownWidthClassRow[] } {
  const widths: { dbh: number; cw: number }[] = [];
  for (const row of rows) {
    if (row["species"] !== scientific) continue;
    const dbh = csvNumber(row["stem_diameter_cm"]);
    const radius = csvNumber(row["crown_radius_m"]);
    if (dbh === undefined || radius === undefined || dbh <= 0 || radius <= 0) continue;
    widths.push({ dbh, cw: 2 * radius });
  }
  const classes: CrownWidthClassRow[] = [];
  for (let i = 0; i + 1 < EDGES.length; i += 1) {
    const lo = EDGES[i] ?? 0;
    const hi = EDGES[i + 1] ?? 0;
    const inClass = widths.filter((w) => w.dbh >= lo && w.dbh < hi).map((w) => w.cw).sort((a, b) => a - b);
    if (inClass.length < MIN_TREES) continue;
    classes.push({ dbhCm: (lo + hi) / 2, p10M: round1(quantile(inClass, 0.1)), p50M: round1(quantile(inClass, 0.5)), p90M: round1(quantile(inClass, 0.9)) });
  }
  return { trees: widths.length, classes };
}

