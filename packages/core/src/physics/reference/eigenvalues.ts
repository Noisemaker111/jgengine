/** One eigenvalue `re + i·im`, 1/s for a linearised plant. */
export interface Eigenvalue {
  re: number;
  im: number;
}

function balance(a: Float64Array, n: number): void {
  const radix = 2;
  const sqrdx = radix * radix;
  let done = false;
  while (!done) {
    done = true;
    for (let i = 0; i < n; i++) {
      let r = 0;
      let c = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        c += Math.abs(a[j * n + i] ?? 0);
        r += Math.abs(a[i * n + j] ?? 0);
      }
      if (c === 0 || r === 0) continue;
      let g = r / radix;
      let f = 1;
      const s = c + r;
      while (c < g) {
        f *= radix;
        c *= sqrdx;
      }
      g = r * radix;
      while (c > g) {
        f /= radix;
        c /= sqrdx;
      }
      if ((c + r) / f < 0.95 * s) {
        done = false;
        g = 1 / f;
        for (let j = 0; j < n; j++) a[i * n + j] = (a[i * n + j] ?? 0) * g;
        for (let j = 0; j < n; j++) a[j * n + i] = (a[j * n + i] ?? 0) * f;
      }
    }
  }
}

function hessenberg(a: Float64Array, n: number): void {
  const at = (i: number, j: number) => a[i * n + j] ?? 0;
  for (let m = 1; m < n - 1; m++) {
    let x = 0;
    let pivot = m;
    for (let j = m; j < n; j++) {
      if (Math.abs(at(j, m - 1)) > Math.abs(x)) {
        x = at(j, m - 1);
        pivot = j;
      }
    }
    if (pivot !== m) {
      for (let j = m - 1; j < n; j++) {
        const t = at(pivot, j);
        a[pivot * n + j] = at(m, j);
        a[m * n + j] = t;
      }
      for (let j = 0; j < n; j++) {
        const t = at(j, pivot);
        a[j * n + pivot] = at(j, m);
        a[j * n + m] = t;
      }
    }
    if (x === 0) continue;
    for (let i = m + 1; i < n; i++) {
      let y = at(i, m - 1);
      if (y === 0) continue;
      y /= x;
      a[i * n + m - 1] = y;
      for (let j = m; j < n; j++) a[i * n + j] = at(i, j) - y * at(m, j);
      for (let j = 0; j < n; j++) a[j * n + m] = at(j, m) + y * at(j, i);
    }
  }
  for (let i = 2; i < n; i++) for (let j = 0; j < i - 1; j++) a[i * n + j] = 0;
}

function withSign(magnitude: number, sign: number): number {
  return sign >= 0 ? Math.abs(magnitude) : -Math.abs(magnitude);
}

/** Francis double-shift QR on an upper Hessenberg matrix (the EISPACK `hqr` scheme). */
function hessenbergEigenvalues(a: Float64Array, n: number): Eigenvalue[] {
  const at = (i: number, j: number) => a[i * n + j] ?? 0;
  const set = (i: number, j: number, value: number) => {
    a[i * n + j] = value;
  };
  const out: Eigenvalue[] = new Array<Eigenvalue>(n);
  const eps = Number.EPSILON;
  let anorm = 0;
  for (let i = 0; i < n; i++) for (let j = Math.max(i - 1, 0); j < n; j++) anorm += Math.abs(at(i, j));
  let nn = n - 1;
  let t = 0;
  let its = 0;
  let p = 0;
  let q = 0;
  let r = 0;
  let s = 0;
  let w = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  while (nn >= 0) {
    let l = nn;
    for (; l > 0; l--) {
      s = Math.abs(at(l - 1, l - 1)) + Math.abs(at(l, l));
      if (s === 0) s = anorm;
      if (Math.abs(at(l, l - 1)) <= eps * s) {
        set(l, l - 1, 0);
        break;
      }
    }
    x = at(nn, nn);
    if (l === nn) {
      out[nn] = { re: x + t, im: 0 };
      nn -= 1;
      its = 0;
      continue;
    }
    y = at(nn - 1, nn - 1);
    w = at(nn, nn - 1) * at(nn - 1, nn);
    if (l === nn - 1) {
      p = 0.5 * (y - x);
      q = p * p + w;
      z = Math.sqrt(Math.abs(q));
      x += t;
      if (q >= 0) {
        z = p + withSign(z, p);
        const first = x + z;
        out[nn - 1] = { re: first, im: 0 };
        out[nn] = { re: z !== 0 ? x - w / z : first, im: 0 };
      } else {
        out[nn - 1] = { re: x + p, im: z };
        out[nn] = { re: x + p, im: -z };
      }
      nn -= 2;
      its = 0;
      continue;
    }
    if (its === 60) throw new Error("eigenvalues: QR iteration did not converge");
    if (its === 10 || its === 20 || its === 40) {
      t += x;
      for (let i = 0; i <= nn; i++) set(i, i, at(i, i) - x);
      s = Math.abs(at(nn, nn - 1)) + Math.abs(at(nn - 1, nn - 2));
      x = 0.75 * s;
      y = x;
      w = -0.4375 * s * s;
    }
    its += 1;
    let m = nn - 2;
    for (; m >= l; m--) {
      z = at(m, m);
      r = x - z;
      s = y - z;
      p = (r * s - w) / at(m + 1, m) + at(m, m + 1);
      q = at(m + 1, m + 1) - z - r - s;
      r = at(m + 2, m + 1);
      s = Math.abs(p) + Math.abs(q) + Math.abs(r);
      p /= s;
      q /= s;
      r /= s;
      if (m === l) break;
      const u = Math.abs(at(m, m - 1)) * (Math.abs(q) + Math.abs(r));
      const v = Math.abs(p) * (Math.abs(at(m - 1, m - 1)) + Math.abs(z) + Math.abs(at(m + 1, m + 1)));
      if (u <= eps * v) break;
    }
    for (let i = m; i < nn - 1; i++) {
      set(i + 2, i, 0);
      if (i !== m) set(i + 2, i - 1, 0);
    }
    for (let k = m; k < nn; k++) {
      if (k !== m) {
        p = at(k, k - 1);
        q = at(k + 1, k - 1);
        r = k + 1 !== nn ? at(k + 2, k - 1) : 0;
        x = Math.abs(p) + Math.abs(q) + Math.abs(r);
        if (x !== 0) {
          p /= x;
          q /= x;
          r /= x;
        }
      }
      s = withSign(Math.sqrt(p * p + q * q + r * r), p);
      if (s === 0) continue;
      if (k === m) {
        if (l !== m) set(k, k - 1, -at(k, k - 1));
      } else set(k, k - 1, -s * x);
      p += s;
      x = p / s;
      y = q / s;
      z = r / s;
      q /= p;
      r /= p;
      for (let j = k; j <= nn; j++) {
        p = at(k, j) + q * at(k + 1, j);
        if (k + 1 !== nn) {
          p += r * at(k + 2, j);
          set(k + 2, j, at(k + 2, j) - p * z);
        }
        set(k + 1, j, at(k + 1, j) - p * y);
        set(k, j, at(k, j) - p * x);
      }
      const mmin = nn < k + 3 ? nn : k + 3;
      for (let i = l; i <= mmin; i++) {
        p = x * at(i, k) + y * at(i, k + 1);
        if (k + 1 !== nn) {
          p += z * at(i, k + 2);
          set(i, k + 2, at(i, k + 2) - p * r);
        }
        set(i, k + 1, at(i, k + 1) - p * q);
        set(i, k, at(i, k) - p);
      }
    }
  }
  return out;
}

/**
 * Eigenvalues of a real square matrix (row-major, `n × n`): balancing, reduction to upper Hessenberg form by
 * stabilised elimination, then the Francis double-shift QR iteration (Wilkinson & Reinsch, *Handbook for Automatic
 * Computation* II, the EISPACK `balanc`/`elmhes`/`hqr` scheme). Complex pairs come out together. The input is not
 * modified. Sorted by real part, then imaginary part, descending.
 * @capability matrix-eigenvalues eigenvalues of a real matrix — stability modes of a linearised plant
 */
export function matrixEigenvalues(matrix: ArrayLike<number>, n: number): Eigenvalue[] {
  if (n === 0) return [];
  const a = Float64Array.from({ length: n * n }, (_, k) => matrix[k] ?? 0);
  balance(a, n);
  hessenberg(a, n);
  return hessenbergEigenvalues(a, n).sort((left, right) => right.re - left.re || right.im - left.im);
}

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
