/**
 * Test-only: run code under a simulated "other libm".
 *
 * JavaScript leaves `Math.sin`, `cos`, `pow`, `atan2`... implementation-approximated: a Bun host calls the
 * platform libm (glibc releases differ: newer ones round several functions correctly), and every browser ships
 * its own. Results agree to within an ulp or so, never bit for bit. A seeded generator whose output must be the
 * same on every machine may therefore never let a last-bit difference flip a discrete decision (a branch, a
 * sort order, a count).
 *
 * `withOtherLibm` swaps the transcendental `Math` functions for wrappers that move most inexact results by one
 * ulp, up or down, chosen by a hash of the arguments and `salt`: a consistent, deterministic "other libm".
 * `Math.sqrt` (IEEE-exact everywhere) and results every libm returns exactly (integers, the multiples of pi/4
 * that `atan2` hits on exact inputs) stay untouched. Compare a generator's output rounded far above an ulp
 * (`roundedFingerprint`) with and without the swap: a mismatch is a decision that hangs on the platform.
 */
const PERTURBED = [
  "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "sinh", "cosh", "tanh", "asinh", "acosh", "atanh",
  "exp", "expm1", "log", "log1p", "log2", "log10", "pow", "cbrt", "hypot",
] as const satisfies readonly (keyof Math)[];

type MathFn = (...args: number[]) => number;

const buffer = new DataView(new ArrayBuffer(8));

function nextUlp(value: number, up: boolean): number {
  buffer.setFloat64(0, value);
  const bits = buffer.getBigUint64(0);
  // Moving away from zero increments the magnitude bits; toward zero decrements them.
  const away = up === value > 0;
  buffer.setBigUint64(0, away ? bits + 1n : bits - 1n);
  return buffer.getFloat64(0);
}

function argsHash(args: readonly number[], salt: number): number {
  let h = (0x811c9dc5 ^ salt) >>> 0;
  for (const arg of args) {
    buffer.setFloat64(0, arg);
    for (let i = 0; i < 8; i += 1) h = Math.imul(h ^ buffer.getUint8(i), 0x01000193) >>> 0;
  }
  return h;
}

const EXACT = new Set([Math.PI, Math.PI / 2, Math.PI / 4, (3 * Math.PI) / 4].flatMap((v) => [v, -v]));

/** A finite double as an exact dyadic `mantissa * 2^exponent`. */
function dyadic(value: number): { mantissa: bigint; exponent: bigint } {
  buffer.setFloat64(0, value);
  const bits = buffer.getBigUint64(0);
  const biased = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & 0xfffffffffffffn;
  const sign = bits >> 63n === 1n ? -1n : 1n;
  return biased === 0
    ? { mantissa: sign * fraction, exponent: -1074n }
    : { mantissa: sign * (fraction | 0x10000000000000n), exponent: BigInt(biased - 1075) };
}

/** Exact `a == b` for dyadic rationals. */
function dyadicEqual(a: { mantissa: bigint; exponent: bigint }, b: { mantissa: bigint; exponent: bigint }): boolean {
  const shift = a.exponent - b.exponent;
  return shift >= 0n ? a.mantissa << shift === b.mantissa : a.mantissa === b.mantissa << -shift;
}

function dyadicPow(value: { mantissa: bigint; exponent: bigint }, n: bigint): { mantissa: bigint; exponent: bigint } {
  return { mantissa: value.mantissa ** n, exponent: value.exponent * n };
}

/** True when the mathematically exact result is a double, which every libm returns as is. */
function exactlyRepresented(name: string, args: readonly number[], result: number): boolean {
  if (!Number.isFinite(result) || Number.isInteger(result) || EXACT.has(result)) return true;
  // Tiny arguments: sin, tan, atan, sinh, expm1, log1p... return the argument itself everywhere.
  if (args.length === 1 && result === args[0]) return true;
  const r = dyadic(result);
  if (name === "cbrt") return dyadicEqual(dyadicPow(r, 3n), dyadic(args[0]!));
  if (name === "hypot" && args.length === 2 && args.every(Number.isFinite)) {
    const [x, y] = [dyadicPow(dyadic(args[0]!), 2n), dyadicPow(dyadic(args[1]!), 2n)];
    const e = x.exponent < y.exponent ? x.exponent : y.exponent;
    const sum = { mantissa: (x.mantissa << (x.exponent - e)) + (y.mantissa << (y.exponent - e)), exponent: e };
    return dyadicEqual(dyadicPow(r, 2n), sum);
  }
  if (name === "pow") {
    const [x, y] = args as [number, number];
    if (!Number.isInteger(y) || Math.abs(y) > 64 || !Number.isFinite(x) || x === 0) return false;
    if (y >= 0) return dyadicEqual(dyadicPow(dyadic(x), BigInt(y)), r);
    // x^-n exact: r * x^n == 1.
    const xn = dyadicPow(dyadic(x), BigInt(-y));
    return dyadicEqual({ mantissa: r.mantissa * xn.mantissa, exponent: r.exponent + xn.exponent }, { mantissa: 1n, exponent: 0n });
  }
  return false;
}

/**
 * Runs `body` with `Math`'s transcendental functions moved by one ulp per call, deterministically by `salt`;
 * restores them afterwards, even on a throw.
 * @internal test fixture, not engine API.
 */
export function withOtherLibm<T>(salt: number, body: () => T): T {
  const math = Math as unknown as Record<string, MathFn>;
  const original = new Map<string, MathFn>();
  for (const name of PERTURBED) {
    const fn = math[name]!;
    original.set(name, fn);
    math[name] = (...args: number[]): number => {
      const result = fn(...args);
      if (exactlyRepresented(name, args, result)) return result;
      const h = argsHash(args, salt);
      // A quarter of results stay as they were, like a libm that mostly agrees.
      if ((h & 3) === 0) return result;
      return nextUlp(result, (h & 4) !== 0);
    };
  }
  try {
    return body();
  } finally {
    for (const [name, fn] of original) math[name] = fn;
  }
}

/**
 * A hash of `value`'s JSON with every number rounded to 1e-4: far above an ulp, far below a visible change.
 * @internal test fixture, not engine API.
 */
export function roundedFingerprint(value: unknown): string {
  const json = JSON.stringify(value, (_key, n: unknown) => (typeof n === "number" ? Math.round(n * 1e4) / 1e4 : n)) ?? "";
  // Two independent 32-bit FNV-1a lanes: plenty for telling outputs apart, no node:crypto in a src file.
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ json.length;
  for (let i = 0; i < json.length; i += 1) {
    const c = json.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}
