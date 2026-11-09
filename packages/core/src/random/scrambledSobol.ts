// Owen-scrambled 2D Sobol points: a progressive spread where every prefix is even and none is a lattice.

function reverseBits(x: number): number {
  x = ((x >>> 1) & 0x55555555) | ((x & 0x55555555) << 1);
  x = ((x >>> 2) & 0x33333333) | ((x & 0x33333333) << 2);
  x = ((x >>> 4) & 0x0f0f0f0f) | ((x & 0x0f0f0f0f) << 4);
  x = ((x >>> 8) & 0x00ff00ff) | ((x & 0x00ff00ff) << 8);
  return ((x >>> 16) | (x << 16)) >>> 0;
}

/** Laine and Karras' hash, which scrambles each bit by the bits below it. */
function laineKarras(x: number, seed: number): number {
  x = (x + seed) >>> 0;
  x = (x ^ Math.imul(x, 0x6c50b47c)) >>> 0;
  x = (x ^ Math.imul(x, 0xb82f1e52)) >>> 0;
  x = (x ^ Math.imul(x, 0xc7afe638)) >>> 0;
  x = (x ^ Math.imul(x, 0x8d22f6e6)) >>> 0;
  return x;
}

/** Nested uniform (Owen) scramble of a 32-bit fixed-point coordinate: each bit is flipped by a hash of the bits above it. */
function owenScramble(x: number, seed: number): number {
  return reverseBits(laineKarras(reverseBits(x), seed));
}

/** Sobol's second dimension; the first is the bit-reversed index. */
function sobolSecond(index: number): number {
  let x = 0;
  let v = 0x80000000;
  for (let i = index >>> 0; i > 0; i >>>= 1) {
    if ((i & 1) !== 0) x ^= v;
    v = (v ^ (v >>> 1)) >>> 0;
  }
  return x >>> 0;
}

/**
 * Point `index` (0, 1, 2, ...) of a 2D Sobol sequence Owen-scrambled by two 32-bit seeds, in [0, 1)².
 * Every prefix is spread evenly (each first 2^m points fill every 1/2^m-area box of a net once), so
 * thinning a field to its first n points never opens holes; unlike R2 or another rank-1 lattice, no
 * prefix lines up in rows, because the scramble breaks the sequence's digit structure. One seed pair
 * per field or cell gives that field its own independent spread (Burley 2020, "Practical Hash-based
 * Owen Scrambling").
 */
export function scrambledSobol2(index: number, seedX: number, seedY: number): [number, number] {
  return [owenScramble(reverseBits(index >>> 0), seedX >>> 0) / 4294967296, owenScramble(sobolSecond(index), seedY >>> 0) / 4294967296];
}
