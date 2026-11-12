/**
 * Small descriptive statistics over plain number lists: mean, linearly interpolated quantiles and
 * Spearman rank correlation. Non-finite entries are ignored, and an empty input gives `NaN` rather
 * than throwing, so a metric over "no corners" or "no buildings" reads as missing, not as zero.
 */

function finite(values: readonly number[]): number[] {
  return values.filter((value) => Number.isFinite(value));
}

/** Arithmetic mean of the finite entries; `NaN` when there are none. */
export function mean(values: readonly number[]): number {
  const kept = finite(values);
  if (kept.length === 0) return Number.NaN;
  let total = 0;
  for (const value of kept) total += value;
  return total / kept.length;
}

/** Quantile `q` (0..1) of the finite entries, linearly interpolated between order statistics; `NaN` when empty. */
export function quantile(values: readonly number[], q: number): number {
  const sorted = finite(values).sort((a, b) => a - b);
  if (sorted.length === 0) return Number.NaN;
  const at = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

/** Population coefficient of variation (standard deviation over mean); `NaN` when empty or the mean is 0. */
export function coefficientOfVariation(values: readonly number[]): number {
  const kept = finite(values);
  const m = mean(kept);
  if (!Number.isFinite(m) || m === 0) return Number.NaN;
  let sum = 0;
  for (const value of kept) sum += (value - m) ** 2;
  return Math.sqrt(sum / kept.length) / m;
}

/** Fractional ranks (ties share their mean rank), 0-based. */
function ranks(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value || a.index - b.index);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]!.value === order[i]!.value) j += 1;
    for (let k = i; k <= j; k += 1) out[order[k]!.index] = (i + j) / 2;
    i = j + 1;
  }
  return out;
}

/**
 * Spearman rank correlation of paired samples (pairs with a non-finite side are dropped):
 * +1 when `y` rises with `x`, −1 when it falls, `NaN` with fewer than two pairs or no spread.
 */
export function spearman(x: readonly number[], y: readonly number[]): number {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
    if (Number.isFinite(x[i]) && Number.isFinite(y[i])) {
      xs.push(x[i]!);
      ys.push(y[i]!);
    }
  }
  if (xs.length < 2) return Number.NaN;
  const rx = ranks(xs);
  const ry = ranks(ys);
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < rx.length; i += 1) {
    num += (rx[i]! - mx) * (ry[i]! - my);
    dx += (rx[i]! - mx) ** 2;
    dy += (ry[i]! - my) ** 2;
  }
  return dx === 0 || dy === 0 ? Number.NaN : num / Math.sqrt(dx * dy);
}
