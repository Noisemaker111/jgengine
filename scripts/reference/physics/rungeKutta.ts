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

