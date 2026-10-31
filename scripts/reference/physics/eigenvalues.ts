import { matrixEigenvalues, type Eigenvalue } from "@jgengine/core/math/linearAlgebra";

/**
 * Roots of the real polynomial `c[0] + c[1]·λ + … + c[n]·λⁿ` (`c[n] ≠ 0`): the companion-matrix eigenvalues, then two
 * Newton steps on the polynomial itself to recover full double precision.
 * @capability polynomial-roots all complex roots of a real polynomial to double precision
 */
export function polynomialRoots(coefficients: readonly number[]): Eigenvalue[] {
  const n = coefficients.length - 1;
  const lead = coefficients[n] ?? 1;
  const companion = new Float64Array(n * n);
  for (let j = 0; j < n; j++) companion[j] = -(coefficients[n - 1 - j] ?? 0) / lead;
  for (let i = 1; i < n; i++) companion[i * n + i - 1] = 1;
  return matrixEigenvalues(companion, n).map((root) => {
    let re = root.re;
    let im = root.im;
    for (let iteration = 0; iteration < 2; iteration++) {
      // Horner for p(λ) and p′(λ) in complex arithmetic.
      let pr = coefficients[n] ?? 0;
      let pi = 0;
      let dr = 0;
      let di = 0;
      for (let k = n - 1; k >= 0; k--) {
        const ndr = dr * re - di * im + pr;
        const ndi = dr * im + di * re + pi;
        dr = ndr;
        di = ndi;
        const npr = pr * re - pi * im + (coefficients[k] ?? 0);
        const npi = pr * im + pi * re;
        pr = npr;
        pi = npi;
      }
      const den = dr * dr + di * di;
      if (den === 0) break;
      re -= (pr * dr + pi * di) / den;
      im -= (pi * dr - pr * di) / den;
    }
    return { re, im: root.im === 0 ? 0 : im };
  });
}
