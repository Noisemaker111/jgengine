// @skill jgengine-world
/**
 * Measurements that check a simulated landscape against laws read off real ones:
 *
 * - Flint's law (Flint 1974): channel slope falls with drainage area as S = k_s A^(−θ), concavity θ
 *   about 0.4–0.6 in real rivers (Whipple 2004); at steady state the stream-power law predicts θ = m/n
 *   and k_s = (U/K)^(1/n).
 * - Hack's law (Hack 1957): main-stream length grows with area as L ∝ A^h, h about 0.5–0.6 (Rigon et
 *   al. 1996).
 *
 * @capability landform-evolution grow a heightfield from uplift, river incision, hillslopes, landslides, sediment and rock strata
 */
import { plantExp, plantLog } from "../../plants/growth/plantMath";
import type { FlowRouting } from "../flow/flowRouting";

/** A least-squares power law y = coefficient · x^exponent fitted in log space. */
export interface PowerLawFit {
  exponent: number;
  coefficient: number;
  /** Coefficient of determination of the log-log fit. */
  r2: number;
  /** Points fitted. */
  count: number;
}

/**
 * Fit y = c · x^e by least squares on log x, log y over the points where both are positive.
 * @capability landform-evolution grow a heightfield from uplift, river incision, hillslopes, landslides, sediment and rock strata
 */
export function fitPowerLaw(x: ArrayLike<number>, y: ArrayLike<number>): PowerLawFit {
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i += 1) {
    const xi = x[i] ?? 0;
    const yi = y[i] ?? 0;
    if (!(xi > 0) || !(yi > 0)) continue;
    const lx = plantLog(xi);
    const ly = plantLog(yi);
    n += 1;
    sx += lx;
    sy += ly;
    sxx += lx * lx;
    sxy += lx * ly;
    syy += ly * ly;
  }
  if (n < 2) return { exponent: 0, coefficient: 0, r2: 0, count: n };
  const vx = sxx - (sx * sx) / n;
  const vy = syy - (sy * sy) / n;
  const cov = sxy - (sx * sy) / n;
  const exponent = vx > 0 ? cov / vx : 0;
  const intercept = (sy - exponent * sx) / n;
  return { exponent, coefficient: plantExp(intercept), r2: vx > 0 && vy > 0 ? (cov * cov) / (vx * vy) : 0, count: n };
}

/**
 * Length in metres of the longest flow path from a divide down to each cell.
 * @capability landform-evolution grow a heightfield from uplift, river incision, hillslopes, landslides, sediment and rock strata
 */
export function upstreamLength(routing: FlowRouting): Float64Array {
  const { stack, receiver, receiverDistance } = routing;
  const length = new Float64Array(stack.length);
  for (let s = stack.length - 1; s >= 0; s -= 1) {
    const i = stack[s] ?? 0;
    const r = receiver[i] ?? i;
    if (r === i) continue;
    const reach = (length[i] ?? 0) + (receiverDistance[i] ?? 0);
    if (reach > (length[r] ?? 0)) length[r] = reach;
  }
  return length;
}

/** Which cells count as channels: drainage area in m² at least `minArea`, on land, not at an outlet. */
export interface ChannelSelection {
  minArea: number;
  /** Largest area to include; default unbounded. */
  maxArea?: number;
}

function channelCells(routing: FlowRouting, height: ArrayLike<number>, selection: ChannelSelection): number[] {
  const { receiver, area, water } = routing;
  const out: number[] = [];
  const maxArea = selection.maxArea ?? Number.POSITIVE_INFINITY;
  for (let i = 0; i < receiver.length; i += 1) {
    const a = area[i] ?? 0;
    if (receiver[i] === i || a < selection.minArea || a > maxArea) continue;
    if ((water[i] ?? 0) > (height[i] ?? 0)) continue;
    out.push(i);
  }
  return out;
}

/**
 * Flint's slope–area law over channel cells: exponent −θ (θ the concavity) and coefficient k_s (the
 * steepness index).
 * @capability landform-evolution grow a heightfield from uplift, river incision, hillslopes, landslides, sediment and rock strata
 */
export function slopeAreaFit(routing: FlowRouting, height: ArrayLike<number>, selection: ChannelSelection): PowerLawFit & { concavity: number } {
  const { receiver, receiverDistance, area } = routing;
  const cells = channelCells(routing, height, selection);
  const x: number[] = [];
  const y: number[] = [];
  for (const i of cells) {
    const r = receiver[i] ?? i;
    x.push(area[i] ?? 0);
    y.push(((height[i] ?? 0) - (height[r] ?? 0)) / (receiverDistance[i] ?? 1));
  }
  const fit = fitPowerLaw(x, y);
  return { ...fit, concavity: -fit.exponent };
}

/**
 * Hack's law over channel cells: longest upstream length against drainage area; `exponent` is h.
 * @capability landform-evolution grow a heightfield from uplift, river incision, hillslopes, landslides, sediment and rock strata
 */
export function hackLawFit(routing: FlowRouting, height: ArrayLike<number>, selection: ChannelSelection): PowerLawFit {
  const length = upstreamLength(routing);
  const cells = channelCells(routing, height, selection);
  return fitPowerLaw(
    cells.map((i) => routing.area[i] ?? 0),
    cells.map((i) => length[i] ?? 0),
  );
}
