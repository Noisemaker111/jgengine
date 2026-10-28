/** A reusable classical fourth-order Runge–Kutta stepper over a fixed-size state vector. */
export interface RungeKutta4 {
  /**
   * Advance `x` in place by `h` seconds of `dx/dt = derivative(x)`. `derivative` writes into `out` and must not keep
   * either array.
   */
  step(x: Float64Array, h: number, derivative: (x: Float64Array, out: Float64Array) => void): void;
}

/**
 * Creates a {@link RungeKutta4} for states of `size` entries; its scratch buffers are allocated once, so a step
 * allocates nothing.
 * @capability runge-kutta-4 fixed-step fourth-order Runge–Kutta integrator for reference physics plants
 */
export function createRungeKutta4(size: number): RungeKutta4 {
  const k1 = new Float64Array(size);
  const k2 = new Float64Array(size);
  const k3 = new Float64Array(size);
  const k4 = new Float64Array(size);
  const stage = new Float64Array(size);
  return {
    step(x, h, derivative) {
      const n = size;
      derivative(x, k1);
      for (let k = 0; k < n; k++) stage[k] = (x[k] ?? 0) + 0.5 * h * (k1[k] ?? 0);
      derivative(stage, k2);
      for (let k = 0; k < n; k++) stage[k] = (x[k] ?? 0) + 0.5 * h * (k2[k] ?? 0);
      derivative(stage, k3);
      for (let k = 0; k < n; k++) stage[k] = (x[k] ?? 0) + h * (k3[k] ?? 0);
      derivative(stage, k4);
      for (let k = 0; k < n; k++) x[k] = (x[k] ?? 0) + (h / 6) * ((k1[k] ?? 0) + 2 * (k2[k] ?? 0) + 2 * (k3[k] ?? 0) + (k4[k] ?? 0));
    },
  };
}

/**
 * Solve `m·x = b` in place (n×n, row-major; `m` is overwritten and `b` becomes `x`) by Gaussian elimination with
 * partial pivoting.
 * @capability linear-solve dense linear solve with partial pivoting for reference physics plants and constraints
 */
export function solveLinearSystem(m: Float64Array, b: Float64Array, n: number): void {
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(m[row * n + col] ?? 0) > Math.abs(m[pivot * n + col] ?? 0)) pivot = row;
    if (pivot !== col) {
      for (let k = 0; k < n; k++) {
        const t = m[col * n + k] ?? 0;
        m[col * n + k] = m[pivot * n + k] ?? 0;
        m[pivot * n + k] = t;
      }
      const t = b[col] ?? 0;
      b[col] = b[pivot] ?? 0;
      b[pivot] = t;
    }
    const d = m[col * n + col] ?? 1;
    for (let row = col + 1; row < n; row++) {
      const f = (m[row * n + col] ?? 0) / d;
      if (f === 0) continue;
      for (let k = col; k < n; k++) m[row * n + k] = (m[row * n + k] ?? 0) - f * (m[col * n + k] ?? 0);
      b[row] = (b[row] ?? 0) - f * (b[col] ?? 0);
    }
  }
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row] ?? 0;
    for (let k = row + 1; k < n; k++) sum -= (m[row * n + k] ?? 0) * (b[k] ?? 0);
    b[row] = sum / (m[row * n + row] ?? 1);
  }
}
