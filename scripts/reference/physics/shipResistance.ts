// @skill jgengine-world
/** Kinematic viscosity of sea water at 15 °C (ITTC 7.5-02-01-03), m²/s. */
export const SEA_WATER_VISCOSITY = 1.18831e-6;

/**
 * ITTC-1957 model–ship correlation line, `C_F = 0.075 / (log₁₀ Re − 2)²`.
 * @capability ship-resistance ITTC-1957 friction line
 */
export function ittc1957Friction(reynolds: number): number {
  const log = Math.log10(Math.max(reynolds, 1e3)) - 2;
  return 0.075 / (log * log);
}

/**
 * Schoenherr's turbulent flat-plate line, `0.242/√C_F = log₁₀(Re·C_F)`, solved by Newton's method.
 * @capability ship-resistance Schoenherr (ATTC-1947) friction line
 */
export function schoenherrFriction(reynolds: number): number {
  let cf = ittc1957Friction(reynolds);
  for (let i = 0; i < 40; i += 1) {
    const f = 0.242 / Math.sqrt(cf) - Math.log10(reynolds * cf);
    const df = -0.121 / (cf * Math.sqrt(cf)) - 1 / (cf * Math.LN10);
    const next = cf - f / df;
    if (Math.abs(next - cf) < 1e-14) return next;
    cf = Math.max(1e-5, next);
  }
  return cf;
}

/** A hull as the Holtrop–Mennen method describes it, SI units. */
export interface HoltropHull {
  /** Waterline length, m. */
  length: number;
  /** Length between perpendiculars, m (default `length`). */
  lengthBetweenPerpendiculars?: number;
  beam: number;
  /** Draught at the forward and aft perpendiculars, m. */
  draftForward: number;
  draftAft: number;
  /** Moulded displacement volume, m³. */
  volume: number;
  /** Longitudinal centre of buoyancy forward of 0.5L, percent of L (negative is aft). */
  lcb: number;
  /** Transverse area of the bulbous bow at the stem, m² (default `0`). */
  bulbArea?: number;
  /** Height of the bulb area's centre above the keel, m. */
  bulbCentre?: number;
  midshipCoefficient: number;
  waterplaneCoefficient: number;
  /** Immersed transom area at rest, m² (default `0`). */
  transomArea?: number;
  /** Afterbody shape: −25 pram with gondola, −10 V sections, 0 normal, +10 U sections with Hogner stern (default `0`). */
  sternShape?: number;
  /** Appendages: wetted area, m², and its form factor `1 + k₂` (rudder behind skeg 1.5–2.0, shafts 2.0–4.0 …). */
  appendages?: readonly { area: number; formFactor: number }[];
  /** Half angle of entrance, deg; estimated from the hull when omitted. */
  entranceAngle?: number;
  /** Wetted hull area, m²; estimated from the hull when omitted. */
  wettedArea?: number;
}

/** Fluid and roughness settings for {@link holtropMennenResistance}. */
export interface HoltropConditions {
  density?: number;
  viscosity?: number;
  gravity?: number;
}

/** Every resistance component and intermediate coefficient, SI units (N, m²). */
export interface HoltropResistance {
  speed: number;
  froude: number;
  reynolds: number;
  prismaticCoefficient: number;
  blockCoefficient: number;
  lengthOfRun: number;
  /** Hull form factor `1 + k₁`. */
  formFactor: number;
  wettedArea: number;
  /** Wetted area of the appendages, m². */
  appendageArea: number;
  frictionCoefficient: number;
  friction: number;
  appendage: number;
  /** Half angle of entrance used, deg. */
  entranceAngle: number;
  c1: number;
  c2: number;
  c3: number;
  c5: number;
  c7: number;
  c15: number;
  c16: number;
  m1: number;
  m2: number;
  lambda: number;
  wave: number;
  bulb: number;
  transom: number;
  correlationAllowance: number;
  correlation: number;
  total: number;
  /** Effective power `R·V`, W. */
  effectivePower: number;
  /** Equivalent `1 + k` of hull and appendages together, for the viscous coefficient. */
  totalFormFactor: number;
  /** Viscous resistance coefficient `(1 + k)·C_F + C_A`. */
  viscousCoefficient: number;
}

/**
 * Holtrop and Mennen's statistical resistance prediction for displacement ships: ITTC-1957 friction times the regressed
 * form factor, appendages, wave-making and wave-breaking, a bulb near the surface, an immersed transom and the
 * model–ship correlation allowance. Wave resistance up to `Fn = 0.4` is the 1982 formula; above `Fn = 0.55` it is the
 * 1984 high-speed formula; between them, the 1984 interpolation.
 * @capability ship-resistance Holtrop–Mennen (1982/1984) displacement-ship resistance, component by component
 */
export function holtropMennenResistance(hull: HoltropHull, speed: number, conditions: HoltropConditions = {}): HoltropResistance {
  const rho = conditions.density ?? 1025;
  const nu = conditions.viscosity ?? SEA_WATER_VISCOSITY;
  const g = conditions.gravity ?? 9.81;
  const L = hull.length;
  const B = hull.beam;
  const T = 0.5 * (hull.draftForward + hull.draftAft);
  const TF = hull.draftForward;
  const V = hull.volume;
  const CM = hull.midshipCoefficient;
  const CWP = hull.waterplaneCoefficient;
  const lcb = hull.lcb;
  const ABT = hull.bulbArea ?? 0;
  const hB = Math.min(hull.bulbCentre ?? 0, 0.6 * TF);
  const AT = hull.transomArea ?? 0;
  const cStern = hull.sternShape ?? 0;
  const CB = V / (L * B * T);
  const CP = CB / CM;
  const Fn = speed / Math.sqrt(g * L);
  const Re = (speed * L) / nu;
  const half = 0.5 * rho * speed * speed;

  const LR = L * (1 - CP + (0.06 * CP * lcb) / (4 * CP - 1));
  const TL = T / L;
  const c12 = TL > 0.05 ? TL ** 0.2228446 : TL > 0.02 ? 48.2 * (TL - 0.02) ** 2.078 + 0.479948 : 0.479948;
  const c13 = 1 + 0.003 * cStern;
  const formFactor = c13 * (0.93 + c12 * (B / LR) ** 0.92497 * (0.95 - CP) ** -0.521448 * (1 - CP + 0.0225 * lcb) ** 0.6906);
  const S =
    hull.wettedArea ??
    L * (2 * T + B) * Math.sqrt(CM) * (0.453 + 0.4425 * CB - 0.2862 * CM - 0.003467 * (B / T) + 0.3696 * CWP) + (2.38 * ABT) / CB;
  const CF = ittc1957Friction(Re);
  const friction = half * S * CF;

  const appendages = hull.appendages ?? [];
  const appendageArea = appendages.reduce((sum, item) => sum + item.area, 0);
  const appendageFactor = appendageArea > 0 ? appendages.reduce((sum, item) => sum + item.area * item.formFactor, 0) / appendageArea : 0;
  const appendage = half * appendageArea * appendageFactor * CF;

  const LB = L / B;
  const BL = B / L;
  const c7 = BL < 0.11 ? 0.229577 * BL ** 0.33333 : BL < 0.25 ? BL : 0.5 - 0.0625 * LB;
  const iE =
    hull.entranceAngle ??
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
  const d = -0.9;
  const weight = rho * g * V;
  const lowSpeed = (fn: number) => c1 * c2 * c5 * weight * Math.exp(m1 * fn ** d + c15 * CP * CP * Math.exp(-0.1 * fn ** -2) * Math.cos(lambda * fn ** -2));
  const c17 = 6919.3 * CM ** -1.3346 * (V / L ** 3) ** 2.00977 * (LB - 2) ** 1.40692;
  const m3 = -7.2035 * BL ** 0.326869 * (T / B) ** 0.605375;
  const highSpeed = (fn: number) => c17 * c2 * c5 * weight * Math.exp(m3 * fn ** d + c15 * 0.4 * Math.exp(-0.034 * fn ** -3.29) * Math.cos(lambda * fn ** -2));
  const wave = Fn <= 0 ? 0 : Fn <= 0.4 ? lowSpeed(Fn) : Fn >= 0.55 ? highSpeed(Fn) : lowSpeed(0.4) + ((20 * Fn - 8) * (highSpeed(0.55) - lowSpeed(0.4))) / 3;
  const m2 = Fn > 0 ? c15 * CP * CP * Math.exp(-0.1 * Fn ** -2) : 0;

  const PB = ABT > 0 ? (0.56 * Math.sqrt(ABT)) / (TF - 1.5 * hB) : 0;
  const Fni = ABT > 0 ? speed / Math.sqrt(g * (TF - hB - 0.25 * Math.sqrt(ABT)) + 0.15 * speed * speed) : 0;
  const bulb = ABT > 0 ? (0.11 * Math.exp(-3 * PB ** -2) * Fni ** 3 * ABT ** 1.5 * rho * g) / (1 + Fni * Fni) : 0;
  const FnT = AT > 0 ? speed / Math.sqrt((2 * g * AT) / (B + B * CWP)) : 0;
  const c6 = AT > 0 && FnT < 5 ? 0.2 * (1 - 0.2 * FnT) : 0;
  const transom = half * AT * c6;

  const c4 = Math.min(TF / L, 0.04);
  const CA = 0.006 * (L + 100) ** -0.16 - 0.00205 + 0.003 * Math.sqrt(L / 7.5) * CB ** 4 * c2 * (0.04 - c4);
  // The paper's example applies C_A to hull and appendage area together.
  const correlation = half * (S + appendageArea) * CA;
  const total = friction * formFactor + appendage + wave + bulb + transom + correlation;
  const totalFormFactor = formFactor + ((appendageFactor - formFactor) * appendageArea) / (S + appendageArea);
  return {
    speed,
    froude: Fn,
    reynolds: Re,
    prismaticCoefficient: CP,
    blockCoefficient: CB,
    lengthOfRun: LR,
    formFactor,
    wettedArea: S,
    appendageArea,
    frictionCoefficient: CF,
    friction,
    appendage,
    entranceAngle: iE,
    c1,
    c2,
    c3,
    c5,
    c7,
    c15,
    c16,
    m1,
    m2,
    lambda,
    wave,
    bulb,
    transom,
    correlationAllowance: CA,
    correlation,
    total,
    effectivePower: total * speed,
    totalFormFactor,
    viscousCoefficient: totalFormFactor * CF + CA,
  };
}

/** A single-screw propeller as the propulsion-factor regressions need it. */
export interface HoltropPropeller {
  diameter: number;
  blades: number;
  /** Clearance of the tip above the keel line, m. */
  tipClearance: number;
}

/** Wake, thrust deduction and the propeller's minimum blade area. */
export interface HoltropPropulsionFactors {
  /** Effective wake fraction. */
  wake: number;
  /** Thrust deduction fraction. */
  thrustDeduction: number;
  /** Required thrust `R / (1 − t)`, N. */
  thrust: number;
  /** Keller's minimum expanded blade-area ratio for this thrust and shaft immersion. */
  bladeAreaRatio: number;
  /** Relative-rotative efficiency. */
  relativeRotative: number;
  c8: number;
  c9: number;
  c10: number;
  c11: number;
  /** `C_P1 = 1.45·C_P − 0.315 − 0.0225·lcb`. */
  cp1: number;
}

/**
 * Holtrop and Mennen's (1982) propulsion factors for a single-screw ship with a conventional stern, from a resistance
 * prediction: wake fraction, thrust deduction, Keller's blade-area ratio and relative-rotative efficiency.
 * @capability ship-resistance Holtrop–Mennen wake fraction, thrust deduction and blade area for a single screw
 */
export function holtropPropulsionFactors(hull: HoltropHull, resistance: HoltropResistance, propeller: HoltropPropeller, density = 1025, gravity = 9.81): HoltropPropulsionFactors {
  const L = hull.length;
  const B = hull.beam;
  const TA = hull.draftAft;
  const T = 0.5 * (hull.draftForward + hull.draftAft);
  const D = propeller.diameter;
  const CP = resistance.prismaticCoefficient;
  const CB = resistance.blockCoefficient;
  const lcb = hull.lcb;
  const cStern = hull.sternShape ?? 0;
  const S = resistance.wettedArea + resistance.appendageArea;
  const CV = resistance.viscousCoefficient;
  const c8 = B / TA < 5 ? (B * S) / (L * D * TA) : (S * ((7 * B) / TA - 25)) / (L * D * (B / TA - 3));
  const c9 = c8 < 28 ? c8 : 32 - 16 / (c8 - 24);
  const c11 = TA / D < 2 ? TA / D : 0.0833333 * (TA / D) ** 3 + 1.33333;
  const cp1 = 1.45 * CP - 0.315 - 0.0225 * lcb;
  const wake =
    c9 * CV * (L / TA) * (0.0661875 + (1.21756 * c11 * CV) / (1 - cp1)) +
    0.24558 * Math.sqrt(B / (L * (1 - cp1))) -
    0.09726 / (0.95 - CP) +
    0.11434 / (0.95 - CB) +
    0.75 * cStern * CV +
    0.002 * cStern;
  const c10 = L / B > 5.2 ? B / L : 0.25 - 0.003328402 / (B / L - 0.134615385);
  const thrustDeduction = (0.001979 * L) / (B - B * cp1) + 1.0585 * c10 - 0.00524 - (0.1418 * D * D) / (B * T) + 0.0015 * cStern;
  const thrust = resistance.total / (1 - thrustDeduction);
  // Keller: static pressure at the shaft is atmosphere plus the head over the shaft, less vapour (99 047 Pa at 15 °C).
  const shaftImmersion = TA - propeller.tipClearance - D / 2;
  const bladeAreaRatio = ((1.3 + 0.3 * propeller.blades) * thrust) / (D * D * (99047 + density * gravity * shaftImmersion)) + 0.2;
  const relativeRotative = 0.9922 - 0.05908 * bladeAreaRatio + 0.07424 * (CP - 0.0225 * lcb);
  return { wake, thrustDeduction, thrust, bladeAreaRatio, relativeRotative, c8, c9, c10, c11, cp1 };
}

/**
 * The hypothetical single-screw ship of Holtrop and Mennen's 1982 numerical example, with the results the paper prints
 * for 25 knots, so the method is checked against its own authors' arithmetic.
 */
export const HOLTROP_MENNEN_EXAMPLE = {
  hull: {
    length: 205,
    lengthBetweenPerpendiculars: 200,
    beam: 32,
    draftForward: 10,
    draftAft: 10,
    volume: 37500,
    // Printed as 2.02% of Lpp aft of ½Lpp; the paper's own results (C_P1 = 0.5477) use it as −0.75% of the 205 m waterline.
    lcb: -0.75,
    bulbArea: 20,
    bulbCentre: 4,
    midshipCoefficient: 0.98,
    waterplaneCoefficient: 0.75,
    transomArea: 16,
    sternShape: 10,
    appendages: [{ area: 50, formFactor: 1.5 }],
  } satisfies HoltropHull,
  propeller: { diameter: 8, blades: 4, tipClearance: 0.2 } satisfies HoltropPropeller,
  speed: 25 * 0.5144444,
  published: {
    froude: 0.2868,
    prismaticCoefficient: 0.5833,
    lengthOfRun: 81.385,
    c13: 1.03,
    formFactor: 1.156,
    wettedArea: 7381.45,
    frictionCoefficient: 0.00139,
    friction: 869.63e3,
    appendage: 8.83e3,
    c7: 0.1561,
    entranceAngle: 12.08,
    c1: 1.398,
    c3: 0.02119,
    c2: 0.7595,
    c5: 0.9592,
    m1: -2.1274,
    c15: -1.69385,
    m2: -0.17087,
    lambda: 0.6513,
    wave: 557.11e3,
    bulbEmergence: 0.6261,
    bulbFroude: 1.5084,
    bulb: 0.049e3,
    transomFroude: 5.433,
    transom: 0,
    c4: 0.04,
    correlationAllowance: 0.000352,
    correlation: 221.98e3,
    total: 1793.26e3,
    effectivePower: 23063e3,
    viscousCoefficient: 0.001963,
    c9: 14.5,
    c11: 1.25,
    cp1: 0.5477,
    wake: 0.2584,
    c10: 0.1561,
    thrustDeduction: 0.1747,
    thrust: 2172.75e3,
    bladeAreaRatio: 0.7393,
    relativeRotative: 0.9931,
    chord075: 3.065,
    thicknessChord075: 0.03524,
    profileDragIncrement: 0.000956,
    thrustCoefficient: 0.18802,
    revolutions: 1.6594,
    torqueCoefficient: 0.033275,
    openWaterEfficiency: 0.6461,
    shaftPower: 32621e3,
  },
} as const;

