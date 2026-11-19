import type { HullOffsets } from "./hullForm";
import { MARINE_GRAVITY, SEA_WATER_DENSITY } from "./hullHydrostatics";
import { sectionHeave, type HalfSection } from "./sectionHydrodynamics";

export interface StripHull {
  offsets: HullOffsets;
  draft: number;
  centreOfGravity: readonly [number, number];
  pitchRadius: number;
  density?: number;
  gravity?: number;
  panels?: number;
}

export interface HeavePitchResponse {
  frequency: number;
  wavenumber: number;
  heave: number;
  pitch: number;
  heavePhase: number;
  pitchPhase: number;
  coefficients: HeavePitchCoefficients;
}

export interface HeavePitchCoefficients {
  mass: number;
  pitchInertia: number;
  addedMass: readonly [number, number, number, number];
  damping: readonly [number, number, number, number];
  restoring: readonly [number, number, number, number];
}

export interface StripSections {
  x: readonly number[];
  sections: readonly (HalfSection | undefined)[];
  halfBreadth: readonly number[];
  volume: number;
  centreOfBuoyancyHeight: number;
}

function interpolate(xs: readonly number[], ys: readonly number[], x: number): number {
  for (let i = 1; i < xs.length; i += 1) {
    const x0 = xs[i - 1] ?? 0;
    const x1 = xs[i] ?? 0;
    if (x <= x1) return (ys[i - 1] ?? 0) + ((x - x0) / Math.max(1e-12, x1 - x0)) * ((ys[i] ?? 0) - (ys[i - 1] ?? 0));
  }
  return ys[ys.length - 1] ?? 0;
}

/** @capability strip-theory ship sections below the waterline from a table of offsets */
export function stripSections(offsets: HullOffsets, draft: number): StripSections {
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
    const wide = clean.some((point) => point[0] > 1e-6 * draft);
    sections.push(wide && clean.length > 1 ? clean : undefined);
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
  return { x, sections, halfBreadth, volume, centreOfBuoyancyHeight: volume > 0 ? moment / volume : 0 };
}

function trapezoid(x: readonly number[], f: (i: number) => number): number {
  let sum = 0;
  for (let i = 1; i < x.length; i += 1) sum += 0.5 * ((x[i] ?? 0) - (x[i - 1] ?? 0)) * (f(i) + f(i - 1));
  return sum;
}

/** @capability strip-theory heave and pitch response amplitude operators in head waves */
export function heavePitchResponse(hull: StripHull, frequency: number, prepared: StripSections = stripSections(hull.offsets, hull.draft)): HeavePitchResponse {
  const rho = hull.density ?? SEA_WATER_DENSITY;
  const g = hull.gravity ?? MARINE_GRAVITY;
  const k = (frequency * frequency) / g;
  const [xg, zg] = hull.centreOfGravity;
  const x = prepared.x.map((station) => station - xg);
  const local = prepared.sections.map((section) => (section === undefined ? undefined : sectionHeave(section, frequency, rho, g, hull.panels ?? 20)));
  const a = (i: number) => local[i]?.addedMass ?? 0;
  const b = (i: number) => local[i]?.damping ?? 0;
  const breadth = (i: number) => 2 * (prepared.halfBreadth[i] ?? 0);
  const at = (i: number) => x[i] ?? 0;
  const mass = rho * prepared.volume;
  const pitchInertia = mass * hull.pitchRadius * hull.pitchRadius;
  const A33 = trapezoid(x, a);
  const A35 = -trapezoid(x, (i) => at(i) * a(i));
  const A55 = trapezoid(x, (i) => at(i) * at(i) * a(i));
  const B33 = trapezoid(x, b);
  const B35 = -trapezoid(x, (i) => at(i) * b(i));
  const B55 = trapezoid(x, (i) => at(i) * at(i) * b(i));
  const C33 = rho * g * trapezoid(x, breadth);
  const C35 = -rho * g * trapezoid(x, (i) => at(i) * breadth(i));
  const C55 = rho * g * trapezoid(x, (i) => at(i) * at(i) * breadth(i)) + rho * g * prepared.volume * (prepared.centreOfBuoyancyHeight - zg);
  // Sectional exciting force per unit wave amplitude, head seas (κ = −k): Froude–Krylov plus diffraction.
  const force = (i: number): [number, number] => {
    const section = local[i];
    if (section === undefined) return [0, 0];
    const re = -rho * g * section.froudeKrylov + rho * frequency * frequency * section.diffraction[0];
    const im = rho * frequency * frequency * section.diffraction[1];
    const phase = -k * at(i);
    return [re * Math.cos(phase) - im * Math.sin(phase), re * Math.sin(phase) + im * Math.cos(phase)];
  };
  const forces = x.map((_, i) => force(i));
  const F3: [number, number] = [trapezoid(x, (i) => forces[i]?.[0] ?? 0), trapezoid(x, (i) => forces[i]?.[1] ?? 0)];
  const F5: [number, number] = [-trapezoid(x, (i) => at(i) * (forces[i]?.[0] ?? 0)), -trapezoid(x, (i) => at(i) * (forces[i]?.[1] ?? 0))];
  const w2 = frequency * frequency;
  // [−ω²(M + A) − iωB + C]·X = F, e^(−iωt).
  const m11: [number, number] = [-w2 * (mass + A33) + C33, -frequency * B33];
  const m12: [number, number] = [-w2 * A35 + C35, -frequency * B35];
  const m21: [number, number] = [-w2 * A35 + C35, -frequency * B35];
  const m22: [number, number] = [-w2 * (pitchInertia + A55) + C55, -frequency * B55];
  const cmul = (p: readonly [number, number], q: readonly [number, number]): [number, number] => [p[0] * q[0] - p[1] * q[1], p[0] * q[1] + p[1] * q[0]];
  const csub = (p: readonly [number, number], q: readonly [number, number]): [number, number] => [p[0] - q[0], p[1] - q[1]];
  const cdiv = (p: readonly [number, number], q: readonly [number, number]): [number, number] => {
    const d = q[0] * q[0] + q[1] * q[1];
    return [(p[0] * q[0] + p[1] * q[1]) / d, (p[1] * q[0] - p[0] * q[1]) / d];
  };
  const det = csub(cmul(m11, m22), cmul(m12, m21));
  const heave = cdiv(csub(cmul(F3, m22), cmul(m12, F5)), det);
  const pitch = cdiv(csub(cmul(m11, F5), cmul(m21, F3)), det);
  return {
    frequency,
    wavenumber: k,
    heave: Math.hypot(heave[0], heave[1]),
    pitch: Math.hypot(pitch[0], pitch[1]) / k,
    heavePhase: Math.atan2(heave[1], heave[0]),
    pitchPhase: Math.atan2(pitch[1], pitch[0]),
    coefficients: {
      mass,
      pitchInertia,
      addedMass: [A33, A35, A35, A55],
      damping: [B33, B35, B35, B55],
      restoring: [C33, C35, C35, C55],
    },
  };
}
