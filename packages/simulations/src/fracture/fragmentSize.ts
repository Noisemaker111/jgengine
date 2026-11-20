// @skill jgengine-world
/**
 * How rock breaks by size: the laws comminution measures fragments with. Rosin & Rammler (1933) and
 * Gaudin (1926) / Schuhmann (1940) give the size distribution of one breakage, the JKMRC t10 law
 * (Napier-Munn et al. 1996) gives how fine it gets with specific energy, and Vogel & Peukert (2003)
 * give the chance a particle breaks at all.
 *
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */

/** Fragments of one breakage: a size (m) and a mass (kg) per fragment. */
export interface FragmentSizes {
  sizes: readonly number[];
  masses: readonly number[];
}

/** A least-squares fit and its coefficient of determination. */
export interface SizeFit {
  r2: number;
  /** Points the fit used. */
  points: number;
}

/** Rosin–Rammler: passing P(x) = 1 − exp(−(x/scale)^spread); `scale` is the 63.2% passing size. */
export interface RosinRammlerFit extends SizeFit {
  scale: number;
  spread: number;
}

/** Gaudin–Schuhmann: passing P(x) = (x/maxSize)^exponent in the fines. */
export interface GaudinSchuhmannFit extends SizeFit {
  maxSize: number;
  exponent: number;
}

/** JKMRC drop-weight law: t10 = A (1 − e^(−b E_cs)), t10 in percent, E_cs in kWh/t. */
export interface T10Fit extends SizeFit {
  a: number;
  b: number;
}

/** 1 kWh/t in J/kg. */
export const KWH_PER_TONNE = 3600;

/**
 * Mass fraction of fragments smaller than `size`.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function passingFraction(fragments: FragmentSizes, size: number): number {
  let total = 0;
  let passing = 0;
  for (const [i, m] of fragments.masses.entries()) {
    total += m;
    if ((fragments.sizes[i] ?? 0) < size) passing += m;
  }
  return total > 0 ? passing / total : 0;
}

/**
 * t10, percent: the mass passing a tenth of the parent size, the JKMRC fineness index.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function t10(fragments: FragmentSizes, parentSize: number): number {
  return 100 * passingFraction(fragments, parentSize / 10);
}

/**
 * Rosin–Rammler passing fraction at `size`.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function rosinRammler(size: number, scale: number, spread: number): number {
  return size <= 0 ? 0 : 1 - Math.exp(-((size / scale) ** spread));
}

/**
 * Gaudin–Schuhmann passing fraction at `size`, capped at 1.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function gaudinSchuhmann(size: number, maxSize: number, exponent: number): number {
  return size <= 0 ? 0 : Math.min(1, (size / maxSize) ** exponent);
}

/**
 * The JKMRC t10, percent, at specific energy `energy` kWh/t.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function jkT10(energy: number, a: number, b: number): number {
  return a * (1 - Math.exp(-b * Math.max(0, energy)));
}

/**
 * Vogel & Peukert (2003) breakage probability after `impacts` impacts at mass-specific energy `energy` J/kg on a
 * particle of `size` m: 1 − exp(−f_Mat x k (W − W_min)); `fMat` in kg/(J m), `threshold` W_min in J/kg.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function breakageProbability(energy: number, size: number, fMat: number, threshold: number, impacts = 1): number {
  const excess = energy - threshold;
  return excess <= 0 ? 0 : 1 - Math.exp(-fMat * size * impacts * excess);
}

/** Cumulative passing points (size, fraction below or at it), ascending, one per distinct size. */
function passingCurve(fragments: FragmentSizes): { sizes: number[]; passing: number[] } {
  const order = fragments.sizes.map((_, i) => i).sort((a, b) => (fragments.sizes[a] ?? 0) - (fragments.sizes[b] ?? 0));
  let total = 0;
  for (const m of fragments.masses) total += m;
  const sizes: number[] = [];
  const passing: number[] = [];
  let sum = 0;
  for (const i of order) {
    sum += fragments.masses[i] ?? 0;
    const x = fragments.sizes[i] ?? 0;
    if (sizes.length > 0 && sizes[sizes.length - 1] === x) passing[passing.length - 1] = sum / total;
    else {
      sizes.push(x);
      passing.push(sum / total);
    }
  }
  return { sizes, passing };
}

function lineFit(xs: readonly number[], ys: readonly number[]): { slope: number; intercept: number; r2: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, r2: 0 };
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i += 1) {
    mx += xs[i] ?? 0;
    my += ys[i] ?? 0;
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = (xs[i] ?? 0) - mx;
    const dy = (ys[i] ?? 0) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  return { slope, intercept: my - slope * mx, r2: sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0 };
}

/**
 * Fit Rosin–Rammler to fragments: a line through ln(−ln(1 − P)) against ln x, skipping the largest size (P = 1).
 * The share of mass in the largest fragment of a barely broken particle makes this fit poor; it is meant for a broken one.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function fitRosinRammler(fragments: FragmentSizes): RosinRammlerFit {
  const curve = passingCurve(fragments);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [i, p] of curve.passing.entries()) {
    if (p <= 0 || p >= 1) continue;
    xs.push(Math.log(curve.sizes[i] ?? 1));
    ys.push(Math.log(-Math.log(1 - p)));
  }
  const line = lineFit(xs, ys);
  const spread = line.slope;
  return { scale: spread !== 0 ? Math.exp(-line.intercept / spread) : 0, spread, r2: line.r2, points: xs.length };
}

/**
 * Fit Gaudin–Schuhmann to the fines: a line through ln P against ln x for points passing at most `upTo` (default 0.5).
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function fitGaudinSchuhmann(fragments: FragmentSizes, upTo = 0.5): GaudinSchuhmannFit {
  const curve = passingCurve(fragments);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [i, p] of curve.passing.entries()) {
    if (p <= 0 || p > upTo) continue;
    xs.push(Math.log(curve.sizes[i] ?? 1));
    ys.push(Math.log(p));
  }
  const line = lineFit(xs, ys);
  const exponent = line.slope;
  return { maxSize: exponent !== 0 ? Math.exp(-line.intercept / exponent) : 0, exponent, r2: line.r2, points: xs.length };
}

/**
 * Least-squares fit of the JKMRC law to measured (E_cs kWh/t, t10 %) pairs: exact A for each b over a log grid, refined by golden section.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function fitT10(energies: readonly number[], t10s: readonly number[]): T10Fit {
  const fitA = (b: number): { a: number; error: number } => {
    let num = 0;
    let den = 0;
    for (const [i, e] of energies.entries()) {
      const g = 1 - Math.exp(-b * e);
      num += g * (t10s[i] ?? 0);
      den += g * g;
    }
    const a = den > 0 ? num / den : 0;
    let error = 0;
    for (const [i, e] of energies.entries()) error += (a * (1 - Math.exp(-b * e)) - (t10s[i] ?? 0)) ** 2;
    return { a, error };
  };
  let best = 0.01;
  let bestError = Infinity;
  for (let k = 0; k <= 80; k += 1) {
    const b = 0.01 * 10 ** (k / 20);
    const { error } = fitA(b);
    if (error < bestError) {
      bestError = error;
      best = b;
    }
  }
  let lo = best / 10 ** (1 / 20);
  let hi = best * 10 ** (1 / 20);
  const ratio = (Math.sqrt(5) - 1) / 2;
  for (let k = 0; k < 40; k += 1) {
    const m1 = hi - ratio * (hi - lo);
    const m2 = lo + ratio * (hi - lo);
    if (fitA(m1).error < fitA(m2).error) hi = m2;
    else lo = m1;
  }
  const b = (lo + hi) / 2;
  const { a, error } = fitA(b);
  let mean = 0;
  for (const t of t10s) mean += t / Math.max(1, t10s.length);
  let total = 0;
  for (const t of t10s) total += (t - mean) ** 2;
  return { a, b, r2: total > 0 ? 1 - error / total : 0, points: energies.length };
}
