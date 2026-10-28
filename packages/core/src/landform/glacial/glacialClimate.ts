// @skill jgengine-world
/**
 * Glacial climate: the snowline (equilibrium line altitude, ELA) through the glacial cycles of the
 * last 800 kyr, read off the LR04 stack of 57 benthic δ¹⁸O records (Lisiecki & Raymo 2005,
 * PANGAEA doi:10.1594/PANGAEA.701576, CC BY 3.0). Benthic δ¹⁸O tracks global ice volume and deep-sea
 * temperature, so the snowline is scaled linearly between today's and the Last Glacial Maximum's by
 * δ¹⁸O, as Pedersen & Egholm (2013) scale mountain climate with the same record.
 *
 * @capability landform-glacial glaciers that flow, slide, carve their valleys wider and deeper and lay moraines
 */

/** A δ¹⁸O record: ages in ka before present, ascending, and δ¹⁸O in ‰ at each. */
export interface Delta18ORecord {
  readonly ageKa: readonly number[];
  readonly delta18O: readonly number[];
}

// LR04 benthic δ¹⁸O in ‰, every 1 kyr from 0 to 600 ka, then every 2 kyr to 800 ka.
const LR04_VALUES = [
  "3.23 3.23 3.18 3.29 3.3 3.26 3.33 3.37 3.42 3.38 3.52 3.6 3.92 4.06 4.28 4.49 4.75 4.88 5.02 4.96",
  "4.99 4.91 4.88 4.86 4.81 4.82 4.67 4.75 4.75 4.73 4.62 4.62 4.6 4.58 4.59 4.54 4.45 4.46 4.41 4.55",
  "4.55 4.51 4.5 4.46 4.48 4.33 4.36 4.38 4.45 4.46 4.34 4.33 4.31 4.44 4.38 4.31 4.35 4.43 4.49 4.43",
  "4.6 4.51 4.6 4.53 4.36 4.48 4.57 4.44 4.42 4.47 4.32 4.22 4.21 4.23 4.03 3.95 4.06 4.08 4.05 4.05",
  "3.9 3.82 3.8 3.83 3.82 3.95 4.06 4.18 4.11 4.08 4.06 4.03 3.98 3.9 3.84 3.77 3.75 3.83 3.9 3.78 3.81",
  "3.92 3.86 3.88 3.92 3.85 4 4.04 4.11 4.12 4.04 4.02 4.03 3.93 3.81 3.71 3.58 3.54 3.44 3.3 3.27 3.26",
  "3.18 3.1 3.27 3.14 3.16 3.37 3.71 3.9 3.67 3.81 4.2 4.41 4.7 4.86 4.82 4.8 4.89 4.87 4.98 4.81 4.75",
  "4.78 4.82 4.74 4.77 4.82 4.71 4.75 4.75 4.66 4.64 4.62 4.66 4.51 4.78 4.74 4.69 4.66 4.69 4.65 4.66",
  "4.7 4.68 4.68 4.48 4.41 4.48 4.5 4.5 4.53 4.46 4.38 4.28 4.32 4.39 4.46 4.44 4.48 4.39 4.46 4.48",
  "4.37 4.4 4.59 4.47 4.4 4.46 4.39 4.28 4.13 3.76 3.92 3.84 3.91 3.82 3.74 3.82 3.57 3.53 3.53 3.63",
  "3.61 3.78 3.82 3.77 3.78 3.71 3.64 3.57 3.6 3.61 3.65 3.56 3.54 3.53 3.48 3.72 3.94 3.98 4.23 4.38",
  "4.44 4.39 4.28 4.29 4.19 4.19 4.02 4.3 4.22 4.17 3.97 3.84 3.71 3.66 3.47 3.51 3.44 3.44 3.54 3.68",
  "3.78 4.05 4.17 4.38 4.31 4.38 4.36 4.5 4.58 4.63 4.52 4.57 4.37 4.43 4.55 4.51 4.52 4.46 4.52 4.45",
  "4.46 4.42 4.44 4.5 4.5 4.33 4.52 4.51 4.5 4.44 4.44 4.38 4.38 4.3 4.44 4.31 4.23 4.14 4.21 3.98 3.87",
  "3.86 3.84 3.82 3.89 4.02 4.06 4.1 4.11 4.27 4.22 4.33 4.31 4.23 4.3 4.17 4.23 4.02 4.06 4.06 4 4.07",
  "4.07 4.05 4 3.85 3.86 3.8 3.7 3.79 3.69 3.77 3.62 3.69 3.89 3.76 3.58 3.66 3.53 3.53 3.47 3.21 3.31",
  "3.23 3.22 3.23 3.19 3.3 3.29 3.39 3.38 3.51 3.75 4.08 4.23 4.17 4.42 4.6 4.84 4.83 4.8 4.76 4.79",
  "4.68 4.53 4.49 4.62 4.67 4.64 4.47 4.47 4.4 4.59 4.46 4.55 4.58 4.49 4.54 4.5 4.5 4.53 4.36 4.46",
  "4.32 4.37 4.4 4.38 4.36 4.27 4.42 4.29 4.34 4.2 4.21 4.2 4.19 4.17 4.19 4.15 4.05 4.12 4.08 4.14",
  "4.02 3.99 3.92 3.89 3.96 4 3.97 3.86 3.92 3.76 3.72 3.47 3.54 3.48 3.32 3.2 3.17 3.15 3.2 3.11 3.19",
  "3.21 3.17 3.22 3.15 3.29 3.31 3.38 3.41 3.41 3.51 3.57 3.75 3.81 3.77 3.85 3.94 4.02 3.92 4.3 4.5",
  "4.3 4.72 4.91 4.98 5.05 5.05 5.08 5.08 5.02 5.07 4.9 4.79 4.87 4.76 4.95 4.96 4.91 4.82 4.91 4.82",
  "4.51 4.77 4.73 4.75 4.58 4.73 4.56 4.6 4.41 4.62 4.63 4.55 4.63 4.56 4.59 4.61 4.61 4.44 4.57 4.46",
  "4.44 4.38 4.51 4.33 4.25 4.32 4.36 4.39 4.35 4.3 4.27 4.22 4.12 4.12 4.17 4.01 3.97 3.79 3.81 3.76",
  "3.72 3.67 3.6 3.54 3.47 3.63 3.72 3.83 3.83 3.83 3.68 3.82 3.75 3.84 3.78 3.75 3.81 3.91 3.86 4.01",
  "3.93 4.16 4.06 4.14 4.06 4.22 4.25 4.1 4.1 4.01 3.96 4.07 3.96 3.95 3.91 3.88 3.93 3.83 3.92 3.97",
  "3.96 3.92 3.99 3.97 3.92 4.01 4.11 4.27 4.29 4.55 4.43 4.54 4.48 4.53 4.5 4.45 4.45 4.46 4.43 4.51",
  "4.53 4.55 4.53 4.5 4.45 4.52 4.46 4.29 4.25 4.39 4.35 4.25 4.17 4.14 4.21 4.14 4.17 4.01 3.96 3.86",
  "3.94 4 3.97 3.91 3.89 3.59 3.65 3.73 3.39 3.46 3.48 3.5 3.57 3.69 4 4.13 4.29 4.31 4.33 4.18 4.11",
  "4.19 4.07 4.09 4.07 4.02 3.99 3.9 3.88 3.89 3.8 3.99 4.02 4.07 3.97 3.77 3.8 3.8 3.49 3.52 3.53 3.66",
  "3.81 4.09 4.31 4.63 4.9 5.01 5.08 5.05 4.93 5 4.8 5.01 4.75 4.68 4.72 4.75 4.71 4.79 4.77 4.57 4.58",
  "4.64 4.8 4.58 4.5 4.65 4.42 4.52 4.46 4.4 4.26 4.14 4.15 4.03 4.13 3.95 3.7 3.71 3.64 3.5 3.57 3.65",
  "3.76 3.84 3.93 4.03 3.98 4.06 4.29 4.61 4.75 4.66 4.65 4.44 4.32 4.16 4.16 4.02 4.15 4.19 4.21 4.11",
  "4.17 4.48 4.67 4.59 4.6 4.48 4.55 4.59 4.26 4.33 4.11 4.28 4.11 4.07 3.99 3.87 3.76 3.64 3.56 3.48",
  "3.54 3.55 3.68 3.7 4.16 4.27 4.74 4.67 4.68 4.68",
].join(" ");

function lr04(): Delta18ORecord {
  const delta18O = LR04_VALUES.split(" ").map(Number);
  const ageKa = delta18O.map((_, k) => (k <= 600 ? k : 600 + 2 * (k - 600)));
  return { ageKa, delta18O };
}

/**
 * The LR04 benthic δ¹⁸O stack (Lisiecki & Raymo 2005), 0 to 800 ka.
 * @capability landform-glacial glaciers that flow, slide, carve their valleys wider and deeper and lay moraines
 */
export const LR04_STACK: Delta18ORecord = lr04();

/** A snowline through time: [model year, ELA in metres] points, years ascending. */
export type SnowlineHistory = readonly (readonly [number, number])[];

/** Options for {@link snowlineHistory}. */
export interface SnowlineHistoryOptions {
  /** Today's ELA in metres. */
  presentEla: number;
  /** The ELA at the Last Glacial Maximum, 18 ka, in metres. */
  glacialEla: number;
  /** Age in ka that model year 0 stands for. Default 800, the oldest of the record. */
  startKa?: number;
  /** Age in ka where the history ends. Default 0, today. */
  endKa?: number;
  /** The δ¹⁸O record. Default {@link LR04_STACK}. */
  record?: Delta18ORecord;
}

function recordAt(record: Delta18ORecord, ageKa: number): number {
  const { ageKa: ages, delta18O } = record;
  const last = ages.length - 1;
  if (last < 0) throw new Error("a δ18O record needs at least one point");
  if (ageKa <= (ages[0] ?? 0)) return delta18O[0] ?? 0;
  if (ageKa >= (ages[last] ?? 0)) return delta18O[last] ?? 0;
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((ages[mid] ?? 0) <= ageKa) lo = mid;
    else hi = mid;
  }
  const a = ages[lo] ?? 0;
  const b = ages[hi] ?? 0;
  const share = b > a ? (ageKa - a) / (b - a) : 0;
  return (delta18O[lo] ?? 0) + share * ((delta18O[hi] ?? 0) - (delta18O[lo] ?? 0));
}

/**
 * The snowline from `startKa` to `endKa`, one point per record point, scaled linearly by δ¹⁸O so it
 * stands at `presentEla` at today's δ¹⁸O and at `glacialEla` at 18 ka's.
 * @capability landform-glacial glaciers that flow, slide, carve their valleys wider and deeper and lay moraines
 */
export function snowlineHistory(options: SnowlineHistoryOptions): [number, number][] {
  const record = options.record ?? LR04_STACK;
  const startKa = options.startKa ?? 800;
  const endKa = options.endKa ?? 0;
  if (!(startKa > endKa)) throw new Error(`a snowline history runs from an older startKa to a younger endKa, got ${startKa} to ${endKa}`);
  const today = recordAt(record, 0);
  const glacial = recordAt(record, 18);
  if (glacial === today) throw new Error("the δ18O record has the same value today and at 18 ka");
  const scale = (options.glacialEla - options.presentEla) / (glacial - today);
  const ela = (ageKa: number): number => options.presentEla + scale * (recordAt(record, ageKa) - today);
  const points: [number, number][] = [[0, ela(startKa)]];
  const ages = record.ageKa;
  for (let k = ages.length - 1; k >= 0; k -= 1) {
    const age = ages[k] ?? 0;
    if (age < startKa && age > endKa) points.push([(startKa - age) * 1000, ela(age)]);
  }
  points.push([(startKa - endKa) * 1000, ela(endKa)]);
  return points;
}

/**
 * The ELA of a snowline history at a model year, linear between points and level past either end.
 * @capability landform-glacial glaciers that flow, slide, carve their valleys wider and deeper and lay moraines
 */
export function snowlineAt(history: SnowlineHistory, year: number): number {
  const last = history.length - 1;
  const first = history[0];
  const end = history[last];
  if (first === undefined || end === undefined) throw new Error("a snowline history needs at least one point");
  if (year <= first[0]) return first[1];
  if (year >= end[0]) return end[1];
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((history[mid]?.[0] ?? 0) <= year) lo = mid;
    else hi = mid;
  }
  const [a, ea] = history[lo] ?? first;
  const [b, eb] = history[hi] ?? end;
  return b > a ? ea + ((year - a) / (b - a)) * (eb - ea) : ea;
}
