/**
 * The Magic Formula 6.1 pure-slip coefficients the runtime tyre reads, named after the keys of a TNO `.tir` file in
 * camelCase (`PDY1` → `pdy1`), at nominal inflation. Horizontal and vertical shifts (conicity, ply steer) and turn
 * slip are left out: they are a few percent of a road tyre's force and cancel across an axle.
 */
export interface MagicFormulaTireCoefficients {
  /** Nominal load `Fz0`, N. */
  fnomin: number;
  /** Unloaded radius, m: scales the pneumatic trail. */
  unloadedRadius: number;
  pcx1: number;
  pdx1: number;
  pdx2: number;
  pcy1: number;
  pdy1: number;
  pdy2: number;
  pdy3: number;
  pey1: number;
  pey2: number;
  pky1: number;
  pky2: number;
  pky3: number;
  pky4: number;
  /** Camber stiffness per load at nominal load, 1/rad (negative in the TNO sign). */
  pky6: number;
  pky7: number;
  qbz1: number;
  qbz2: number;
  qbz3: number;
  qcz1: number;
  qdz1: number;
  qdz2: number;
  qez1: number;
  qez2: number;
  qez3: number;
  qez4: number;
  /** Friction scales `λμx`, `λμy`: a road surface or a test track against the rig the file was fitted on. */
  lmux: number;
  lmuy: number;
}

/**
 * The TNO 205/60 R15 passenger-car tyre (`TNO_car205_60R15.tir`, the set in Pacejka, *Tire and Vehicle Dynamics*,
 * 3rd ed., 2012, Appendix 3), dry asphalt, 4000 N nominal load: μx ≈ 1.04, μy ≈ 0.88, about 53 kN/rad of
 * cornering stiffness at nominal load. The reference cars run it scaled by `λμ = 1.04` for a dry test track.
 */
export const TNO_205_60R15_TIRE: Readonly<MagicFormulaTireCoefficients> = {
  fnomin: 4000,
  unloadedRadius: 0.3135,
  pcx1: 1.579,
  pdx1: 1.0422,
  pdx2: -0.0827,
  pcy1: 1.3332,
  pdy1: 0.8784,
  pdy2: -0.06445,
  pdy3: 0,
  pey1: -0.8227,
  pey2: -0.6062,
  pky1: -15.314,
  pky2: 1.7044,
  pky3: 0.36986,
  pky4: 1.9896,
  pky6: -0.9004,
  pky7: -0.2328,
  qbz1: 11.692,
  qbz2: -1.3225,
  qbz3: 0,
  qcz1: 1.2793,
  qdz1: 0.08993,
  qdz2: -0.005979,
  qez1: -2.17,
  qez2: 1.0036,
  qez3: 0,
  qez4: 0.2795,
  lmux: 1,
  lmuy: 1,
};

/**
 * The Magic Formula tyre as a car effect: each wheel's lateral and longitudinal grip, cornering stiffness and curve
 * shape come from its own load through the Magic Formula, so an axle with load moved across it holds less in total
 * (load sensitivity) and a loaded wheel peaks at a larger slip. Replaces the axle tyre curves and `loadSensitivity`.
 */
export interface VehicleMagicFormulaEffect {
  /**
   * Multiplier on the effect: `0` the axle tyre curves, `1` the Magic Formula exactly as fitted (default), past `1`
   * more load sensitivity (the friction's fall with load scaled up); sane over `0..4`.
   */
  strength?: number;
  /** Coefficients (default {@link TNO_205_60R15_TIRE}); give a whole set or change a few. */
  coefficients?: Partial<MagicFormulaTireCoefficients>;
  /** Rear-axle coefficients when the rear tyre differs (default the front's). */
  rear?: Partial<MagicFormulaTireCoefficients>;
}

/** One wheel's Magic Formula lateral curve at its load: `Fy = mu·Fz·sin(c·atan(Bα − e(Bα − atan Bα)))`, `B = stiffness/(c·mu·Fz)`. */
export interface MagicFormulaWheelCurve {
  /** Peak lateral friction coefficient. */
  muY: number;
  /** Peak longitudinal friction coefficient. */
  muX: number;
  /** Cornering stiffness, N/rad (positive). */
  stiffness: number;
  /** Shape factor `C`. */
  c: number;
  /** Curvature factor `E` (`< 1`). */
  e: number;
}

/** The coefficients a {@link VehicleMagicFormulaEffect} runs on one axle. */
export function magicFormulaCoefficients(effect: VehicleMagicFormulaEffect, axle: "front" | "rear"): MagicFormulaTireCoefficients {
  return { ...TNO_205_60R15_TIRE, ...effect.coefficients, ...(axle === "rear" ? effect.rear : undefined) };
}

/**
 * One wheel's pure-slip Magic Formula at load `fz` and inclination `gamma`. `loadSensitivity` scales how far the
 * friction coefficients and the curvature move with load (`1` as fitted), so the dial past `1` keeps the curve at
 * nominal load and only steepens its fall with load.
 * @capability vehicle-magic-formula one wheel's Magic Formula 6.1 grip, cornering stiffness and curve shape at its own load
 */
export function magicFormulaWheel(p: Readonly<MagicFormulaTireCoefficients>, fz: number, gamma = 0, loadSensitivity = 1): MagicFormulaWheelCurve {
  const fz0 = Math.max(1, p.fnomin);
  const load = Math.max(0, fz);
  const dfz = (load - fz0) / fz0;
  const spread = dfz * loadSensitivity;
  const floorY = 0.1 * Math.abs(p.pdy1);
  const floorX = 0.1 * Math.abs(p.pdx1);
  const muY = Math.max(floorY, p.lmuy * (p.pdy1 + p.pdy2 * spread) * (1 - p.pdy3 * gamma * gamma));
  const muX = Math.max(floorX, p.lmux * (p.pdx1 + p.pdx2 * spread));
  const stiffness = Math.abs(p.pky1 * fz0 * Math.sin(p.pky4 * Math.atan(load / (fz0 * Math.max(1e-3, Math.abs(p.pky2)))))) * Math.max(0, 1 - p.pky3 * Math.abs(gamma));
  const e = Math.min(0.95, p.pey1 + p.pey2 * spread);
  return { muY, muX, stiffness, c: Math.max(0.5, p.pcy1), e };
}

/** Pneumatic trail at load `fz` and slip `alpha`, m: how far behind the contact centre the lateral force acts (Magic Formula 6.1 `t`). */
export function magicFormulaTrail(p: Readonly<MagicFormulaTireCoefficients>, fz: number, alpha: number): number {
  const fz0 = Math.max(1, p.fnomin);
  const load = Math.max(0, fz);
  if (load <= 0) return 0;
  const dfz = (load - fz0) / fz0;
  const bt = Math.max(0.1, p.qbz1 + p.qbz2 * dfz + p.qbz3 * dfz * dfz);
  const ct = p.qcz1;
  const dt = load * (p.unloadedRadius / fz0) * (p.qdz1 + p.qdz2 * dfz);
  const x = bt * alpha;
  const et = Math.min(1, (p.qez1 + p.qez2 * dfz + p.qez3 * dfz * dfz) * (1 + (p.qez4 * 2 * Math.atan(bt * ct * alpha)) / Math.PI));
  return dt * Math.cos(ct * Math.atan(x - et * (x - Math.atan(x)))) * Math.cos(alpha);
}
