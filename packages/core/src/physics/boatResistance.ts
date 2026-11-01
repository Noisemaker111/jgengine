/** Kinematic viscosity of sea water at 15 °C (ITTC 7.5-02-01-03), m²/s. */
export const SEA_WATER_KINEMATIC_VISCOSITY = 1.18831e-6;

/** A flat-plate friction line for the viscous term. */
export type FrictionLine = "ittc1957" | "schoenherr";

/**
 * Flat-plate friction coefficient at a Reynolds number: ITTC-1957 `0.075/(log₁₀Re − 2)²`, or Schoenherr's
 * `0.242/√C_F = log₁₀(Re·C_F)` solved by Newton's method.
 * @capability boat-resistance ITTC-1957 and Schoenherr friction lines
 */
export function frictionLineCoefficient(line: FrictionLine, reynolds: number): number {
  const log = Math.log10(Math.max(reynolds, 1e3)) - 2;
  const ittc = 0.075 / (log * log);
  if (line === "ittc1957") return ittc;
  let cf = ittc;
  for (let i = 0; i < 40; i += 1) {
    const f = 0.242 / Math.sqrt(cf) - Math.log10(Math.max(reynolds, 1e3) * cf);
    const df = -0.121 / (cf * Math.sqrt(cf)) - 1 / (cf * Math.LN10);
    const next = Math.max(1e-5, cf - f / df);
    if (Math.abs(next - cf) < 1e-14) return next;
    cf = next;
  }
  return cf;
}

/**
 * Calm-water resistance of a displacement hull, the `resistance` effect of `boatDynamics`. Either a measured total
 * coefficient (`coefficient`, `R = C·½ρ·L·T·U²`, a captive-test or MMG `R'0`), or the terms of Holtrop and Mennen's
 * method: friction from a friction line on the wetted area times the form factor `1 + k`, wave-making and wave-breaking,
 * a bulb near the surface, an immersed transom, appendages and the model–ship correlation allowance. Length and beam
 * come from the boat's tuning; any coefficient left out is estimated from the hull.
 */
export interface HullResistance {
  /** Multiplier on the effect: `0` off (the simple model's term), `1` exactly as the reference measures it (default), past `1` stronger; sane over `0..4`. */
  strength?: number;
  /** Measured total resistance coefficient `R/(½ρ·L·T·U²)`; when set, every other term is skipped. */
  coefficient?: number;
  /** Mean draught, m; `draftForward`/`draftAft` refine it for the bulb and stern terms. */
  draft: number;
  draftForward?: number;
  draftAft?: number;
  /** Displaced volume, m³ (default `massKg / density`). */
  volume?: number;
  /** Longitudinal centre of buoyancy forward of 0.5L, percent of L (default `0`). */
  lcb?: number;
  /** Midship section coefficient (default `0.98`). */
  midshipCoefficient?: number;
  /** Waterplane area coefficient (default `0.75`). */
  waterplaneCoefficient?: number;
  /** Friction line (default `"ittc1957"`). */
  frictionLine?: FrictionLine;
  /** Wetted hull area, m²; estimated from the hull when omitted. */
  wettedArea?: number;
  /** Hull form factor `1 + k`; Holtrop's regression when omitted. */
  formFactor?: number;
  /** Wave-making and wave-breaking resistance by Holtrop–Mennen (default `true`); `false` leaves friction times form factor. */
  waveMaking?: boolean;
  /** Bulbous bow transverse area at the stem, m², and its centre above the keel, m. */
  bulbArea?: number;
  bulbCentre?: number;
  /** Immersed transom area at rest, m². */
  transomArea?: number;
  /** Afterbody shape: −25 pram with gondola, −10 V sections, 0 normal, +10 U sections with Hogner stern (default `0`). */
  sternShape?: number;
  /** Appendages: wetted area, m², and form factor `1 + k₂`. */
  appendages?: readonly { area: number; formFactor: number }[];
  /** Half angle of entrance, deg; estimated when omitted. */
  entranceAngle?: number;
  /** Model–ship correlation allowance `C_A`; Holtrop's estimate when omitted, `0` at model scale. */
  correlationAllowance?: number;
}

/** Water for the hydrodynamic terms. */
export interface BoatWater {
  /** kg/m³ (default `1025`). */
  density?: number;
  /** Kinematic viscosity, m²/s (default sea water at 15 °C). */
  viscosity?: number;
  /** m/s² (default `9.81`). */
  gravity?: number;
}

/**
 * Prepares a {@link HullResistance} for a hull of `length` and `beam` displacing `massKg`: every speed-independent
 * coefficient is worked out once and the returned function gives the resistance, N, at a forward speed, m/s.
 * @capability boat-resistance Holtrop–Mennen calm-water resistance (friction line, form factor, wave-making) or a measured coefficient
 */
export function prepareHullResistance(form: HullResistance, length: number, beam: number, massKg: number, water: BoatWater = {}): (speed: number) => number {
  const rho = water.density ?? 1025;
  const nu = water.viscosity ?? SEA_WATER_KINEMATIC_VISCOSITY;
  const g = water.gravity ?? 9.81;
  const L = length;
  const B = beam;
  const TF = form.draftForward ?? form.draft;
  const TA = form.draftAft ?? form.draft;
  const T = 0.5 * (TF + TA);
  if (form.coefficient !== undefined) {
    const scale = 0.5 * rho * L * T * form.coefficient;
    return (u) => scale * u * Math.abs(u);
  }
  const V = form.volume ?? massKg / rho;
  const CM = form.midshipCoefficient ?? 0.98;
  const CWP = form.waterplaneCoefficient ?? 0.75;
  const lcb = form.lcb ?? 0;
  const ABT = form.bulbArea ?? 0;
  const hB = Math.min(form.bulbCentre ?? 0, 0.6 * TF);
  const AT = form.transomArea ?? 0;
  const cStern = form.sternShape ?? 0;
  const CB = V / (L * B * T);
  const CP = CB / CM;
  const LR = L * (1 - CP + (0.06 * CP * lcb) / (4 * CP - 1));
  const TL = T / L;
  const c12 = TL > 0.05 ? TL ** 0.2228446 : TL > 0.02 ? 48.2 * (TL - 0.02) ** 2.078 + 0.479948 : 0.479948;
  const c13 = 1 + 0.003 * cStern;
  const formFactor = form.formFactor ?? c13 * (0.93 + c12 * (B / LR) ** 0.92497 * (0.95 - CP) ** -0.521448 * (1 - CP + 0.0225 * lcb) ** 0.6906);
  const S = form.wettedArea ?? L * (2 * T + B) * Math.sqrt(CM) * (0.453 + 0.4425 * CB - 0.2862 * CM - 0.003467 * (B / T) + 0.3696 * CWP) + (2.38 * ABT) / CB;
  const line = form.frictionLine ?? "ittc1957";
  const appendages = form.appendages ?? [];
  const appendageArea = appendages.reduce((sum, item) => sum + item.area, 0);
  const appendageFactor = appendageArea > 0 ? appendages.reduce((sum, item) => sum + item.area * item.formFactor, 0) / appendageArea : 0;

  const LB = L / B;
  const BL = B / L;
  const c7 = BL < 0.11 ? 0.229577 * BL ** 0.33333 : BL < 0.25 ? BL : 0.5 - 0.0625 * LB;
  const iE =
    form.entranceAngle ??
    1 + 89 * Math.exp(-(LB ** 0.80856) * (1 - CWP) ** 0.30484 * (1 - CP - 0.0225 * lcb) ** 0.6367 * (LR / B) ** 0.34574 * ((100 * V) / L ** 3) ** 0.16302);
  const c1 = 2223105 * c7 ** 3.78613 * (T / B) ** 1.07961 * (90 - iE) ** -1.37565;
  const c3 = ABT > 0 ? (0.56 * ABT ** 1.5) / (B * T * (0.31 * Math.sqrt(ABT) + TF - hB)) : 0;
  const c2 = Math.exp(-1.89 * Math.sqrt(c3));
  const c5 = 1 - (0.8 * AT) / (B * T * CM);
  const lambda = LB < 12 ? 1.446 * CP - 0.03 * LB : 1.446 * CP - 0.36;
  const c16 = CP < 0.8 ? 8.07981 * CP - 13.8673 * CP * CP + 6.984388 * CP ** 3 : 1.73014 - 0.7067 * CP;
  const m1 = 0.0140407 * (L / T) - (1.75254 * Math.cbrt(V)) / L - 4.79323 * BL - c16;
  const slenderness = L ** 3 / V;
  const c15 = slenderness < 512 ? -1.69385 : slenderness > 1727 ? 0 : -1.69385 + (L / Math.cbrt(V) - 8) / 2.36;
  const weight = rho * g * V;
  const lowSpeed = (fn: number) => c1 * c2 * c5 * weight * Math.exp(m1 * fn ** -0.9 + c15 * CP * CP * Math.exp(-0.1 * fn ** -2) * Math.cos(lambda * fn ** -2));
  const c17 = 6919.3 * CM ** -1.3346 * (V / L ** 3) ** 2.00977 * (LB - 2) ** 1.40692;
  const m3 = -7.2035 * BL ** 0.326869 * (T / B) ** 0.605375;
  const highSpeed = (fn: number) => c17 * c2 * c5 * weight * Math.exp(m3 * fn ** -0.9 + c15 * 0.4 * Math.exp(-0.034 * fn ** -3.29) * Math.cos(lambda * fn ** -2));
  const waveOn = form.waveMaking ?? true;
  const lowEnd = waveOn ? lowSpeed(0.4) : 0;
  const highStart = waveOn ? highSpeed(0.55) : 0;
  const wave = (fn: number) => (!waveOn || fn <= 0 ? 0 : fn <= 0.4 ? lowSpeed(fn) : fn >= 0.55 ? highSpeed(fn) : lowEnd + ((20 * fn - 8) * (highStart - lowEnd)) / 3);
  const PB = ABT > 0 ? (0.56 * Math.sqrt(ABT)) / (TF - 1.5 * hB) : 0;
  const c4 = Math.min(TF / L, 0.04);
  const CA = form.correlationAllowance ?? 0.006 * (L + 100) ** -0.16 - 0.00205 + 0.003 * Math.sqrt(L / 7.5) * CB ** 4 * c2 * (0.04 - c4);
  return (speed) => {
    const u = Math.abs(speed);
    if (u <= 0) return 0;
    const half = 0.5 * rho * u * u;
    const CF = frictionLineCoefficient(line, (u * L) / nu);
    let total = half * S * CF * formFactor + half * appendageArea * appendageFactor * CF + wave(u / Math.sqrt(g * L)) + half * (S + appendageArea) * CA;
    if (waveOn && ABT > 0) {
      const Fni = u / Math.sqrt(g * (TF - hB - 0.25 * Math.sqrt(ABT)) + 0.15 * u * u);
      total += (0.11 * Math.exp(-3 * PB ** -2) * Fni ** 3 * ABT ** 1.5 * rho * g) / (1 + Fni * Fni);
    }
    if (waveOn && AT > 0) {
      const FnT = u / Math.sqrt((2 * g * AT) / (B + B * CWP));
      if (FnT < 5) total += half * AT * 0.2 * (1 - 0.2 * FnT);
    }
    return Math.sign(speed) * total;
  };
}
