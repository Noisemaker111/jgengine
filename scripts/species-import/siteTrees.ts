import { growthCurveAt, type GrowthCurve } from "../../packages/core/src/plants/species/speciesReference";
import { csvNumber } from "./csv";

const INCH_CM = 2.54;
const FOOT_M = 0.3048;

/** One measured FIA site tree: breast-height age, DBH, height and the site index it gave. */
export interface SiteTree {
  breastHeightAge: number;
  dbhCm: number;
  heightM: number;
  siteIndexFt: number;
}

/** Site trees of one FIA species code from rows of a `<ST>_SITETREE.csv`. */
export function siteTreesOf(rows: readonly Record<string, string>[], spcd: number): SiteTree[] {
  const trees: SiteTree[] = [];
  for (const row of rows) {
    if (csvNumber(row["SPCD"]) !== spcd) continue;
    const age = csvNumber(row["AGEDIA"]);
    const dia = csvNumber(row["DIA"]);
    const ht = csvNumber(row["HT"]);
    const si = csvNumber(row["SITREE"]);
    if (age === undefined || dia === undefined || ht === undefined || si === undefined || age <= 0 || dia <= 0 || ht <= 0) continue;
    trees.push({ breastHeightAge: age, dbhCm: dia * INCH_CM, heightM: ht * FOOT_M, siteIndexFt: si });
  }
  return trees;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  if (sorted.length === 0) return Number.NaN;
  return sorted.length % 2 === 1 ? (sorted[mid] ?? Number.NaN) : 0.5 * ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0));
}


/** Least log-squares Chapman–Richards fit by Nelder–Mead from a start that suits tree size by age. */
export function fitGrowthCurve(points: readonly { age: number; value: number }[]): GrowthCurve {
  const loss = (v: readonly number[]): number => {
    const curve = { a: Math.exp(v[0] ?? 0), k: Math.exp(v[1] ?? 0), p: Math.exp(v[2] ?? 0) };
    let sum = 0;
    for (const point of points) {
      const r = Math.log(Math.max(1e-6, growthCurveAt(curve, point.age)) / point.value);
      sum += r * r;
    }
    return sum;
  };
  const top = Math.max(...points.map((point) => point.value));
  const best = nelderMead(loss, [Math.log(top * 1.5), Math.log(0.02), Math.log(1.2)], 0.5, 2000);
  return { a: Math.exp(best[0] ?? 0), k: Math.exp(best[1] ?? 0), p: Math.exp(best[2] ?? 0) };
}

function nelderMead(f: (v: readonly number[]) => number, start: readonly number[], step: number, iterations: number): number[] {
  const n = start.length;
  let simplex = [start.slice(), ...start.map((_, i) => start.map((x, j) => (i === j ? x + step : x)))];
  let values = simplex.map(f);
  for (let it = 0; it < iterations; it += 1) {
    const order = values.map((_, i) => i).sort((a, b) => (values[a] ?? 0) - (values[b] ?? 0));
    simplex = order.map((i) => simplex[i] ?? []);
    values = order.map((i) => values[i] ?? 0);
    const worst = simplex[n] ?? [];
    const centroid = start.map((_, j) => simplex.slice(0, n).reduce((s, v) => s + (v[j] ?? 0), 0) / n);
    const along = (t: number): number[] => centroid.map((c, j) => c + t * (c - (worst[j] ?? 0)));
    const reflected = along(1);
    const fr = f(reflected);
    if (fr < (values[0] ?? 0)) {
      const expanded = along(2);
      const fe = f(expanded);
      [simplex[n], values[n]] = fe < fr ? [expanded, fe] : [reflected, fr];
    } else if (fr < (values[n - 1] ?? 0)) {
      [simplex[n], values[n]] = [reflected, fr];
    } else {
      const contracted = along(-0.5);
      const fc = f(contracted);
      if (fc < (values[n] ?? 0)) [simplex[n], values[n]] = [contracted, fc];
      else {
        const first = simplex[0] ?? [];
        simplex = simplex.map((v, i) => (i === 0 ? v : v.map((x, j) => (first[j] ?? 0) + 0.5 * (x - (first[j] ?? 0)))));
        values = simplex.map(f);
      }
    }
  }
  const at = values.indexOf(Math.min(...values));
  return simplex[at] ?? start.slice();
}

/** What the site trees of one species say about a stand-grown tree on its median site. */
export interface StandReference {
  /** Median site index of the trees used, feet at 50 years. */
  siteIndexFt: number;
  /** Trees within ±10 ft of that site index. */
  trees: number;
  /** Total ages they cover: the 5th percentile and the oldest. */
  youngestYears: number;
  oldestYears: number;
  height: GrowthCurve;
  dbh: GrowthCurve;
  /** DBH = a·(H − 1.3)^b over the same trees, least squares in log space. */
  dbhByHeight: { a: number; b: number };
}

function heightDiameter(trees: readonly SiteTree[]): { a: number; b: number } {
  const points = trees.filter((tree) => tree.heightM > 1.5).map((tree) => ({ x: Math.log(tree.heightM - 1.3), y: Math.log(tree.dbhCm) }));
  const n = Math.max(1, points.length);
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  const sxx = points.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  const b = sxx > 0 ? points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx : 1;
  return { a: Math.exp(my - b * mx), b };
}

/**
 * Height and DBH curves by total age from site trees on the species' median site: breast-height age
 * plus `yearsToBreastHeight`, fitted with Chapman–Richards. Centred on `siteIndex` when given.
 */
export function standReference(trees: readonly SiteTree[], yearsToBreastHeight: number, siteIndex?: number): StandReference {
  const siteIndexFt = siteIndex ?? median(trees.map((tree) => tree.siteIndexFt));
  const band = trees.filter((tree) => Math.abs(tree.siteIndexFt - siteIndexFt) <= 10);
  const age = (tree: SiteTree): number => tree.breastHeightAge + yearsToBreastHeight;
  const ages = band.map(age).sort((a, b) => a - b);
  return {
    siteIndexFt,
    trees: band.length,
    youngestYears: ages[Math.floor(0.05 * (ages.length - 1))] ?? 0,
    oldestYears: ages[ages.length - 1] ?? 0,
    height: fitGrowthCurve(band.map((tree) => ({ age: age(tree), value: tree.heightM }))),
    dbh: fitGrowthCurve(band.map((tree) => ({ age: age(tree), value: tree.dbhCm }))),
    dbhByHeight: heightDiameter(band),
  };
}
