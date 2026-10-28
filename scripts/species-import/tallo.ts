import { csvNumber } from "./csv";

/** A DBH class of measured trees: its middle and the 10th, 50th and 90th percentile crown width. */
export interface CrownWidthClassRow {
  dbhCm: number;
  p10M: number;
  p50M: number;
  p90M: number;
  genus?: true;
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

function widthsOf(rows: readonly Record<string, string>[], match: (row: Record<string, string>) => boolean): { dbh: number; cw: number }[] {
  const widths: { dbh: number; cw: number }[] = [];
  for (const row of rows) {
    if (!match(row)) continue;
    const dbh = csvNumber(row["stem_diameter_cm"]);
    const radius = csvNumber(row["crown_radius_m"]);
    if (dbh === undefined || radius === undefined || dbh <= 0 || radius <= 0) continue;
    widths.push({ dbh, cw: 2 * radius });
  }
  return widths;
}

function inClass(widths: readonly { dbh: number; cw: number }[], lo: number, hi: number): number[] {
  return widths.filter((w) => w.dbh >= lo && w.dbh < hi).map((w) => w.cw).sort((a, b) => a - b);
}

/**
 * Crown width percentiles by DBH class of every Tallo record of `scientific` ("Genus species") with DBH
 * and crown radius. A class with fewer than 10 trees of the species takes its genus's trees instead,
 * flagged `genus`, when the genus has 10; otherwise it is left out.
 */
export function talloCrownWidthClasses(rows: readonly Record<string, string>[], scientific: string): { trees: number; classes: CrownWidthClassRow[] } {
  const widths = widthsOf(rows, (row) => row["species"] === scientific);
  const genusName = scientific.split(" ")[0] ?? "";
  let genus: { dbh: number; cw: number }[] | undefined;
  const classes: CrownWidthClassRow[] = [];
  for (let i = 0; i + 1 < EDGES.length; i += 1) {
    const lo = EDGES[i] ?? 0;
    const hi = EDGES[i + 1] ?? 0;
    const own = inClass(widths, lo, hi);
    const row = (sorted: readonly number[]): CrownWidthClassRow => ({ dbhCm: (lo + hi) / 2, p10M: round1(quantile(sorted, 0.1)), p50M: round1(quantile(sorted, 0.5)), p90M: round1(quantile(sorted, 0.9)) });
    if (own.length >= MIN_TREES) {
      classes.push(row(own));
      continue;
    }
    genus ??= widthsOf(rows, (r) => r["genus"] === genusName);
    const pooled = inClass(genus, lo, hi);
    if (pooled.length >= MIN_TREES) classes.push({ ...row(pooled), genus: true });
  }
  return { trees: widths.length, classes };
}

