/**
 * CMA-ES (Hansen 2016, "The CMA Evolution Strategy: a tutorial") with a full covariance matrix and a
 * Jacobi eigen decomposition: enough for the twenty-odd parameters of a species fit.
 */
export interface CmaEs {
  readonly sigma: number;
  readonly mean: readonly number[];
  /** Generations told so far, counting the ones of a restored search. */
  readonly generation: number;
  ask(): number[][];
  tell(population: readonly (readonly number[])[], scores: readonly number[]): void;
  /** Everything a later `createCmaEs(..., state)` needs to carry on exactly where this one is. */
  state(): CmaEsState;
}

/**
 * A search mid-way: saved after each generation, so a fit that stops (a timeout, a closed shell) carries
 * on from its last generation instead of starting a new search around its best point.
 */
export interface CmaEsState {
  generation: number;
  sigma: number;
  mean: number[];
  pc: number[];
  ps: number[];
  /** Row-major n×n covariance. */
  cov: number[];
  /** The xorshift32 word the next draw reads. */
  rng: number;
}

/** xorshift32 in [0, 1); `state` reads or sets the word the next draw uses. */
export interface Random {
  (): number;
  state: number;
}

export function createRandom(seed: number): Random {
  const random = (() => {
    let s = random.state;
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    random.state = s;
    return s / 4294967296;
  }) as Random;
  random.state = seed >>> 0 || 1;
  return random;
}

function gaussian(random: () => number): number {
  const u = Math.max(1e-12, random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

/** Symmetric n×n matrix in a flat row-major array. */
type Matrix = Float64Array;

function jacobiEigen(source: Matrix, n: number): { values: Float64Array; vectors: Matrix } {
  const a = source.slice();
  const v = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) v[i * n + i] = 1;
  const at = (m: Matrix, i: number, j: number): number => m[i * n + j] ?? 0;
  for (let sweep = 0; sweep < 60; sweep += 1) {
    let off = 0;
    for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) off += at(a, i, j) ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p += 1) {
      for (let q = p + 1; q < n; q += 1) {
        const apq = at(a, p, q);
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (at(a, q, q) - at(a, p, p)) / (2 * apq);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k += 1) {
          const akp = at(a, k, p);
          const akq = at(a, k, q);
          a[k * n + p] = c * akp - s * akq;
          a[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k += 1) {
          const apk = at(a, p, k);
          const aqk = at(a, q, k);
          a[p * n + k] = c * apk - s * aqk;
          a[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k += 1) {
          const vkp = at(v, k, p);
          const vkq = at(v, k, q);
          v[k * n + p] = c * vkp - s * vkq;
          v[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const values = new Float64Array(n);
  for (let i = 0; i < n; i += 1) values[i] = at(a, i, i);
  return { values, vectors: v };
}

/**
 * A CMA-ES search from `start` with step size `sigma` and `lambda` samples a generation; given a
 * `resume` state of the same dimension, it continues that search instead (`start` and `sigma0` are
 * then only what a state of another dimension falls back to).
 */
export function createCmaEs(start: readonly number[], sigma0: number, lambda: number, seed: number, resume?: CmaEsState): CmaEs {
  const n = start.length;
  const random = createRandom(seed);
  const saved = resume !== undefined && resume.mean.length === n && resume.cov.length === n * n ? resume : undefined;
  const mu = Math.floor(lambda / 2);
  const raw = Array.from({ length: mu }, (_, i) => Math.log(mu + 0.5) - Math.log(i + 1));
  const rawSum = raw.reduce((s, x) => s + x, 0);
  const weights = raw.map((x) => x / rawSum);
  const mueff = 1 / weights.reduce((s, x) => s + x * x, 0);
  const cc = (4 + mueff / n) / (n + 4 + (2 * mueff) / n);
  const cs = (mueff + 2) / (n + mueff + 5);
  const c1 = 2 / ((n + 1.3) ** 2 + mueff);
  const cmu = Math.min(1 - c1, (2 * (mueff - 2 + 1 / mueff)) / ((n + 2) ** 2 + mueff));
  const damps = 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (n + 1)) - 1) + cs;
  const chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
  let mean = saved === undefined ? start.slice() : saved.mean.slice();
  let sigma = saved === undefined ? sigma0 : saved.sigma;
  let pc = saved === undefined ? new Float64Array(n) : Float64Array.from(saved.pc);
  let ps = saved === undefined ? new Float64Array(n) : Float64Array.from(saved.ps);
  let cov: Matrix = saved === undefined ? new Float64Array(n * n) : Float64Array.from(saved.cov);
  if (saved === undefined) for (let i = 0; i < n; i += 1) cov[i * n + i] = 1;
  let basis: Matrix = cov.slice();
  let scale = new Float64Array(n).fill(1);
  if (saved !== undefined) {
    const eigen = jacobiEigen(cov, n);
    basis = eigen.vectors;
    scale = eigen.values.map((v) => Math.sqrt(Math.max(v, 1e-20)));
    random.state = saved.rng >>> 0 || 1;
  }
  let generation = saved?.generation ?? 0;
  const b = (i: number, j: number): number => basis[i * n + j] ?? 0;

  return {
    get sigma() {
      return sigma;
    },
    get mean() {
      return mean;
    },
    get generation() {
      return generation;
    },
    state() {
      return { generation, sigma, mean: mean.slice(), pc: Array.from(pc), ps: Array.from(ps), cov: Array.from(cov), rng: random.state };
    },
    ask() {
      const population: number[][] = [];
      for (let k = 0; k < lambda; k += 1) {
        const z = Array.from({ length: n }, () => gaussian(random));
        population.push(mean.map((m, i) => {
          let y = 0;
          for (let j = 0; j < n; j += 1) y += b(i, j) * (scale[j] ?? 0) * (z[j] ?? 0);
          return m + sigma * y;
        }));
      }
      return population;
    },
    tell(population, scores) {
      generation += 1;
      const order = scores.map((s, i) => [s, i] as const).sort((x, y) => x[0] - y[0]).map((pair) => pair[1]);
      const best = order.slice(0, mu).map((k) => population[k] ?? mean);
      const old = mean;
      mean = old.map((_, i) => best.reduce((s, x, r) => s + (weights[r] ?? 0) * (x[i] ?? 0), 0));
      const y = mean.map((m, i) => (m - (old[i] ?? 0)) / sigma);
      const rotated = new Float64Array(n);
      for (let j = 0; j < n; j += 1) {
        let s = 0;
        for (let i = 0; i < n; i += 1) s += b(i, j) * (y[i] ?? 0);
        rotated[j] = s / (scale[j] ?? 1);
      }
      const whitened = new Float64Array(n);
      for (let i = 0; i < n; i += 1) {
        let s = 0;
        for (let j = 0; j < n; j += 1) s += b(i, j) * (rotated[j] ?? 0);
        whitened[i] = s;
      }
      ps = ps.map((p, i) => (1 - cs) * p + Math.sqrt(cs * (2 - cs) * mueff) * (whitened[i] ?? 0));
      const psNorm = Math.sqrt(ps.reduce((s, p) => s + p * p, 0));
      const hsig = psNorm / Math.sqrt(1 - (1 - cs) ** (2 * generation)) / chiN < 1.4 + 2 / (n + 1) ? 1 : 0;
      pc = pc.map((p, i) => (1 - cc) * p + hsig * Math.sqrt(cc * (2 - cc) * mueff) * (y[i] ?? 0));
      const steps = best.map((x) => x.map((xi, i) => (xi - (old[i] ?? 0)) / sigma));
      const next = new Float64Array(n * n);
      for (let i = 0; i < n; i += 1) {
        for (let j = 0; j < n; j += 1) {
          let rankMu = 0;
          for (let r = 0; r < steps.length; r += 1) rankMu += (weights[r] ?? 0) * (steps[r]?.[i] ?? 0) * (steps[r]?.[j] ?? 0);
          const cij = cov[i * n + j] ?? 0;
          next[i * n + j] = (1 - c1 - cmu) * cij + c1 * ((pc[i] ?? 0) * (pc[j] ?? 0) + (1 - hsig) * cc * (2 - cc) * cij) + cmu * rankMu;
        }
      }
      cov = next;
      sigma = Math.min(0.5, sigma * Math.exp((cs / damps) * (psNorm / chiN - 1)));
      const eigen = jacobiEigen(cov, n);
      basis = eigen.vectors;
      scale = eigen.values.map((v) => Math.sqrt(Math.max(v, 1e-20)));
    },
  };
}
