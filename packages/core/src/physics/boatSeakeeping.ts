import { solveLinearSystem } from "../math/linearAlgebra";
import type { WaveField } from "../water/seaState";
import type { BoatWater } from "./boatResistance";

type Complex = readonly [number, number];

const EULER_GAMMA = 0.5772156649015329;
const GAUSS_POINTS = [-0.9602898564975363, -0.796666477413627, -0.525532409916329, -0.1834346424956498, 0.1834346424956498, 0.525532409916329, 0.796666477413627, 0.9602898564975363];
const GAUSS_WEIGHTS = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.362683783378362, 0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];

/** A hull as a table of offsets: `x` forward from the aft end, `z` up from the keel, half-breadths `[station][waterline]`, m. */
export interface HullOffsetTable {
  stations: readonly number[];
  waterlines: readonly number[];
  halfBreadths: readonly (readonly number[])[];
}

/**
 * Heave, pitch and roll in waves, the `seakeeping` effect of `boatDynamics`. The hull is cut into strips; each strip's
 * heave added mass and radiation damping come from Frank's close-fit source method at a reference frequency, the
 * restoring from its waterline breadth, and the wave force from the incident pressure on its contour (Froude–Krylov,
 * decaying with depth) plus diffraction. Summed about G they drive heave and pitch in the time domain; roll is a
 * damped oscillator on the metacentric height forced by the wave slope across the hull. With a `sea` wave field the
 * forcing is per component; without one the hull samples `waterHeight` along its length (the long-wave limit).
 */
export interface HullSeakeeping {
  /** `false` turns the effect off while keeping its numbers (default `true`). */
  enabled?: boolean;
  /** Hull lines; default a Wigley hull (`C_B` 4/9) of the tuning's length, beam and mass. */
  offsets?: HullOffsetTable;
  /** Draught the hull floats at, m (default: what the offsets or the Wigley hull need to carry the mass). */
  draft?: number;
  /** Centre of gravity, m: forward of the aft end and above the keel (default mid-length, on the waterline). */
  centreOfGravity?: readonly [number, number];
  /** Pitch radius of gyration about G, m (default `0.25·length`). */
  pitchRadius?: number;
  /** Roll radius of gyration about G, m (default `0.35·beam`). */
  rollRadius?: number;
  /** Roll added inertia as a share of the dry roll inertia (default `0.2`). */
  rollAddedInertia?: number;
  /** Roll damping as a share of critical (default `0.05`). */
  rollDamping?: number;
  /** Frequency the radiation coefficients are taken at, rad/s (default the sea's peak, else the heave natural frequency). */
  referenceFrequency?: number;
  /** Strips along the hull for a generated Wigley hull (default `11`). */
  stations?: number;
  /** Panels per half-section (default `6`). */
  panels?: number;
}

function cmul(a: Complex, b: Complex): Complex {
  return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
}

function cdiv(a: Complex, b: Complex): Complex {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
}

function cexp(a: Complex): Complex {
  const m = Math.exp(a[0]);
  return [m * Math.cos(a[1]), m * Math.sin(a[1])];
}

function expIntegral(u: Complex): Complex {
  const size = Math.hypot(u[0], u[1]);
  const arg = Math.atan2(u[1], u[0]);
  if (size > 40) {
    let term: Complex = [1, 0];
    let sum: Complex = [1, 0];
    for (let n = 1; n < 40; n += 1) {
      const next = cmul(term, cdiv([-n, 0], u));
      if (Math.hypot(next[0], next[1]) > Math.hypot(term[0], term[1])) break;
      term = next;
      sum = [sum[0] + term[0], sum[1] + term[1]];
    }
    return cmul(cdiv(cexp([-u[0], -u[1]]), u), sum);
  }
  if (size > 8 && Math.abs(arg) <= 0.75 * Math.PI) {
    const tiny = 1e-300;
    let b: Complex = [u[0] + 1, u[1]];
    let c: Complex = [1 / tiny, 0];
    let d = cdiv([1, 0], b);
    let h = d;
    for (let i = 1; i < 2000; i += 1) {
      const an = -i * i;
      b = [b[0] + 2, b[1]];
      const dd: Complex = [an * d[0] + b[0], an * d[1] + b[1]];
      d = cdiv([1, 0], Math.hypot(dd[0], dd[1]) < tiny ? [tiny, 0] : dd);
      const q = cdiv([an, 0], c);
      c = [b[0] + q[0], b[1] + q[1]];
      if (Math.hypot(c[0], c[1]) < tiny) c = [tiny, 0];
      const del = cmul(c, d);
      h = cmul(h, del);
      if (Math.hypot(del[0] - 1, del[1]) < 1e-15) break;
    }
    return cmul(h, cexp([-u[0], -u[1]]));
  }
  let sum: Complex = [0, 0];
  let term: Complex = [1, 0];
  for (let n = 1; n < 200; n += 1) {
    term = cmul(term, [-u[0] / n, -u[1] / n]);
    const add: Complex = [term[0] / n, term[1] / n];
    sum = [sum[0] + add[0], sum[1] + add[1]];
    if (Math.hypot(add[0], add[1]) < 1e-17 * Math.max(1, Math.hypot(sum[0], sum[1]))) break;
  }
  return [-EULER_GAMMA - Math.log(size) - sum[0], -arg - sum[1]];
}

/** Wave part of the 2-D pulsating-source Green's function and its x and y derivatives. */
function waveTerm(dx: number, sy: number, nu: number): { value: Complex; dx: Complex; dy: Complex } {
  const z: Complex = [sy, dx];
  const u: Complex = [nu * sy, nu * dx];
  const e1 = expIntegral(u);
  const j = cmul(cexp(u), [e1[0], e1[1] + Math.PI * (dx >= 0 ? 1 : -1)]);
  const inv = cdiv([1, 0], z);
  const jPrime: Complex = [nu * j[0] - inv[0], nu * j[1] - inv[1]];
  const decay = Math.exp(nu * sy);
  const c = Math.cos(nu * dx);
  const sn = Math.sin(nu * dx);
  return {
    value: [-2 * j[0], -2 * Math.PI * decay * c],
    dy: [-2 * jPrime[0], -2 * Math.PI * nu * decay * c],
    dx: [2 * jPrime[1], 2 * Math.PI * nu * decay * sn],
  };
}

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
  const ratio = cdiv([px - ax, py - ay], [px - bx, py - by]);
  const logRatio: Complex = [0.5 * Math.log(ratio[0] * ratio[0] + ratio[1] * ratio[1]), Math.atan2(ratio[1], ratio[0])];
  const fPrime = cmul(logRatio, [tx, -ty]);
  return { value: antiderivative(length) - antiderivative(0), gx: fPrime[0], gy: -fPrime[1] };
}

type HalfSection = readonly (readonly [number, number])[];

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

/** A section's radiation solution at one frequency: heave added mass and damping, and its panels for the wave-force integrals. */
export interface SectionRadiation {
  /** Heave added mass, kg/m. */
  addedMass: number;
  /** Heave radiation damping, N·s/m². */
  damping: number;
  /** Panel midpoint depths (≤ 0), m. */
  depth: Float64Array;
  /** `2·n_z·length` per panel (both halves), m. */
  weight: Float64Array;
  /** Heave radiation potential per unit velocity on each panel, real and imaginary. */
  potentialRe: Float64Array;
  potentialIm: Float64Array;
}

/**
 * Heave added mass and radiation damping of a symmetric section by Frank's close-fit source method: pulsating sources
 * of constant strength on straight panels mirrored to port, the deep-water free-surface Green's function, the body
 * condition at panel midpoints. The section runs keel to waterline as `[half-breadth, depth ≤ 0]` points.
 * @capability boat-seakeeping 2-D heave added mass and radiation damping of a hull section (Frank close-fit)
 */
export function sectionRadiation(section: HalfSection, frequency: number, density = 1025, gravity = 9.81, panels = 6): SectionRadiation {
  const nodes = resample(section, panels);
  const n = panels;
  const nu = (frequency * frequency) / gravity;
  const mid: [number, number][] = [];
  const normal: [number, number][] = [];
  for (let i = 0; i < n; i += 1) {
    const a = nodes[i] ?? [0, 0];
    const b = nodes[i + 1] ?? [0, 0];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    mid.push([0.5 * (a[0] + b[0]), 0.5 * (a[1] + b[1])]);
    normal.push([(b[1] - a[1]) / length, -(b[0] - a[0]) / length]);
  }
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
        const ax = mirror * a[0];
        const bx = mirror * b[0];
        const direct = logSegment(px, py, ax, a[1], bx, b[1]);
        const image = logSegment(px, py, ax, -a[1], bx, -b[1]);
        phiRe += direct.value - image.value;
        fluxRe += i === j && mirror === 1 ? Math.PI : nx * direct.gx + ny * direct.gy;
        fluxRe -= nx * image.gx + ny * image.gy;
        const length = Math.hypot(bx - ax, b[1] - a[1]);
        for (let g = 0; g < GAUSS_POINTS.length; g += 1) {
          const t = 0.5 * (1 + (GAUSS_POINTS[g] ?? 0));
          const w = 0.5 * length * (GAUSS_WEIGHTS[g] ?? 0);
          const wave = waveTerm(px - (ax + t * (bx - ax)), py + (a[1] + t * (b[1] - a[1])), nu);
          phiRe += w * wave.value[0];
          phiIm += w * wave.value[1];
          fluxRe += w * (nx * wave.dx[0] + ny * wave.dy[0]);
          fluxIm += w * (nx * wave.dx[1] + ny * wave.dy[1]);
        }
      }
      potential.push([phiRe, phiIm]);
      flux.push([fluxRe, fluxIm]);
    }
  }
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
  const depth = new Float64Array(n);
  const weight = new Float64Array(n);
  const potentialRe = new Float64Array(n);
  const potentialIm = new Float64Array(n);
  let forceRe = 0;
  let forceIm = 0;
  for (let i = 0; i < n; i += 1) {
    let phiRe = 0;
    let phiIm = 0;
    for (let j = 0; j < n; j += 1) {
      const [pr, pi] = potential[i * n + j] ?? [0, 0];
      const sr = rhs[j] ?? 0;
      const si = rhs[n + j] ?? 0;
      phiRe += pr * sr - pi * si;
      phiIm += pr * si + pi * sr;
    }
    const a = nodes[i] ?? [0, 0];
    const b = nodes[i + 1] ?? [0, 0];
    const w = 2 * (normal[i]?.[1] ?? 0) * Math.hypot(b[0] - a[0], b[1] - a[1]);
    forceRe += phiRe * w;
    forceIm += phiIm * w;
    depth[i] = mid[i]?.[1] ?? 0;
    weight[i] = w;
    potentialRe[i] = phiRe;
    potentialIm[i] = phiIm;
  }
  return { addedMass: -density * forceRe, damping: -frequency * density * forceIm, depth, weight, potentialRe, potentialIm };
}

function interpolate(xs: readonly number[], ys: readonly number[], x: number): number {
  for (let i = 1; i < xs.length; i += 1) {
    const x0 = xs[i - 1] ?? 0;
    const x1 = xs[i] ?? 0;
    if (x <= x1) return (ys[i - 1] ?? 0) + ((x - x0) / Math.max(1e-12, x1 - x0)) * ((ys[i] ?? 0) - (ys[i - 1] ?? 0));
  }
  return ys[ys.length - 1] ?? 0;
}

/**
 * A Wigley hull `y = (B/2)·(1 − ξ²)·(1 − ζ²)` as a table of offsets, stations clustered toward the ends.
 * @capability boat-seakeeping Wigley hull offsets from length, beam and draught
 */
export function wigleyOffsets(length: number, beam: number, draft: number, stations = 11, waterlines = 6): HullOffsetTable {
  const xs = Array.from({ length: stations }, (_, i) => length * (0.5 - 0.5 * Math.cos((Math.PI * i) / (stations - 1))));
  const below = Array.from({ length: waterlines }, (_, i) => (draft * i) / (waterlines - 1));
  const zs = [...below, 1.25 * draft, 1.5 * draft];
  return {
    stations: xs,
    waterlines: zs,
    halfBreadths: xs.map((x) => {
      const xi = (2 * x) / length - 1;
      return zs.map((z) => {
        const zeta = Math.min(0, z - draft) / draft;
        return 0.5 * beam * (1 - xi * xi) * (1 - zeta * zeta);
      });
    }),
  };
}

interface Cut {
  sections: (HalfSection | undefined)[];
  halfBreadth: number[];
  areas: number[];
  volume: number;
  centreOfBuoyancyHeight: number;
}

function cutBelow(offsets: HullOffsetTable, draft: number): Cut {
  const sections: (HalfSection | undefined)[] = [];
  const halfBreadth: number[] = [];
  const areas: number[] = [];
  const moments: number[] = [];
  for (let s = 0; s < offsets.stations.length; s += 1) {
    const row = offsets.halfBreadths[s] ?? [];
    const points: [number, number][] = [[0, -draft]];
    for (let w = 0; w < offsets.waterlines.length; w += 1) {
      const z = offsets.waterlines[w] ?? 0;
      if (z >= draft) break;
      points.push([row[w] ?? 0, z - draft]);
    }
    const top = interpolate(offsets.waterlines, row, draft);
    points.push([top, 0]);
    const clean = points.filter((point, i) => i === 0 || Math.hypot(point[0] - (points[i - 1]?.[0] ?? 0), point[1] - (points[i - 1]?.[1] ?? 0)) > 1e-9);
    let area = 0;
    let moment = 0;
    for (let i = 1; i < clean.length; i += 1) {
      const a = clean[i - 1] ?? [0, 0];
      const b = clean[i] ?? [0, 0];
      const strip = 0.5 * (a[0] + b[0]) * (b[1] - a[1]);
      area += 2 * strip;
      moment += 2 * strip * (draft + 0.5 * (a[1] + b[1]));
    }
    sections.push(clean.some((point) => point[0] > 1e-6 * draft) && clean.length > 1 ? clean : undefined);
    halfBreadth.push(top);
    areas.push(area);
    moments.push(moment);
  }
  const x = offsets.stations;
  let volume = 0;
  let moment = 0;
  for (let i = 1; i < x.length; i += 1) {
    const dx = (x[i] ?? 0) - (x[i - 1] ?? 0);
    volume += 0.5 * dx * ((areas[i] ?? 0) + (areas[i - 1] ?? 0));
    moment += 0.5 * dx * ((moments[i] ?? 0) + (moments[i - 1] ?? 0));
  }
  return { sections, halfBreadth, areas, volume, centreOfBuoyancyHeight: volume > 0 ? moment / volume : 0 };
}

/** A hull's strips and coefficients, ready for {@link seakeepingForces}. */
export interface PreparedSeakeeping {
  /** Reference frequency the radiation coefficients were taken at, rad/s. */
  frequency: number;
  draft: number;
  /** Station positions forward of G, m, and their trapezoid weights along the hull, m. */
  stationX: Float64Array;
  stationWeight: Float64Array;
  /** Waterline half-breadth at each station, m. */
  halfBreadth: Float64Array;
  /** Heave–pitch mass, added mass, damping and restoring about G: `[33, 35, 55]` (35 = 53). */
  inertia: readonly [number, number, number];
  addedMass: readonly [number, number, number];
  damping: readonly [number, number, number];
  restoring: readonly [number, number, number];
  /** Roll inertia (with added), damping and stiffness `ρg∇·GM`. */
  roll: readonly [number, number, number];
  /** Each station's radiation solution, for the wave-force integrals. */
  sections: readonly (SectionRadiation | undefined)[];
  density: number;
  gravity: number;
}

function trapezoidWeights(x: readonly number[]): Float64Array {
  const out = new Float64Array(x.length);
  for (let i = 1; i < x.length; i += 1) {
    const half = 0.5 * ((x[i] ?? 0) - (x[i - 1] ?? 0));
    out[i - 1] = (out[i - 1] ?? 0) + half;
    out[i] = (out[i] ?? 0) + half;
  }
  return out;
}

/**
 * Cuts a hull into strips at its draught and works out its heave–pitch added mass, damping and restoring about G at the
 * reference frequency (strip theory, zero speed), its roll oscillator, and each strip's radiation solution.
 * @capability boat-seakeeping strip-theory heave, pitch and roll coefficients of a hull
 */
export function prepareSeakeeping(hull: HullSeakeeping, length: number, beam: number, massKg: number, water: BoatWater = {}, seaFrequency?: number): PreparedSeakeeping {
  const rho = water.density ?? 1025;
  const g = water.gravity ?? 9.81;
  const panels = Math.max(3, Math.floor(hull.panels ?? 6));
  let draft = hull.draft ?? massKg / (rho * (4 / 9) * length * beam);
  let offsets = hull.offsets ?? wigleyOffsets(length, beam, draft, hull.stations ?? 11);
  if (hull.offsets !== undefined && hull.draft === undefined) {
    const deck = offsets.waterlines[offsets.waterlines.length - 1] ?? 1;
    let low = 0;
    let high = deck;
    for (let i = 0; i < 50; i += 1) {
      const mid = 0.5 * (low + high);
      if (rho * cutBelow(offsets, mid).volume < massKg) low = mid;
      else high = mid;
    }
    draft = 0.5 * (low + high);
  }
  if (hull.offsets === undefined) offsets = wigleyOffsets(length, beam, draft, hull.stations ?? 11);
  const cut = cutBelow(offsets, draft);
  const frequency = hull.referenceFrequency ?? seaFrequency ?? Math.sqrt(g / Math.max(1e-3, draft)) * 0.8;
  const [xg, zg] = hull.centreOfGravity ?? [0.5 * ((offsets.stations[0] ?? 0) + (offsets.stations[offsets.stations.length - 1] ?? length)), draft];
  const x = Float64Array.from(offsets.stations, (station) => station - xg);
  const w = trapezoidWeights(offsets.stations);
  const sections = cut.sections.map((section) => (section === undefined ? undefined : sectionRadiation(section, frequency, rho, g, panels)));
  const mass = rho * cut.volume;
  let a33 = 0, a35 = 0, a55 = 0, b33 = 0, b35 = 0, b55 = 0, c33 = 0, c35 = 0, c55 = 0, waterplaneInertia = 0;
  for (let i = 0; i < x.length; i += 1) {
    const xi = x[i] ?? 0;
    const wi = w[i] ?? 0;
    const a = sections[i]?.addedMass ?? 0;
    const b = sections[i]?.damping ?? 0;
    const y = cut.halfBreadth[i] ?? 0;
    a33 += wi * a;
    a35 -= wi * xi * a;
    a55 += wi * xi * xi * a;
    b33 += wi * b;
    b35 -= wi * xi * b;
    b55 += wi * xi * xi * b;
    c33 += wi * 2 * y;
    c35 -= wi * xi * 2 * y;
    c55 += wi * xi * xi * 2 * y;
    waterplaneInertia += wi * (2 / 3) * y * y * y;
  }
  const pitchRadius = hull.pitchRadius ?? 0.25 * length;
  const rollRadius = hull.rollRadius ?? 0.35 * beam;
  const metacentric = cut.centreOfBuoyancyHeight + (cut.volume > 0 ? waterplaneInertia / cut.volume : 0) - zg;
  const rollStiffness = rho * g * cut.volume * Math.max(0, metacentric);
  const rollInertia = mass * rollRadius * rollRadius * (1 + (hull.rollAddedInertia ?? 0.2));
  const rollDamping = 2 * (hull.rollDamping ?? 0.05) * Math.sqrt(rollInertia * rollStiffness);
  return {
    frequency,
    draft,
    stationX: x,
    stationWeight: w,
    halfBreadth: Float64Array.from(cut.halfBreadth),
    inertia: [mass, 0, mass * pitchRadius * pitchRadius],
    addedMass: [a33, a35, a55],
    damping: [b33, b35, b55],
    restoring: [rho * g * c33, rho * g * c35, rho * g * c55 + rho * g * cut.volume * (cut.centreOfBuoyancyHeight - zg)],
    roll: [rollInertia, rollDamping, rollStiffness],
    sections,
    density: rho,
    gravity: g,
  };
}

/** Each wave component's sectional exciting force per unit amplitude, ready to sum: `[component][station]`, real and imaginary. */
export interface SeakeepingExcitation {
  re: Float64Array;
  im: Float64Array;
  stations: number;
}

/**
 * Sectional exciting force per unit wave amplitude for every component of a wave field: the Froude–Krylov pressure
 * `−ρg·∫e^(kz)·n_z ds` on each section plus diffraction `ρω²·∫φ₃·n_z·e^(kz) ds` from the radiation potential, times the
 * strip's length weight.
 * @capability boat-seakeeping Froude–Krylov and diffraction wave forces per strip for a wave field
 */
export function seakeepingExcitation(prepared: PreparedSeakeeping, field: WaveField): SeakeepingExcitation {
  const stations = prepared.stationX.length;
  const count = field.components.length;
  const re = new Float64Array(count * stations);
  const im = new Float64Array(count * stations);
  const rho = prepared.density;
  for (let c = 0; c < count; c += 1) {
    const component = field.components[c];
    if (component === undefined) continue;
    const k = component.wavenumber;
    const w2 = component.frequency * component.frequency;
    for (let i = 0; i < stations; i += 1) {
      const section = prepared.sections[i];
      if (section === undefined) continue;
      let fk = 0;
      let dRe = 0;
      let dIm = 0;
      for (let p = 0; p < section.depth.length; p += 1) {
        const decay = Math.exp(k * (section.depth[p] ?? 0)) * (section.weight[p] ?? 0);
        fk += decay;
        dRe += (section.potentialRe[p] ?? 0) * decay;
        dIm += (section.potentialIm[p] ?? 0) * decay;
      }
      const weight = prepared.stationWeight[i] ?? 0;
      re[c * stations + i] = weight * (-rho * prepared.gravity * fk + rho * w2 * dRe);
      im[c * stations + i] = weight * rho * w2 * dIm;
    }
  }
  return { re, im, stations };
}

/** Heave force, pitch moment (bow down) and roll moment (port down) on a hull, N and N·m. */
export type SeakeepingLoads = [heave: number, pitch: number, roll: number];

/**
 * Wave loads on a hull at G `(x, z)` heading along `(forwardX, forwardZ)` at a time: each component's sectional force
 * summed with its phase along the hull and the beam-averaging `sinc(k_t·b)` of its crests across each strip, and the
 * roll moment from the wave slope across the hull.
 * @capability boat-seakeeping time-domain wave loads on a hull from a wave field
 */
export function seakeepingForces(prepared: PreparedSeakeeping, excitation: SeakeepingExcitation, field: WaveField, x: number, z: number, forwardX: number, forwardZ: number, time: number, out: SeakeepingLoads = [0, 0, 0]): SeakeepingLoads {
  let heave = 0;
  let pitch = 0;
  let slope = 0;
  const stations = excitation.stations;
  const draft = prepared.draft;
  for (let c = 0; c < field.components.length; c += 1) {
    const component = field.components[c];
    if (component === undefined) continue;
    const k = component.wavenumber;
    const dx = Math.cos(component.direction);
    const dz = Math.sin(component.direction);
    const along = dx * forwardX + dz * forwardZ;
    const across = dx * forwardZ - dz * forwardX;
    const base = k * (dx * x + dz * z) - component.frequency * time + component.phase;
    const a = component.amplitude;
    for (let i = 0; i < stations; i += 1) {
      const re = excitation.re[c * stations + i] ?? 0;
      const im = excitation.im[c * stations + i] ?? 0;
      if (re === 0 && im === 0) continue;
      const xi = prepared.stationX[i] ?? 0;
      const psi = base + k * along * xi;
      const halfWidth = k * across * (prepared.halfBreadth[i] ?? 0);
      const sinc = Math.abs(halfWidth) < 1e-6 ? 1 : Math.sin(halfWidth) / halfWidth;
      const force = a * sinc * (re * Math.cos(psi) - im * Math.sin(psi));
      heave += force;
      pitch -= xi * force;
    }
    slope -= a * k * across * Math.exp(-0.5 * k * draft) * Math.sin(base);
  }
  out[0] = heave;
  out[1] = pitch;
  out[2] = prepared.roll[2] * slope;
  return out;
}

/**
 * Wave loads from a plain surface-height function (no wave field): each strip's waterline breadth times its surface
 * elevation above `level` (Froude–Krylov in the long-wave limit), and roll from the height difference across the beam.
 * @capability boat-seakeeping wave loads on a hull from any water-height function
 */
export function seakeepingForcesFromHeight(prepared: PreparedSeakeeping, height: (x: number, z: number) => number, level: number, x: number, z: number, forwardX: number, forwardZ: number, out: SeakeepingLoads = [0, 0, 0]): SeakeepingLoads {
  const rhoG = prepared.density * prepared.gravity;
  let heave = 0;
  let pitch = 0;
  for (let i = 0; i < prepared.stationX.length; i += 1) {
    const xi = prepared.stationX[i] ?? 0;
    const force = rhoG * (prepared.stationWeight[i] ?? 0) * 2 * (prepared.halfBreadth[i] ?? 0) * (height(x + forwardX * xi, z + forwardZ * xi) - level);
    heave += force;
    pitch -= xi * force;
  }
  let half = 0;
  for (let i = 0; i < prepared.halfBreadth.length; i += 1) half = Math.max(half, prepared.halfBreadth[i] ?? 0);
  // Starboard is the forward direction turned clockwise seen from above: (forwardZ, −forwardX) on the XZ plane.
  const sx = forwardZ;
  const sz = -forwardX;
  const slope = half > 0 ? (height(x + sx * half, z + sz * half) - height(x - sx * half, z - sz * half)) / (2 * half) : 0;
  out[0] = heave;
  out[1] = pitch;
  out[2] = prepared.roll[2] * slope;
  return out;
}
