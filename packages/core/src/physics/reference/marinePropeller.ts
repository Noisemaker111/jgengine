// @skill jgengine-world

/** One polynomial term: coefficient and the powers of `J`, `P/D`, `A_E/A_0` and `Z`. */
type BSeriesTerm = readonly [number, number, number, number, number];

// Oosterveld and van Oossanen (1975), Table 1: K_T and K_Q of the Wageningen B-screw series at Re = 2·10⁶.
const KT_TERMS: readonly BSeriesTerm[] = [
  [0.00880496, 0, 0, 0, 0],
  [-0.204554, 1, 0, 0, 0],
  [0.166351, 0, 1, 0, 0],
  [0.158114, 0, 2, 0, 0],
  [-0.147581, 2, 0, 1, 0],
  [-0.481497, 1, 1, 1, 0],
  [0.415437, 0, 2, 1, 0],
  [0.0144043, 0, 0, 0, 1],
  [-0.0530054, 2, 0, 0, 1],
  [0.0143481, 0, 1, 0, 1],
  [0.0606826, 1, 1, 0, 1],
  [-0.0125894, 0, 0, 1, 1],
  [0.0109689, 1, 0, 1, 1],
  [-0.133698, 0, 3, 0, 0],
  [0.00638407, 0, 6, 0, 0],
  [-0.00132718, 2, 6, 0, 0],
  [0.168496, 3, 0, 1, 0],
  [-0.0507214, 0, 0, 2, 0],
  [0.0854559, 2, 0, 2, 0],
  [-0.0504475, 3, 0, 2, 0],
  [0.010465, 1, 6, 2, 0],
  [-0.00648272, 2, 6, 2, 0],
  [-0.00841728, 0, 3, 0, 1],
  [0.0168424, 1, 3, 0, 1],
  [-0.00102296, 3, 3, 0, 1],
  [-0.0317791, 0, 3, 1, 1],
  [0.018604, 1, 0, 2, 1],
  [-0.00410798, 0, 2, 2, 1],
  [-0.000606848, 0, 0, 0, 2],
  [-0.0049819, 1, 0, 0, 2],
  [0.0025983, 2, 0, 0, 2],
  [-0.000560528, 3, 0, 0, 2],
  [-0.00163652, 1, 2, 0, 2],
  [-0.000328787, 1, 6, 0, 2],
  [0.000116502, 2, 6, 0, 2],
  [0.000690904, 0, 0, 1, 2],
  [0.00421749, 0, 3, 1, 2],
  [0.0000565229, 3, 6, 1, 2],
  [-0.00146564, 0, 3, 2, 2]
];

const KQ_TERMS: readonly BSeriesTerm[] = [
  [0.00379368, 0, 0, 0, 0],
  [0.00886523, 2, 0, 0, 0],
  [-0.032241, 1, 1, 0, 0],
  [0.00344778, 0, 2, 0, 0],
  [-0.0408811, 0, 1, 1, 0],
  [-0.108009, 1, 1, 1, 0],
  [-0.0885381, 2, 1, 1, 0],
  [0.188561, 0, 2, 1, 0],
  [-0.00370871, 1, 0, 0, 1],
  [0.00513696, 0, 1, 0, 1],
  [0.0209449, 1, 1, 0, 1],
  [0.00474319, 2, 1, 0, 1],
  [-0.00723408, 2, 0, 1, 1],
  [0.00438388, 1, 1, 1, 1],
  [-0.0269403, 0, 2, 1, 1],
  [0.0558082, 3, 0, 1, 0],
  [0.0161886, 0, 3, 1, 0],
  [0.00318086, 1, 3, 1, 0],
  [0.015896, 0, 0, 2, 0],
  [0.0471729, 1, 0, 2, 0],
  [0.0196283, 3, 0, 2, 0],
  [-0.0502782, 0, 1, 2, 0],
  [-0.030055, 3, 1, 2, 0],
  [0.0417122, 2, 2, 2, 0],
  [-0.0397722, 0, 3, 2, 0],
  [-0.00350024, 0, 6, 2, 0],
  [-0.0106854, 3, 0, 0, 1],
  [0.00110903, 3, 3, 0, 1],
  [-0.000313912, 0, 6, 0, 1],
  [0.0035985, 3, 0, 1, 1],
  [-0.00142121, 0, 6, 1, 1],
  [-0.00383637, 1, 0, 2, 1],
  [0.0126803, 0, 2, 2, 1],
  [-0.00318278, 2, 3, 2, 1],
  [0.00334268, 0, 6, 2, 1],
  [-0.00183491, 1, 1, 0, 2],
  [0.000112451, 3, 2, 0, 2],
  [-0.0000297228, 3, 6, 0, 2],
  [0.000269551, 1, 0, 1, 2],
  [0.00083265, 2, 0, 1, 2],
  [0.00155334, 0, 2, 1, 2],
  [0.000302683, 0, 6, 1, 2],
  [-0.0001843, 0, 0, 2, 2],
  [-0.000425399, 0, 3, 2, 2],
  [0.0000869243, 3, 3, 2, 2],
  [-0.0004659, 0, 6, 2, 2],
  [0.0000554194, 1, 6, 2, 2]
];

function polynomial(terms: readonly BSeriesTerm[], j: number, pitchRatio: number, areaRatio: number, blades: number): number {
  let sum = 0;
  for (const [c, s, t, u, v] of terms) sum += c * j ** s * pitchRatio ** t * areaRatio ** u * blades ** v;
  return sum;
}

/** Geometry of a Wageningen B-series propeller. */
export interface BSeriesPropeller {
  diameter: number;
  /** Number of blades, 2–7. */
  blades: number;
  /** Expanded blade-area ratio `A_E/A_0`, 0.3–1.05. */
  areaRatio: number;
  /** Pitch–diameter ratio, 0.5–1.4. */
  pitchRatio: number;
  /** Blade surface roughness for the ITTC-1978 scale correction, m (default `30e-6`, a new propeller). */
  roughness?: number;
}

/** Open-water thrust and torque coefficients at one advance ratio. */
export interface OpenWaterPoint {
  advance: number;
  thrust: number;
  torque: number;
  /** Open-water efficiency `J·K_T / (2π·K_Q)`. */
  efficiency: number;
}

/**
 * Open-water `K_T` and `K_Q` of a Wageningen B-series propeller from the Oosterveld–van Oossanen regression polynomials
 * (model scale, Re = 2·10⁶). Valid for positive thrust; past the zero-thrust advance the polynomials are extrapolations.
 * @capability marine-propeller Wageningen B-series open-water K_T, K_Q polynomials
 */
export function bSeriesOpenWater(propeller: BSeriesPropeller, advance: number): OpenWaterPoint {
  const thrust = polynomial(KT_TERMS, advance, propeller.pitchRatio, propeller.areaRatio, propeller.blades);
  const torque = polynomial(KQ_TERMS, advance, propeller.pitchRatio, propeller.areaRatio, propeller.blades);
  return { advance, thrust, torque, efficiency: torque > 0 ? (advance * thrust) / (2 * Math.PI * torque) : 0 };
}

/** Blade chord and thickness at 0.75R, the section the ITTC-1978 correction scales. */
export interface ScrewBladeSection {
  /** Chord at 0.75R, m. */
  chord: number;
  /** Thickness–chord ratio at 0.75R. */
  thicknessRatio: number;
}

/**
 * Holtrop and Mennen's (1982) estimate of the 0.75R chord and thickness ratio from diameter, blades and area ratio.
 * @capability marine-propeller B-series blade chord and thickness at 0.75R
 */
export function bSeriesBladeSection(propeller: BSeriesPropeller): ScrewBladeSection {
  const chord = (2.073 * propeller.areaRatio * propeller.diameter) / propeller.blades;
  return { chord, thicknessRatio: ((0.0185 - 0.00125 * propeller.blades) * propeller.diameter) / chord };
}

/**
 * ITTC-1978 profile drag change `ΔC_D` between the model-scale series and a full-scale propeller of the given roughness.
 * @capability marine-propeller ITTC-1978 propeller scale correction
 */
export function propellerProfileDragIncrement(section: ScrewBladeSection, roughness = 30e-6): number {
  return (2 + 4 * section.thicknessRatio) * (0.003605 - (1.89 + 1.62 * Math.log10(section.chord / roughness)) ** -2.5);
}

/**
 * Full-scale open water of a B-series propeller: the series polynomials with the ITTC-1978 correction
 * `K_T −= ΔC_D·0.3·(P/D)·(c·Z/D)`, `K_Q += ΔC_D·0.25·(c·Z/D)`.
 * @capability marine-propeller full-scale open-water curve of a B-series propeller
 */
export function bSeriesShipOpenWater(propeller: BSeriesPropeller, advance: number): OpenWaterPoint {
  const model = bSeriesOpenWater(propeller, advance);
  const section = bSeriesBladeSection(propeller);
  const drag = propellerProfileDragIncrement(section, propeller.roughness);
  const solidity = (section.chord * propeller.blades) / propeller.diameter;
  const thrust = model.thrust - drag * 0.3 * propeller.pitchRatio * solidity;
  const torque = model.torque + drag * 0.25 * solidity;
  return { advance, thrust, torque, efficiency: torque > 0 ? (advance * thrust) / (2 * Math.PI * torque) : 0 };
}

/** Where a propeller runs to deliver a thrust at an inflow speed. */
export interface PropellerOperatingPoint extends OpenWaterPoint {
  /** Shaft speed, rev/s. */
  revolutions: number;
  /** Delivered power in open water, W. */
  power: number;
}

/**
 * The shaft speed at which a full-scale B-series propeller delivers `thrust` with inflow `advanceSpeed`: solves
 * `K_T(J)/J² = T/(ρ·D²·V_A²)` for `J` by bisection on the falling branch.
 * @capability marine-propeller propeller operating point for a required thrust
 */
export function propellerForThrust(propeller: BSeriesPropeller, thrust: number, advanceSpeed: number, density = 1025): PropellerOperatingPoint {
  const D = propeller.diameter;
  const target = thrust / (density * D * D * advanceSpeed * advanceSpeed);
  let low = 1e-3;
  let high = 2;
  while (high > low && bSeriesShipOpenWater(propeller, high).thrust > 0) high += 0.1;
  for (let i = 0; i < 200; i += 1) {
    const mid = 0.5 * (low + high);
    const point = bSeriesShipOpenWater(propeller, mid);
    if (point.thrust / (mid * mid) > target) low = mid;
    else high = mid;
  }
  const point = bSeriesShipOpenWater(propeller, 0.5 * (low + high));
  const revolutions = advanceSpeed / (point.advance * D);
  return { ...point, revolutions, power: 2 * Math.PI * revolutions * point.torque * density * revolutions * revolutions * D ** 5 };
}

/**
 * The pitch ratio that delivers `thrust` at `advanceSpeed` with the best open-water efficiency, searched over
 * `P/D` 0.5–1.4 (golden section on the efficiency of {@link propellerForThrust}).
 * @capability marine-propeller optimum-pitch propeller for a required thrust and diameter
 */
export function optimumPitchPropeller(propeller: Omit<BSeriesPropeller, "pitchRatio">, thrust: number, advanceSpeed: number, density = 1025): { propeller: BSeriesPropeller; point: PropellerOperatingPoint } {
  const efficiency = (pitchRatio: number) => propellerForThrust({ ...propeller, pitchRatio }, thrust, advanceSpeed, density).efficiency;
  let a = 0.5;
  let b = 1.4;
  const ratio = (Math.sqrt(5) - 1) / 2;
  let c = b - ratio * (b - a);
  let d = a + ratio * (b - a);
  for (let i = 0; i < 80; i += 1) {
    if (efficiency(c) > efficiency(d)) b = d;
    else a = c;
    c = b - ratio * (b - a);
    d = a + ratio * (b - a);
  }
  const best = { ...propeller, pitchRatio: 0.5 * (a + b) };
  return { propeller: best, point: propellerForThrust(best, thrust, advanceSpeed, density) };
}

/** A waterjet: an inlet in the hull bottom, a pump, and a nozzle. */
export interface Waterjet {
  /** Nozzle exit area, m². */
  nozzleArea: number;
  /** Inlet velocity over ship speed, `1 − w` (default `0.95`; the boundary layer the inlet swallows). */
  inletVelocityRatio?: number;
  /** Pump efficiency (default `0.9`). */
  pumpEfficiency?: number;
  /** Nozzle loss as a share of the jet's kinetic energy (default `0.02`). */
  nozzleLoss?: number;
  /** Inlet loss as a share of the inflow's kinetic energy (default `0.2`). */
  inletLoss?: number;
}

/** A waterjet's thrust at one speed and power. */
export interface WaterjetPoint {
  thrust: number;
  /** Jet velocity at the nozzle, m/s. */
  jetVelocity: number;
  /** Mass flow, kg/s. */
  massFlow: number;
  /** Thrust power over shaft power, `T·V/P`. */
  efficiency: number;
}

/**
 * Momentum theory of a waterjet: the pump lifts the swallowed flow from inlet to jet velocity,
 * `η_p·P = ṁ·((1 + k_n)·V_j²/2 − (1 − k_i)·V_in²/2)`, and the thrust is the momentum it adds, `T = ṁ·(V_j − V_in)`,
 * with `ṁ = ρ·A_n·V_j`. Solves the jet velocity for a shaft power by bisection.
 * @capability marine-propeller waterjet thrust from shaft power by momentum theory
 */
export function waterjetThrust(jet: Waterjet, power: number, speed: number, density = 1025): WaterjetPoint {
  const inflow = (jet.inletVelocityRatio ?? 0.95) * speed;
  const kn = jet.nozzleLoss ?? 0.02;
  const ki = jet.inletLoss ?? 0.2;
  const usable = (jet.pumpEfficiency ?? 0.9) * power;
  const absorbed = (vj: number) => density * jet.nozzleArea * vj * ((1 + kn) * 0.5 * vj * vj - (1 - ki) * 0.5 * inflow * inflow);
  let low = inflow * Math.sqrt((1 - ki) / (1 + kn));
  let high = Math.max(1, 2 * low);
  while (absorbed(high) < usable) high *= 2;
  for (let i = 0; i < 200; i += 1) {
    const mid = 0.5 * (low + high);
    if (absorbed(mid) < usable) low = mid;
    else high = mid;
  }
  const jetVelocity = 0.5 * (low + high);
  const massFlow = density * jet.nozzleArea * jetVelocity;
  const thrust = massFlow * (jetVelocity - inflow);
  return { thrust, jetVelocity, massFlow, efficiency: power > 0 ? (thrust * speed) / power : 0 };
}
