import { describe, expect, test } from "bun:test";

import { breakageProbability, fitGaudinSchuhmann, fitRosinRammler, fitT10, gaudinSchuhmann, jkT10, passingFraction, rosinRammler, t10 } from "./fragmentSize";

/** Fragments whose cumulative passing follows `cdf` exactly, one per size step. */
function sampled(cdf: (x: number) => number, sizes: readonly number[]): { sizes: number[]; masses: number[] } {
  const masses: number[] = [];
  let before = 0;
  for (const x of sizes) {
    const p = cdf(x);
    masses.push(p - before);
    before = p;
  }
  return { sizes: [...sizes], masses };
}

describe("fragment size laws", () => {
  test("passing fraction and t10 read the mass below a sieve", () => {
    const fragments = { sizes: [0.001, 0.004, 0.02, 0.05], masses: [1, 1, 2, 4] };
    expect(passingFraction(fragments, 0.005)).toBeCloseTo(0.25, 12);
    expect(t10(fragments, 0.05)).toBeCloseTo(25, 10);
  });

  test("a Rosin–Rammler sample fits back its scale and spread", () => {
    const sizes = Array.from({ length: 30 }, (_, i) => 0.001 * 1.25 ** i);
    sizes.push(1e3);
    const fit = fitRosinRammler(sampled((x) => rosinRammler(x, 0.02, 1.3), sizes));
    expect(fit.scale).toBeCloseTo(0.02, 6);
    expect(fit.spread).toBeCloseTo(1.3, 6);
    expect(fit.r2).toBeGreaterThan(0.9999);
  });

  test("a Gaudin–Schuhmann sample fits back its top size and slope", () => {
    const sizes = Array.from({ length: 20 }, (_, i) => 0.05 * 0.8 ** (19 - i));
    const fit = fitGaudinSchuhmann(sampled((x) => gaudinSchuhmann(x, 0.05, 0.7), sizes), 1);
    expect(fit.maxSize).toBeCloseTo(0.05, 6);
    expect(fit.exponent).toBeCloseTo(0.7, 6);
  });

  test("the JKMRC fit recovers A and b from drop-weight points", () => {
    const energies = [0.1, 0.25, 0.4, 1, 2.5];
    const fit = fitT10(energies, energies.map((e) => jkT10(e, 62, 0.85)));
    expect(fit.a).toBeCloseTo(62, 2);
    expect(fit.b).toBeCloseTo(0.85, 3);
    expect(fit.r2).toBeGreaterThan(0.99999);
  });

  test("Vogel–Peukert: nothing breaks below the threshold, and a larger particle breaks more often at the same energy", () => {
    expect(breakageProbability(5, 0.05, 0.6, 10)).toBe(0);
    const small = breakageProbability(40, 0.02, 0.6, 0.04 / 0.02);
    const large = breakageProbability(40, 0.2, 0.6, 0.04 / 0.2);
    expect(large).toBeGreaterThan(small);
    expect(breakageProbability(40, 0.05, 0.6, 2, 3)).toBeGreaterThan(breakageProbability(40, 0.05, 0.6, 2, 1));
  });
});
