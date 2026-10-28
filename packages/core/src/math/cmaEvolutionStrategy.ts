/** Options for {@link createCmaEvolutionStrategy}. */
export interface CmaOptions {
  /** Starting mean. */
  mean: readonly number[];
  /** Starting step size (one standard deviation, in the units of the coordinates). */
  sigma: number;
  /** Uniform random numbers in [0, 1); inject a seeded generator for reproducible runs. */
  random: () => number;
  /** Population per generation (default `4 + ⌊3 ln n⌋`). */
  populationSize?: number;
}

/** Serializable state of a {@link CmaEvolutionStrategy}. */
export interface CmaState {
  mean: number[];
  sigma: number;
  /** Covariance, row-major `n × n`. */
  covariance: number[];
  pathSigma: number[];
  pathC: number[];
  generation: number;
  best: { x: number[]; f: number } | null;
}

/** An ask/tell minimiser: `ask()` a population, evaluate it anywhere (other processes included), `tell()` the costs. */
export interface CmaEvolutionStrategy {
  readonly dimension: number;
  readonly populationSize: number;
  ask(): number[][];
  tell(population: readonly (readonly number[])[], costs: readonly number[]): void;
  /** Best point seen so far and its cost. */
  best(): { x: number[]; f: number } | null;
  sigma(): number;
  snapshot(): CmaState;
  restore(state: CmaState): void;
}

/** Eigen-decomposition of a symmetric matrix by cyclic Jacobi rotations: `A = B·diag(d)·Bᵀ`. */
function symmetricEigen(a: Float64Array, n: number, vectors: Float64Array, values: Float64Array): void {
  const m = Float64Array.from(a);
  vectors.fill(0);
  for (let i = 0; i < n; i++) vectors[i * n + i] = 1;
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += (m[p * n + q] ?? 0) ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = m[p * n + q] ?? 0;
        if (Math.abs(apq) < 1e-300) continue;
        const app = m[p * n + p] ?? 0;
        const aqq = m[q * n + q] ?? 0;
        const theta = (aqq - app) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const mkp = m[k * n + p] ?? 0;
          const mkq = m[k * n + q] ?? 0;
          m[k * n + p] = c * mkp - s * mkq;
          m[k * n + q] = s * mkp + c * mkq;
        }
        for (let k = 0; k < n; k++) {
          const mpk = m[p * n + k] ?? 0;
          const mqk = m[q * n + k] ?? 0;
          m[p * n + k] = c * mpk - s * mqk;
          m[q * n + k] = s * mpk + c * mqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = vectors[k * n + p] ?? 0;
          const vkq = vectors[k * n + q] ?? 0;
          vectors[k * n + p] = c * vkp - s * vkq;
          vectors[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  for (let i = 0; i < n; i++) values[i] = Math.max(1e-20, m[i * n + i] ?? 0);
}

/**
 * Creates a CMA-ES minimiser (N. Hansen, "The CMA Evolution Strategy: A Tutorial", arXiv:1604.00772, 2016) with
 * the tutorial's default weights and learning rates, rank-one and rank-μ covariance updates and cumulative step-size
 * adaptation. Derivative-free and robust to noisy, discontinuous costs such as a controller that sometimes falls.
 * @capability cma-es derivative-free ask/tell minimiser for tuning controllers and fitting models
 */
export function createCmaEvolutionStrategy(options: CmaOptions): CmaEvolutionStrategy {
  const n = options.mean.length;
  const lambda = options.populationSize ?? 4 + Math.floor(3 * Math.log(n));
  const mu = Math.floor(lambda / 2);
  const rawWeights = Array.from({ length: mu }, (_, i) => Math.log((lambda + 1) / 2) - Math.log(i + 1));
  const weightSum = rawWeights.reduce((s, w) => s + w, 0);
  const weights = rawWeights.map((w) => w / weightSum);
  const muEff = 1 / weights.reduce((s, w) => s + w * w, 0);
  const cc = (4 + muEff / n) / (n + 4 + (2 * muEff) / n);
  const cs = (muEff + 2) / (n + muEff + 5);
  const c1 = 2 / ((n + 1.3) ** 2 + muEff);
  const cmu = Math.min(1 - c1, (2 * (muEff - 2 + 1 / muEff)) / ((n + 2) ** 2 + muEff));
  const damps = 1 + 2 * Math.max(0, Math.sqrt((muEff - 1) / (n + 1)) - 1) + cs;
  const chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));

  let mean = Float64Array.from(options.mean);
  let sigma = options.sigma;
  const C = new Float64Array(n * n);
  for (let i = 0; i < n; i++) C[i * n + i] = 1;
  const pSigma = new Float64Array(n);
  const pC = new Float64Array(n);
  const B = new Float64Array(n * n);
  const D = new Float64Array(n);
  let generation = 0;
  let bestSeen: { x: number[]; f: number } | null = null;

  function gaussian(): number {
    const u1 = Math.max(1e-300, options.random());
    const u2 = options.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function decompose(): void {
    symmetricEigen(C, n, B, D);
    for (let i = 0; i < n; i++) D[i] = Math.sqrt(D[i] ?? 1);
  }
  decompose();

  return {
    dimension: n,
    populationSize: lambda,
    ask() {
      const out: number[][] = [];
      for (let k = 0; k < lambda; k++) {
        const z = Array.from({ length: n }, gaussian);
        const x: number[] = [];
        for (let i = 0; i < n; i++) {
          let y = 0;
          for (let j = 0; j < n; j++) y += (B[i * n + j] ?? 0) * (D[j] ?? 0) * (z[j] ?? 0);
          x.push((mean[i] ?? 0) + sigma * y);
        }
        out.push(x);
      }
      return out;
    },
    tell(population, costs) {
      const order = costs.map((f, i) => [f, i] as const).sort((a, b) => a[0] - b[0]);
      const first = order[0];
      if (first !== undefined) {
        const x = population[first[1]];
        if (x !== undefined && (bestSeen === null || first[0] < bestSeen.f)) bestSeen = { x: [...x], f: first[0] };
      }
      const old = mean;
      mean = new Float64Array(n);
      for (let k = 0; k < mu; k++) {
        const x = population[order[k]?.[1] ?? 0] ?? [];
        const w = weights[k] ?? 0;
        for (let i = 0; i < n; i++) mean[i] = (mean[i] ?? 0) + w * (x[i] ?? 0);
      }
      // y = (m' − m)/σ; C^{-1/2}·y = B·D⁻¹·Bᵀ·y.
      const y = Array.from({ length: n }, (_, i) => ((mean[i] ?? 0) - (old[i] ?? 0)) / sigma);
      const bty = Array.from({ length: n }, (_, j) => {
        let s = 0;
        for (let i = 0; i < n; i++) s += (B[i * n + j] ?? 0) * (y[i] ?? 0);
        return s / (D[j] ?? 1);
      });
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let j = 0; j < n; j++) s += (B[i * n + j] ?? 0) * (bty[j] ?? 0);
        pSigma[i] = (1 - cs) * (pSigma[i] ?? 0) + Math.sqrt(cs * (2 - cs) * muEff) * s;
      }
      const psNorm = Math.hypot(...pSigma);
      generation += 1;
      const hSigma = psNorm / Math.sqrt(1 - (1 - cs) ** (2 * generation)) / chiN < 1.4 + 2 / (n + 1) ? 1 : 0;
      for (let i = 0; i < n; i++) pC[i] = (1 - cc) * (pC[i] ?? 0) + hSigma * Math.sqrt(cc * (2 - cc) * muEff) * (y[i] ?? 0);
      const deltaH = (1 - hSigma) * cc * (2 - cc);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j <= i; j++) {
          let rankMu = 0;
          for (let k = 0; k < mu; k++) {
            const x = population[order[k]?.[1] ?? 0] ?? [];
            rankMu += (weights[k] ?? 0) * (((x[i] ?? 0) - (old[i] ?? 0)) / sigma) * (((x[j] ?? 0) - (old[j] ?? 0)) / sigma);
          }
          const value = (1 - c1 - cmu) * (C[i * n + j] ?? 0) + c1 * ((pC[i] ?? 0) * (pC[j] ?? 0) + deltaH * (C[i * n + j] ?? 0)) + cmu * rankMu;
          C[i * n + j] = value;
          C[j * n + i] = value;
        }
      }
      sigma *= Math.exp((cs / damps) * (psNorm / chiN - 1));
      decompose();
    },
    best: () => bestSeen,
    sigma: () => sigma,
    snapshot() {
      return { mean: Array.from(mean), sigma, covariance: Array.from(C), pathSigma: Array.from(pSigma), pathC: Array.from(pC), generation, best: bestSeen };
    },
    restore(state) {
      mean = Float64Array.from(state.mean);
      sigma = state.sigma;
      C.set(state.covariance);
      pSigma.set(state.pathSigma);
      pC.set(state.pathC);
      generation = state.generation;
      bestSeen = state.best;
      decompose();
    },
  };
}
