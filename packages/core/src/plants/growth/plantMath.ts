// Engines may round Math.sin, Math.exp and friends differently (bun's JSC against Chrome's V8), so a
// growth decision taken on one engine could flip on another. Every function here uses only + - * /,
// Math.sqrt and exact bit operations, which IEEE 754 fixes on every engine: the same input gives the
// same bits everywhere. Accuracy is about 1e-15 relative, far below anything a plant decision reads.

const LN2_HI = 6.93147180369123816490e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.44269504088896338700;
const PIO2_HI = 1.57079632673412561417;
const PIO2_LO = 6.07710050650619224932e-11;
const SQRT_HALF = 0.70710678118654752440;

/** π to double precision. */
export const PLANT_PI = 3.14159265358979311600;

const bits = new Float64Array(1);
const words = new Uint32Array(bits.buffer);
const HI = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 1 : 0;
/** 2^k for k = -1022..1023, built by exact doubling and halving. */
const POW2 = (() => {
  const table = new Float64Array(2046);
  table[1022] = 1;
  for (let k = 1; k <= 1023; k += 1) table[1022 + k] = (table[1021 + k] ?? 0) * 2;
  for (let k = 1; k <= 1022; k += 1) table[1022 - k] = (table[1023 - k] ?? 0) / 2;
  return table;
})();

function twoTo(k: number): number {
  return POW2[k + 1022] ?? 0;
}

/** 1/n! for n = 0..14, built by division once so every engine holds the same constants. */
const EXP_TAYLOR: readonly number[] = (() => {
  const out = [1];
  for (let n = 1; n <= 14; n += 1) out.push((out[n - 1] ?? 1) / n);
  return out;
})();

function roundHalfAway(x: number): number {
  return x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5);
}

/**
 * e^x, bit-identical on every JS engine.
 * @internal
 */
export function plantExp(x: number): number {
  if (x !== x) return x;
  if (x > 709) return Number.POSITIVE_INFINITY;
  if (x < -745) return 0;
  const k = roundHalfAway(x * INV_LN2);
  const r = x - k * LN2_HI - k * LN2_LO;
  let sum = EXP_TAYLOR[EXP_TAYLOR.length - 1] ?? 0;
  for (let n = EXP_TAYLOR.length - 2; n >= 0; n -= 1) sum = sum * r + (EXP_TAYLOR[n] ?? 0);
  if (k < -1021) return sum * twoTo(k + 54) * twoTo(-54);
  if (k > 1023) return sum * twoTo(k - 1) * 2;
  return sum * twoTo(k);
}

/**
 * Natural log, bit-identical on every JS engine. Returns NaN below 0 and -Infinity at 0.
 * @internal
 */
export function plantLog(x: number): number {
  if (x !== x || x < 0) return Number.NaN;
  if (x === 0) return Number.NEGATIVE_INFINITY;
  if (x === Number.POSITIVE_INFINITY) return x;
  let e = 0;
  let m = x;
  if (m < 2.2250738585072014e-308) {
    m *= 18014398509481984;
    e -= 54;
  }
  bits[0] = m;
  const hi = words[HI] ?? 0;
  e += ((hi >>> 20) & 0x7ff) - 1023;
  words[HI] = (hi & 0x000fffff) | 0x3ff00000;
  m = bits[0] ?? 1;
  if (m > 2 * SQRT_HALF) {
    m *= 0.5;
    e += 1;
  }
  const s = (m - 1) / (m + 1);
  const s2 = s * s;
  let term = s;
  let sum = 0;
  // s² ≤ 0.0295 here, so terms past s^23 fall under double precision.
  for (let n = 1; n <= 23; n += 2) {
    sum += term / n;
    term *= s2;
  }
  return 2 * sum + e * LN2_LO + e * LN2_HI;
}

/**
 * x^y for x > 0 (and x = 0, y > 0), bit-identical on every JS engine.
 * @internal
 */
export function plantPow(x: number, y: number): number {
  if (y === 0) return 1;
  if (x === 0) return y > 0 ? 0 : Number.POSITIVE_INFINITY;
  if (y === 1) return x;
  if (y === 2) return x * x;
  if (y === 0.5) return Math.sqrt(x);
  return plantExp(y * plantLog(x));
}

function sinKernel(r: number): number {
  const r2 = r * r;
  let term = r;
  let sum = r;
  for (let n = 2; n <= 22; n += 2) {
    term = (-term * r2) / (n * (n + 1));
    sum += term;
  }
  return sum;
}

function cosKernel(r: number): number {
  const r2 = r * r;
  let term = 1;
  let sum = 1;
  for (let n = 1; n <= 22; n += 2) {
    term = (-term * r2) / (n * (n + 1));
    sum += term;
  }
  return sum;
}

function quadrant(x: number): { q: number; r: number } {
  const k = roundHalfAway(x / (PIO2_HI + PIO2_LO));
  return { q: ((k % 4) + 4) % 4, r: x - k * PIO2_HI - k * PIO2_LO };
}

/**
 * sin x, bit-identical on every JS engine (accurate for |x| up to about 1e6).
 * @internal
 */
export function plantSin(x: number): number {
  const { q, r } = quadrant(x);
  if (q === 0) return sinKernel(r);
  if (q === 1) return cosKernel(r);
  if (q === 2) return -sinKernel(r);
  return -cosKernel(r);
}

/**
 * cos x, bit-identical on every JS engine (accurate for |x| up to about 1e6).
 * @internal
 */
export function plantCos(x: number): number {
  const { q, r } = quadrant(x);
  if (q === 0) return cosKernel(r);
  if (q === 1) return -sinKernel(r);
  if (q === 2) return -cosKernel(r);
  return sinKernel(r);
}

function atanSmall(x: number): number {
  const x2 = x * x;
  let term = x;
  let sum = 0;
  // s² ≤ 0.0295 here, so terms past s^23 fall under double precision.
  for (let n = 1; n <= 23; n += 2) {
    sum += term / n;
    term *= -x2;
  }
  return sum;
}

/**
 * atan x, bit-identical on every JS engine.
 * @internal
 */
export function plantAtan(x: number): number {
  if (x !== x) return x;
  const negative = x < 0;
  let a = negative ? -x : x;
  let offset = 0;
  if (a > 1) {
    a = 1 / a;
    offset = PIO2_HI + PIO2_LO;
  }
  // atan(a) = 2·atan(a / (1 + sqrt(1 + a²))), twice, brings a under 0.2 so the series converges fast.
  const halved = a / (1 + Math.sqrt(1 + a * a));
  const quartered = halved / (1 + Math.sqrt(1 + halved * halved));
  let result = 4 * atanSmall(quartered);
  if (offset !== 0) result = offset - result;
  return negative ? -result : result;
}

/**
 * atan2(y, x), bit-identical on every JS engine.
 * @internal
 */
export function plantAtan2(y: number, x: number): number {
  if (x > 0) return plantAtan(y / x);
  if (x < 0) return y >= 0 ? plantAtan(y / x) + PLANT_PI : plantAtan(y / x) - PLANT_PI;
  if (y > 0) return PLANT_PI / 2;
  if (y < 0) return -PLANT_PI / 2;
  return 0;
}

/**
 * acos x for x in [-1, 1], bit-identical on every JS engine.
 * @internal
 */
export function plantAcos(x: number): number {
  const c = x > 1 ? 1 : x < -1 ? -1 : x;
  return plantAtan2(Math.sqrt((1 - c) * (1 + c)), c);
}
