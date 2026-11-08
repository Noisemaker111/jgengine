import { expect, test } from "bun:test";

import { scrambledSobol2 } from "@jgengine/core/random/scrambledSobol";

test("every first 2^m points of a scrambled Sobol spread fill each box of every 2^m-box grid once", () => {
  for (const [seedX, seedY] of [[0, 0], [12345, 678], [0xdeadbeef, 0x9e3779b9]] as const) {
    for (const m of [2, 4, 6]) {
      const count = 2 ** m;
      const points = Array.from({ length: count }, (_, i) => scrambledSobol2(i, seedX, seedY));
      // Every split of the 2^m boxes into 2^k columns by 2^(m-k) rows.
      for (let k = 0; k <= m; k += 1) {
        const columns = 2 ** k, rows = 2 ** (m - k);
        const filled = new Set(points.map(([x, y]) => Math.floor(x * columns) * rows + Math.floor(y * rows)));
        expect(filled.size).toBe(count);
      }
    }
  }
});

test("different seeds give different spreads, the same seeds the same one", () => {
  expect(scrambledSobol2(5, 1, 2)).toEqual(scrambledSobol2(5, 1, 2));
  expect(scrambledSobol2(5, 1, 2)).not.toEqual(scrambledSobol2(5, 3, 2));
  for (let i = 0; i < 64; i += 1) for (const v of scrambledSobol2(i, 99, 7)) expect(v >= 0 && v < 1).toBe(true);
});
