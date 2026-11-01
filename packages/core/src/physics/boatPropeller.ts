/** One B-series polynomial term: coefficient and the powers of `J`, `P/D`, `A_E/A_0` and `Z`. */
type BSeriesTerm = readonly [number, number, number, number, number];

// Oosterveld and van Oossanen (1975), Table 1: K_T and K_Q of the Wageningen B-screw series at Re = 2·10⁶.
const KT_TERMS: readonly BSeriesTerm[] = [
  [0.00880496, 0, 0, 0, 0], [-0.204554, 1, 0, 0, 0], [0.166351, 0, 1, 0, 0], [0.158114, 0, 2, 0, 0], [-0.147581, 2, 0, 1, 0],
  [-0.481497, 1, 1, 1, 0], [0.415437, 0, 2, 1, 0], [0.0144043, 0, 0, 0, 1], [-0.0530054, 2, 0, 0, 1], [0.0143481, 0, 1, 0, 1],
  [0.0606826, 1, 1, 0, 1], [-0.0125894, 0, 0, 1, 1], [0.0109689, 1, 0, 1, 1], [-0.133698, 0, 3, 0, 0], [0.00638407, 0, 6, 0, 0],
  [-0.00132718, 2, 6, 0, 0], [0.168496, 3, 0, 1, 0], [-0.0507214, 0, 0, 2, 0], [0.0854559, 2, 0, 2, 0], [-0.0504475, 3, 0, 2, 0],
  [0.010465, 1, 6, 2, 0], [-0.00648272, 2, 6, 2, 0], [-0.00841728, 0, 3, 0, 1], [0.0168424, 1, 3, 0, 1], [-0.00102296, 3, 3, 0, 1],
  [-0.0317791, 0, 3, 1, 1], [0.018604, 1, 0, 2, 1], [-0.00410798, 0, 2, 2, 1], [-0.000606848, 0, 0, 0, 2], [-0.0049819, 1, 0, 0, 2],
  [0.0025983, 2, 0, 0, 2], [-0.000560528, 3, 0, 0, 2], [-0.00163652, 1, 2, 0, 2], [-0.000328787, 1, 6, 0, 2], [0.000116502, 2, 6, 0, 2],
  [0.000690904, 0, 0, 1, 2], [0.00421749, 0, 3, 1, 2], [0.0000565229, 3, 6, 1, 2], [-0.00146564, 0, 3, 2, 2],
];

const KQ_TERMS: readonly BSeriesTerm[] = [
  [0.00379368, 0, 0, 0, 0], [0.00886523, 2, 0, 0, 0], [-0.032241, 1, 1, 0, 0], [0.00344778, 0, 2, 0, 0], [-0.0408811, 0, 1, 1, 0],
  [-0.108009, 1, 1, 1, 0], [-0.0885381, 2, 1, 1, 0], [0.188561, 0, 2, 1, 0], [-0.00370871, 1, 0, 0, 1], [0.00513696, 0, 1, 0, 1],
  [0.0209449, 1, 1, 0, 1], [0.00474319, 2, 1, 0, 1], [-0.00723408, 2, 0, 1, 1], [0.00438388, 1, 1, 1, 1], [-0.0269403, 0, 2, 1, 1],
  [0.0558082, 3, 0, 1, 0], [0.0161886, 0, 3, 1, 0], [0.00318086, 1, 3, 1, 0], [0.015896, 0, 0, 2, 0], [0.0471729, 1, 0, 2, 0],
  [0.0196283, 3, 0, 2, 0], [-0.0502782, 0, 1, 2, 0], [-0.030055, 3, 1, 2, 0], [0.0417122, 2, 2, 2, 0], [-0.0397722, 0, 3, 2, 0],
  [-0.00350024, 0, 6, 2, 0], [-0.0106854, 3, 0, 0, 1], [0.00110903, 3, 3, 0, 1], [-0.000313912, 0, 6, 0, 1], [0.0035985, 3, 0, 1, 1],
  [-0.00142121, 0, 6, 1, 1], [-0.00383637, 1, 0, 2, 1], [0.0126803, 0, 2, 2, 1], [-0.00318278, 2, 3, 2, 1], [0.00334268, 0, 6, 2, 1],
  [-0.00183491, 1, 1, 0, 2], [0.000112451, 3, 2, 0, 2], [-0.0000297228, 3, 6, 0, 2], [0.000269551, 1, 0, 1, 2], [0.00083265, 2, 0, 1, 2],
  [0.00155334, 0, 2, 1, 2], [0.000302683, 0, 6, 1, 2], [-0.0001843, 0, 0, 2, 2], [-0.000425399, 0, 3, 2, 2], [0.0000869243, 3, 3, 2, 2],
  [-0.0004659, 0, 6, 2, 2], [0.0000554194, 1, 6, 2, 2],
];

/** A propeller's open-water curve: a Wageningen B-series screw, or a polynomial in the advance ratio `J`. */
export type PropellerOpenWater =
  | {
      kind: "bseries";
      /** Blades, 2–7. */
      blades: number;
      /** Expanded blade-area ratio `A_E/A_0`, 0.3–1.05. */
      areaRatio: number;
      /** Pitch–diameter ratio, 0.5–1.4. */
      pitchRatio: number;
      /** Apply the ITTC-1978 model-to-full-scale correction at this blade roughness, m (omit for the model-scale series). */
      fullScaleRoughness?: number;
    }
  | {
      kind: "polynomial";
      /** `K_T = k0 + k1·J + k2·J²`. */
      thrust: readonly [number, number, number];
      /** `K_Q = q0 + q1·J + q2·J²`; needed for a power-limited engine. */
      torque?: readonly [number, number, number];
    };

/** What turns the propeller: a governor holding `throttle · maxRevs`, or an engine of `maxPower` limited to `maxRevs`. */
export interface BoatEngine {
  /** Largest propeller shaft speed, rev/s. */
  maxRevs: number;
  /** Largest power delivered to the propeller, W; with it, throttle sets the power share and the propeller's torque sets the revs. */
  maxPower?: number;
}

/**
 * A screw propeller and its engine, the `propeller` effect of `boatDynamics`: thrust `(1 − t)·ρn²D⁴·K_T(J)` at the
 * advance ratio `J = u·(1 − w)/(n·D)`, so top speed and acceleration follow from engine and propeller instead of a thrust
 * law.
 */
export interface BoatPropeller {
  /** Multiplier on the effect: `0` off (the simple model's term), `1` exactly as the reference measures it (default), past `1` stronger; sane over `0..4`. */
  strength?: number;
  /** Diameter, m. */
  diameter: number;
  openWater: PropellerOpenWater;
  /** Propellers on the boat, sharing the engine power equally (default `1`). */
  count?: number;
  /** Effective wake fraction in straight running `w` (default `0`). */
  wake?: number;
  /** Thrust deduction `t` (default `0`). */
  thrustDeduction?: number;
  /** MMG wake change with inflow angle: `(1 − w)/(1 − w0) = 1 + (1 − e^(−c1·|β_P|))·(c2 − 1)`, `c2` per sign of `β_P`. */
  wakeChange?: { c1: number; c2Positive: number; c2Negative: number };
  /** Longitudinal position over the length from midship, negative aft (default `-0.48`). */
  position?: number;
  engine: BoatEngine;
  /** Astern thrust as a share of the ahead bollard thrust at full revs (default `0.4`). */
  reverseScale?: number;
}

/** A propeller's open-water curve reduced to cubics in `J`, ready to evaluate. */
export interface PreparedOpenWater {
  /** `K_T` at an advance ratio. */
  thrust(advance: number): number;
  /** `K_Q` at an advance ratio, or `undefined` when the curve has no torque. */
  torque: ((advance: number) => number) | undefined;
}

function collapse(terms: readonly BSeriesTerm[], pitchRatio: number, areaRatio: number, blades: number): [number, number, number, number] {
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (const [c, s, t, u, v] of terms) out[s] = (out[s] ?? 0) + c * pitchRatio ** t * areaRatio ** u * blades ** v;
  return out;
}

/**
 * Reduces an open-water description to cubics in `J`: the B-series polynomials with pitch, area ratio and blades fixed
 * (plus the ITTC-1978 correction `K_T −= ΔC_D·0.3·(P/D)·(cZ/D)`, `K_Q += ΔC_D·0.25·(cZ/D)` when full scale), or the given
 * polynomial.
 * @capability boat-propeller Wageningen B-series and polynomial open-water curves (K_T, K_Q against advance ratio)
 */
export function prepareOpenWater(openWater: PropellerOpenWater, diameter: number): PreparedOpenWater {
  if (openWater.kind === "polynomial") {
    const [k0, k1, k2] = openWater.thrust;
    const torque = openWater.torque;
    return {
      thrust: (j) => k0 + k1 * j + k2 * j * j,
      torque: torque === undefined ? undefined : (j) => torque[0] + torque[1] * j + torque[2] * j * j,
    };
  }
  const { pitchRatio, areaRatio, blades } = openWater;
  const kt = collapse(KT_TERMS, pitchRatio, areaRatio, blades);
  const kq = collapse(KQ_TERMS, pitchRatio, areaRatio, blades);
  const roughness = openWater.fullScaleRoughness;
  if (roughness !== undefined) {
    const chord = (2.073 * areaRatio * diameter) / blades;
    const thickness = ((0.0185 - 0.00125 * blades) * diameter) / chord;
    const drag = (2 + 4 * thickness) * (0.003605 - (1.89 + 1.62 * Math.log10(chord / roughness)) ** -2.5);
    const solidity = (chord * blades) / diameter;
    kt[0] -= drag * 0.3 * pitchRatio * solidity;
    kq[0] += drag * 0.25 * solidity;
  }
  return {
    thrust: (j) => kt[0] + j * (kt[1] + j * (kt[2] + j * kt[3])),
    torque: (j) => kq[0] + j * (kq[1] + j * (kq[2] + j * kq[3])),
  };
}

/** Where the propeller runs this instant. */
export interface PropellerPoint {
  /** Shaft speed, rev/s. */
  revs: number;
  /** Advance ratio. */
  advance: number;
  /** Open-water thrust of all propellers, N (before thrust deduction; negative astern). */
  thrust: number;
  /** Power absorbed, W (`0` when the curve has no torque). */
  power: number;
  /** Share of the engine's limit in use, `0..1`. */
  load: number;
}

/**
 * The propeller's operating point at an inflow speed (`u·(1 − w)`, m/s) and throttle: revs from the governor, or from
 * the power balance `2πρn³D⁵·K_Q(J) = throttle·P` capped at `maxRevs`; astern, a share of the bollard thrust.
 * @capability boat-propeller propeller operating point from engine power or governed revs
 */
export function propellerPoint(propeller: BoatPropeller, curve: PreparedOpenWater, inflow: number, throttle: number, reverse: number, density: number): PropellerPoint {
  const D = propeller.diameter;
  const count = propeller.count ?? 1;
  const { maxRevs, maxPower } = propeller.engine;
  const torqueAt = curve.torque;
  const absorbed = (n: number) => (torqueAt === undefined || n <= 0 ? 0 : count * 2 * Math.PI * density * n * n * n * D ** 5 * torqueAt(inflow / (n * D)));
  if (reverse > 0 && throttle <= 0) {
    const bollard = count * density * maxRevs * maxRevs * D ** 4 * curve.thrust(0);
    return { revs: -reverse * maxRevs, advance: 0, thrust: -reverse * (propeller.reverseScale ?? 0.4) * bollard, power: 0, load: reverse };
  }
  let revs = Math.max(0, Math.min(1, throttle)) * maxRevs;
  let load = Math.max(0, Math.min(1, throttle));
  if (maxPower !== undefined && torqueAt !== undefined && throttle > 0) {
    const target = Math.min(1, throttle) * maxPower;
    if (absorbed(maxRevs) <= target) {
      revs = maxRevs;
      load = absorbed(maxRevs) / maxPower;
    } else {
      let low = 0;
      let high = maxRevs;
      for (let i = 0; i < 40; i += 1) {
        const mid = 0.5 * (low + high);
        if (absorbed(mid) < target) low = mid;
        else high = mid;
      }
      revs = 0.5 * (low + high);
      load = Math.min(1, throttle);
    }
  }
  if (revs <= 1e-9) return { revs: 0, advance: 0, thrust: 0, power: 0, load: 0 };
  const advance = inflow / (revs * D);
  return { revs, advance, thrust: count * density * revs * revs * D ** 4 * curve.thrust(advance), power: absorbed(revs), load };
}
