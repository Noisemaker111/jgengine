import { solveLinearSystem } from "@jgengine/core/math/linearAlgebra";

type Complex = readonly [number, number];

const EULER_GAMMA = 0.5772156649015329;
const GAUSS_POINTS = [-0.9602898564975363, -0.7966664774136267, -0.5255324099163290, -0.1834346424956498, 0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363];
const GAUSS_WEIGHTS = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.3626837833783620, 0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];

function mul(a: Complex, b: Complex): Complex {
  return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
}

function div(a: Complex, b: Complex): Complex {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
}

function cexp(a: Complex): Complex {
  const m = Math.exp(a[0]);
  return [m * Math.cos(a[1]), m * Math.sin(a[1])];
}

/** Exponential integral `E1(u)` on the principal branch: series near the origin and deep in the left half-plane, continued fraction elsewhere, asymptotic far out. */
function expIntegral(u: Complex): Complex {
  const size = Math.hypot(u[0], u[1]);
  const arg = Math.atan2(u[1], u[0]);
  if (size > 40) {
    let term: Complex = [1, 0];
    let sum: Complex = [1, 0];
    for (let n = 1; n < 40; n += 1) {
      const next = mul(term, div([-n, 0], u));
      if (Math.hypot(next[0], next[1]) > Math.hypot(term[0], term[1])) break;
      term = next;
      sum = [sum[0] + term[0], sum[1] + term[1]];
    }
    return mul(div(cexp([-u[0], -u[1]]), u), sum);
  }
  if (size > 8 && Math.abs(arg) <= 0.75 * Math.PI) {
    // Modified Lentz on E1(u) = e^(−u)/(u + 1 − 1²/(u + 3 − 2²/(u + 5 − …))).
    const tiny = 1e-300;
    let b: Complex = [u[0] + 1, u[1]];
    let c: Complex = [1 / tiny, 0];
    let d = div([1, 0], b);
    let h = d;
    for (let i = 1; i < 2000; i += 1) {
      const an = -i * i;
      b = [b[0] + 2, b[1]];
      const dd: Complex = [an * d[0] + b[0], an * d[1] + b[1]];
      d = div([1, 0], Math.hypot(dd[0], dd[1]) < tiny ? [tiny, 0] : dd);
      c = [b[0] + div([an, 0], c)[0], b[1] + div([an, 0], c)[1]];
      if (Math.hypot(c[0], c[1]) < tiny) c = [tiny, 0];
      const del = mul(c, d);
      h = mul(h, del);
      if (Math.hypot(del[0] - 1, del[1]) < 1e-15) break;
    }
    return mul(h, cexp([-u[0], -u[1]]));
  }
  let sum: Complex = [0, 0];
  let term: Complex = [1, 0];
  for (let n = 1; n < 200; n += 1) {
    term = mul(term, [-u[0] / n, -u[1] / n]);
    const add: Complex = [term[0] / n, term[1] / n];
    sum = [sum[0] + add[0], sum[1] + add[1]];
    if (Math.hypot(add[0], add[1]) < 1e-17 * Math.max(1, Math.hypot(sum[0], sum[1]))) break;
  }
  return [-EULER_GAMMA - Math.log(size) - sum[0], -arg - sum[1]];
}

/**
 * Wave part of the 2-D pulsating-source Green's function, `−2·PV∫e^(k(y+η))cos k(x−ξ)/(k−ν) dk − 2πi·e^(ν(y+η))cos ν(x−ξ)`,
 * and its x and y derivatives, from `J(Z) = e^(νZ)(E1(νZ) + iπ·sgn X)` with `Z = (y+η) + iX`, `X = x − ξ`.
 */
function waveTerm(dx: number, sy: number, nu: number): { value: Complex; dx: Complex; dy: Complex } {
  const z: Complex = [sy, dx];
  const u: Complex = [nu * sy, nu * dx];
  const e1 = expIntegral(u);
  const s = dx >= 0 ? 1 : -1;
  const j = mul(cexp(u), [e1[0], e1[1] + Math.PI * s]);
  const jPrime: Complex = [nu * j[0] - div([1, 0], z)[0], nu * j[1] - div([1, 0], z)[1]];
  const decay = Math.exp(nu * sy);
  const c = Math.cos(nu * dx);
  const sn = Math.sin(nu * dx);
  // Real parts: −2 Re J (PV), imaginary: −2π e^(νY) cos νX. ∂/∂y J = J′, ∂/∂x J = i·J′.
  return {
    value: [-2 * j[0], -2 * Math.PI * decay * c],
    dy: [-2 * jPrime[0], -2 * Math.PI * nu * decay * c],
    dx: [2 * jPrime[1], 2 * Math.PI * nu * decay * sn],
  };
}

/** `∫ ln|P − Q| ds` over the segment `a → b`, and its gradient at `P`. */
function logSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): { value: number; gx: number; gy: number } {
  const lx = bx - ax;
  const ly = by - ay;
  const length = Math.hypot(lx, ly);
  const tx = lx / length;
  const ty = ly / length;
  const rx = px - ax;
  const ry = py - ay;
  const along = rx * tx + ry * ty;
  const off = -rx * ty + ry * tx;
  const antiderivative = (s: number) => {
    const d = s - along;
    const r2 = d * d + off * off;
    return (r2 > 0 ? 0.5 * d * Math.log(r2) : 0) - d + (Math.abs(off) > 0 ? off * Math.atan(d / off) : 0);
  };
  const value = antiderivative(length) - antiderivative(0);
  // f′(z) = (1/e)·ln((z − A)/(z − B)); grad Re f = (Re f′, −Im f′).
  const zaX = px - ax, zaY = py - ay, zbX = px - bx, zbY = py - by;
  const ratio = div([zaX, zaY], [zbX, zbY]);
  const logRatio: Complex = [0.5 * Math.log(ratio[0] * ratio[0] + ratio[1] * ratio[1]), Math.atan2(ratio[1], ratio[0])];
  const fPrime = mul(logRatio, [tx, -ty]);
  return { value, gx: fPrime[0], gy: -fPrime[1] };
}

/**
 * Half a symmetric ship section below the waterline: points from the keel on the centreline to the waterline, as
 * `[half-breadth, depth]` pairs with depth ≤ 0 (the waterline at 0).
 */
export type HalfSection = readonly (readonly [number, number])[];

/** Heave added mass, kg/m, and radiation damping, N·s/m², of a section at one frequency, with what the strip method needs. */
export interface SectionHeave {
  addedMass: number;
  damping: number;
  /** Far-field wave amplitude per heave amplitude, both sides alike. */
  waveRatio: number;
  /** `∫ φ₃·n_z·e^(k·z) ds` over the whole contour, per unit heave velocity: the diffraction force integral. */
  diffraction: Complex;
  /** `∫ e^(k·z)·n_z ds` over the whole contour: the Froude–Krylov force integral (negative of the attenuated beam). */
  froudeKrylov: number;
}

/** Splits a half-section into `panels` straight panels, equal in arc length. */
function resample(section: HalfSection, panels: number): [number, number][] {
  const lengths = [0];
  for (let i = 1; i < section.length; i += 1) {
    const a = section[i - 1] ?? [0, 0];
    const b = section[i] ?? [0, 0];
    lengths.push((lengths[i - 1] ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = lengths[lengths.length - 1] ?? 0;
  const out: [number, number][] = [];
  let k = 1;
  for (let i = 0; i <= panels; i += 1) {
    // Cosine spacing packs panels at the keel and the waterline corners.
    const s = 0.5 * total * (1 - Math.cos((Math.PI * i) / panels));
    while (k < lengths.length - 1 && (lengths[k] ?? 0) < s) k += 1;
    const s0 = lengths[k - 1] ?? 0;
    const s1 = lengths[k] ?? 0;
    const a = section[k - 1] ?? [0, 0];
    const b = section[k] ?? [0, 0];
    const t = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
    out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
  }
  return out;
}

/**
 * Heave added mass and damping of a symmetric section by Frank's close-fit source method: pulsating sources of
 * constant strength on straight panels (mirrored to port) with the deep-water free-surface Green's function, the body
 * condition met at panel midpoints. `frequency` `Infinity` uses the high-frequency limit (`φ = 0` on the surface).
 * @capability section-hydrodynamics 2-D heave added mass and radiation damping of a ship section (Frank close-fit)
 */
export function sectionHeave(section: HalfSection, frequency: number, density = 1025, gravity = 9.80665, panels = 24): SectionHeave {
  const nodes = resample(section, panels);
  const n = panels;
  const nu = Number.isFinite(frequency) ? (frequency * frequency) / gravity : Infinity;
  const mid: [number, number][] = [];
  const normal: [number, number][] = [];
  for (let i = 0; i < n; i += 1) {
    const a = nodes[i] ?? [0, 0];
    const b = nodes[i + 1] ?? [0, 0];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    mid.push([0.5 * (a[0] + b[0]), 0.5 * (a[1] + b[1])]);
    // Keel to waterline on the starboard half: the outward normal is the tangent turned clockwise.
    normal.push([(b[1] - a[1]) / length, -(b[0] - a[0]) / length]);
  }
  // Influence of panel j (and its port mirror) on potential and normal velocity at midpoint i, complex.
  const potential: Complex[] = [];
  const flux: Complex[] = [];
  for (let i = 0; i < n; i += 1) {
    const [px, py] = mid[i] ?? [0, 0];
    const [nx, ny] = normal[i] ?? [0, 0];
    for (let j = 0; j < n; j += 1) {
      const a = nodes[j] ?? [0, 0];
      const b = nodes[j + 1] ?? [0, 0];
      let phiRe = 0, phiIm = 0, fluxRe = 0, fluxIm = 0;
      for (const mirror of [1, -1]) {
        const ax = mirror * a[0], bx = mirror * b[0];
        const direct = logSegment(px, py, ax, a[1], bx, b[1]);
        const image = logSegment(px, py, ax, -a[1], bx, -b[1]);
        const self = i === j && mirror === 1;
        phiRe += direct.value - image.value;
        fluxRe += self ? Math.PI : nx * direct.gx + ny * direct.gy;
        fluxRe -= nx * image.gx + ny * image.gy;
        if (Number.isFinite(nu)) {
          const length = Math.hypot(bx - ax, b[1] - a[1]);
          for (let g = 0; g < GAUSS_POINTS.length; g += 1) {
            const t = 0.5 * (1 + (GAUSS_POINTS[g] ?? 0));
            const w = 0.5 * length * (GAUSS_WEIGHTS[g] ?? 0);
            const qx = ax + t * (bx - ax);
            const qy = a[1] + t * (b[1] - a[1]);
            const wave = waveTerm(px - qx, py + qy, nu);
            phiRe += w * wave.value[0];
            phiIm += w * wave.value[1];
            fluxRe += w * (nx * wave.dx[0] + ny * wave.dy[0]);
            fluxIm += w * (nx * wave.dx[1] + ny * wave.dy[1]);
          }
        }
      }
      potential.push([phiRe, phiIm]);
      flux.push([fluxRe, fluxIm]);
    }
  }
  // Complex solve as a real 2n system: [Re −Im; Im Re]·[σr; σi] = [n_z; 0].
  const size = 2 * n;
  const matrix = new Float64Array(size * size);
  const rhs = new Float64Array(size);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const [re, im] = flux[i * n + j] ?? [0, 0];
      matrix[i * size + j] = re;
      matrix[i * size + n + j] = -im;
      matrix[(n + i) * size + j] = im;
      matrix[(n + i) * size + n + j] = re;
    }
    rhs[i] = normal[i]?.[1] ?? 0;
  }
  solveLinearSystem(matrix, rhs, size);
  const k = Number.isFinite(nu) ? nu : 0;
  let forceRe = 0, forceIm = 0, diffRe = 0, diffIm = 0, fk = 0, farRe = 0, farIm = 0;
  for (let i = 0; i < n; i += 1) {
    let phiRe = 0, phiIm = 0;
    for (let j = 0; j < n; j += 1) {
      const [pr, pi] = potential[i * n + j] ?? [0, 0];
      const sr = rhs[j] ?? 0;
      const si = rhs[n + j] ?? 0;
      phiRe += pr * sr - pi * si;
      phiIm += pr * si + pi * sr;
    }
    const a = nodes[i] ?? [0, 0];
    const b = nodes[i + 1] ?? [0, 0];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nz = normal[i]?.[1] ?? 0;
    const decay = Number.isFinite(nu) ? Math.exp(k * (mid[i]?.[1] ?? 0)) : 0;
    // Both halves: double every contour integral.
    forceRe += 2 * phiRe * nz * length;
    forceIm += 2 * phiIm * nz * length;
    diffRe += 2 * phiRe * nz * decay * length;
    diffIm += 2 * phiIm * nz * decay * length;
    fk += 2 * nz * decay * length;
    if (Number.isFinite(nu)) {
      for (let g = 0; g < GAUSS_POINTS.length; g += 1) {
        const t = 0.5 * (1 + (GAUSS_POINTS[g] ?? 0));
        const w = 0.5 * length * (GAUSS_WEIGHTS[g] ?? 0);
        const qx = a[0] + t * (b[0] - a[0]);
        const qy = a[1] + t * (b[1] - a[1]);
        const weight = 2 * w * Math.exp(nu * qy) * Math.cos(nu * qx);
        farRe += weight * (rhs[i] ?? 0);
        farIm += weight * (rhs[n + i] ?? 0);
      }
    }
  }
  // p = iωρφ per unit velocity; F = −∫p n_z ds = (iω·a − b)·V.
  const omega = Number.isFinite(frequency) ? frequency : 1;
  const addedMass = -density * forceRe;
  const damping = Number.isFinite(frequency) ? -omega * density * forceIm : 0;
  const waveRatio = Number.isFinite(nu) ? 2 * Math.PI * nu * Math.hypot(farRe, farIm) : 0;
  return { addedMass, damping, waveRatio, diffraction: [diffRe, diffIm], froudeKrylov: fk };
}

/**
 * A Lewis-form half-section `x = M((1 + a1) sin θ − a3 sin 3θ)`, `y = −M((1 − a1) cos θ + a3 cos 3θ)` from the keel
 * (`θ = 0`) to the waterline (`θ = π/2`), fitted to a half-breadth, draft and section area coefficient.
 * @capability section-hydrodynamics Lewis-form ship section from beam, draft and area coefficient
 */
export function lewisSection(halfBreadth: number, draft: number, areaCoefficient: number, points = 41): { section: HalfSection; a1: number; a3: number; scale: number } {
  const h = halfBreadth / draft;
  const sigma = areaCoefficient;
  // Lewis coefficients from H = B/2T and σ (Journée & Adegeest, SEAWAY theory manual).
  const c1 = (3 + 4 * sigma / Math.PI) + (1 - 4 * sigma / Math.PI) * ((h - 1) / (h + 1)) ** 2;
  const a3 = (-c1 + 3 + Math.sqrt(9 - 2 * c1)) / c1;
  const a1 = ((h - 1) / (h + 1)) * (a3 + 1);
  const scale = halfBreadth / (1 + a1 + a3);
  const section: [number, number][] = [];
  for (let i = 0; i < points; i += 1) {
    const theta = (0.5 * Math.PI * i) / (points - 1);
    section.push([scale * ((1 + a1) * Math.sin(theta) - a3 * Math.sin(3 * theta)), -scale * ((1 - a1) * Math.cos(theta) + a3 * Math.cos(3 * theta))]);
  }
  return { section, a1, a3, scale };
}
