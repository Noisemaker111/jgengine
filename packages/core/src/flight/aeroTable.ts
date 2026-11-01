// @skill jgengine-world

/** What an {@link AeroTable} is looked up by. Angles and control-surface deflections are rad. */
export type AeroInput = "alpha" | "beta" | "absBeta" | "mach" | "pitch" | "roll" | "yaw";

/**
 * What a coefficient term multiplies: `pHat`, `qHat` and `rHat` are the body rates made dimensionless
 * (`p·b/2V`, `q·c̄/2V`, `r·b/2V`), `alphaDotHat` is `α̇·c̄/2V`, `pitch`, `roll` and `yaw` are the surface deflections,
 * rad, and `signBeta` is the sign of the sideslip (for data tabled against `|β|`).
 */
export type AeroFactor = "one" | "alpha" | "beta" | "signBeta" | "mach" | "pHat" | "qHat" | "rHat" | "alphaDotHat" | "pitch" | "roll" | "yaw";

/**
 * A gridded coefficient table: one breakpoint list per input (strictly increasing), values row-major with the last
 * input varying fastest, multilinear between, held flat past the ends unless `extrapolate` is `"linear"`.
 */
export interface AeroTable {
  inputs: readonly AeroInput[];
  breakpoints: readonly (readonly number[])[];
  values: readonly number[];
  extrapolate?: "clamp" | "linear";
}

/** One term of a coefficient build-up: a constant or a table, times a factor (default `"one"`). */
export interface AeroTerm {
  value: number | AeroTable;
  times?: AeroFactor;
}

/** The air data and controls the coefficient terms read. */
export interface AeroState {
  alpha: number;
  beta: number;
  mach: number;
  pHat: number;
  qHat: number;
  rHat: number;
  alphaDotHat: number;
  pitch: number;
  roll: number;
  yaw: number;
}

function inputValue(state: AeroState, input: AeroInput): number {
  return input === "absBeta" ? Math.abs(state.beta) : state[input];
}

function factorValue(state: AeroState, factor: AeroFactor | undefined): number {
  if (factor === undefined || factor === "one") return 1;
  if (factor === "signBeta") return Math.sign(state.beta);
  return state[factor];
}

/**
 * Samples an {@link AeroTable} at the current air data, multilinear across its inputs; allocates nothing.
 * @capability aircraft-aero-table sample a gridded aerodynamic coefficient table by angle of attack, sideslip, Mach or deflection
 */
export function sampleAeroTable(table: AeroTable, state: AeroState): number {
  const dims = table.inputs.length;
  let total = 0;
  const corners = 2 ** dims;
  for (let corner = 0; corner < corners; corner += 1) {
    let weight = 1;
    let index = 0;
    let stride = 1;
    let bits = corner;
    for (let d = dims - 1; d >= 0; d -= 1) {
      const points = table.breakpoints[d] ?? [];
      const count = points.length;
      const x = inputValue(state, table.inputs[d] ?? "alpha");
      let i = 0;
      while (i < count - 2 && x >= (points[i + 1] ?? 0)) i += 1;
      const x0 = points[i] ?? 0;
      const x1 = points[i + 1] ?? x0;
      let t = x1 > x0 ? (x - x0) / (x1 - x0) : 0;
      if (table.extrapolate !== "linear") t = Math.max(0, Math.min(1, t));
      const upper = bits % 2;
      bits = (bits - upper) / 2;
      weight *= upper === 1 ? t : 1 - t;
      index += (i + upper) * stride;
      stride *= count;
    }
    if (weight !== 0) total += weight * (table.values[index] ?? 0);
  }
  return total;
}

/**
 * Sums a coefficient build-up: each term's constant or table value times its factor.
 * @capability aircraft-aero-table sum a coefficient build-up of constants and tables times rates, angles and deflections
 */
export function sumAeroTerms(terms: readonly AeroTerm[] | undefined, state: AeroState): number {
  if (terms === undefined) return 0;
  let total = 0;
  for (const term of terms) total += aeroTermValue(term, state);
  return total;
}

/**
 * One term's contribution: its constant or table value times its factor.
 * @capability aircraft-aero-table evaluate one coefficient term
 */
export function aeroTermValue(term: AeroTerm, state: AeroState): number {
  const value = typeof term.value === "number" ? term.value : sampleAeroTable(term.value, state);
  return value * factorValue(state, term.times);
}

/** Where full pilot input puts a control surface, rad, at full positive (nose up, right roll, nose right) and full negative input. */
export interface AeroSurfaceTravel {
  positive: number;
  negative: number;
}

/**
 * The surface angle, rad, an actuator at `share` of its travel (`-1..1`) puts a surface at.
 * @capability aircraft-aero-table map an actuator position to a control-surface deflection with unequal up and down travel
 */
export function surfaceAngle(travel: AeroSurfaceTravel | undefined, share: number): number {
  if (travel === undefined) return share;
  return share >= 0 ? share * travel.positive : -share * travel.negative;
}
