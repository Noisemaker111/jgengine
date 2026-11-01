/**
 * Holds the runtime `windField` at strength 1 to the EN 1991-1-4 reference: the mean speed at each height (log law), the
 * gust standard deviation (I_v · U), and the variance a 10-second average keeps (the spectrum's shape), per surface class.
 * Every row is measured by sampling the field over four hours of simulated time, not read off its parameters.
 */
import { windField, type WindField } from "@jgengine/core/world/wind";
import type { WindSurfaceClass } from "@jgengine/core/world/windEffects";

import { EN1991_TERRAIN, logLawRatio, turbulenceIntensity, windowedShare } from "./windProfile";

/** One compared quantity: what the field did, what the reference says, and whether the gap is within tolerance. */
export interface WindComparisonRow {
  label: string;
  field: number;
  reference: number;
  /** |field / reference − 1|. */
  gap: number;
  pass: boolean;
}

/** Options for {@link compareWind}. */
export interface WindComparisonOptions {
  /** Mean speed at 10 m, m/s. Default 10. */
  speed?: number;
  heights?: readonly number[];
  classes?: readonly WindSurfaceClass[];
  /** Largest relative gap that passes. Default 0.1. */
  tolerance?: number;
  /** Build the field for a class; default every effect at strength 1. */
  build?: (surface: WindSurfaceClass, speed: number) => WindField;
}

const DURATION = 4 * 3600;
const DT = 0.25;
const WINDOW = 10;

/** Sample the field at one height and return mean, gust σ and the 10 s-window variance share. */
export function measureWind(field: WindField, heightM: number): { mean: number; sigma: number; windowed: number } {
  const n = Math.floor(DURATION / DT);
  const u = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const [x, z] = field.atHeight(0, 0, heightM, i * DT);
    u[i] = x * field.direction[0] + z * field.direction[1];
    sum += u[i] ?? 0;
  }
  const mean = sum / n;
  let variance = 0;
  for (let i = 0; i < n; i += 1) variance += ((u[i] ?? 0) - mean) ** 2;
  variance /= n;
  const per = Math.round(WINDOW / DT);
  const blocks = Math.floor(n / per);
  let blockVariance = 0;
  for (let b = 0; b < blocks; b += 1) {
    let s = 0;
    for (let k = 0; k < per; k += 1) s += u[b * per + k] ?? 0;
    blockVariance += (s / per - mean) ** 2;
  }
  blockVariance /= blocks;
  return { mean, sigma: Math.sqrt(variance), windowed: variance > 0 ? blockVariance / variance : 0 };
}

function row(label: string, field: number, reference: number, tolerance: number): WindComparisonRow {
  const gap = Math.abs(field / reference - 1);
  return { label, field, reference, gap, pass: gap <= tolerance };
}

/** Compare a field per surface class and height against the reference. */
export function compareWind(options: WindComparisonOptions = {}): WindComparisonRow[] {
  const speed = options.speed ?? 10;
  const tolerance = options.tolerance ?? 0.1;
  const heights = options.heights ?? [2, 5, 10, 25, 50, 100];
  const classes = options.classes ?? (["openWater", "grass", "forest", "city"] as const);
  const build = options.build ?? ((surface, mean) => windField({ direction: [1, 0], speed: mean, seed: `compare-${surface}`, effects: { surface, profile: {}, gusts: {} } }));
  const rows: WindComparisonRow[] = [];
  for (const surface of classes) {
    const category = EN1991_TERRAIN[surface];
    const field = build(surface, speed);
    for (const z of heights) {
      const measured = measureWind(field, z);
      const mean = speed * logLawRatio(category, z);
      rows.push(row(`${surface} mean speed at ${z} m`, measured.mean, mean, tolerance));
      rows.push(row(`${surface} gust sigma at ${z} m`, measured.sigma, turbulenceIntensity(category, z) * mean, tolerance));
      rows.push(row(`${surface} 10 s-average variance share at ${z} m`, measured.windowed, windowedShare(category, z, mean, WINDOW), tolerance));
    }
  }
  return rows;
}

/** The comparison as a printable table. */
export function formatWindComparison(rows: readonly WindComparisonRow[]): string {
  return rows.map((r) => `${r.pass ? "ok  " : "FAIL"} ${r.label.padEnd(48)} field ${r.field.toFixed(3).padStart(8)}  ref ${r.reference.toFixed(3).padStart(8)}  gap ${(100 * r.gap).toFixed(1)}%`).join("\n");
}

if (import.meta.main) console.log(formatWindComparison(compareWind()));
