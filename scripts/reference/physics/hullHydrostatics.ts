// @skill jgengine-world
import { solveLinearSystem } from "@jgengine/core/math/linearAlgebra";
import type { HullMesh } from "./hullForm";

/** Sea water at 15 °C (ITTC 7.5-02-01-03), kg/m³. */
export const SEA_WATER_DENSITY = 1025.9;
/** Standard gravity, m/s². */
export const MARINE_GRAVITY = 9.80665;

/**
 * The water a hull sits in, sampled at earth points (`x`, `y` horizontal, `z` up). `submergence` is how far below the
 * free surface a point is (negative above it); `pressure` is the gauge pressure there, Pa. Still water:
 * `submergence = −z`, `pressure = ρ·g·max(0, −z)`.
 */
export interface HullWater {
  submergence(x: number, y: number, z: number): number;
  pressure(x: number, y: number, z: number): number;
}

/**
 * Still water with its surface at `level`.
 * @capability hull-hydrostatics still-water pressure field for hull integration
 */
export function stillWater(density = SEA_WATER_DENSITY, gravity = MARINE_GRAVITY, level = 0): HullWater {
  return {
    submergence: (_x, _y, z) => level - z,
    pressure: (_x, _y, z) => density * gravity * Math.max(0, level - z),
  };
}

/** Pressure loads and submerged geometry of a posed hull, earth axes. */
export interface HullLoads {
  /** Pressure force on the hull, N. */
  force: Float64Array;
  /** Pressure moment about the earth origin, N·m. */
  moment: Float64Array;
  /** Submerged volume, m³ (exact for still water). */
  volume: number;
  /** Centre of the submerged volume, earth axes. */
  centroid: Float64Array;
  /** Wetted hull area, m². */
  wettedArea: number;
  /** Waterplane area, m², and its centroid and second moments about that centroid (`ixx = ∫y²`, `iyy = ∫x²`). */
  waterplaneArea: number;
  waterplaneCentroid: Float64Array;
  waterplaneIxx: number;
  waterplaneIyy: number;
  waterplaneIxy: number;
  /** Fore-and-aft and athwartships extent of the waterline, m (earth axes). */
  waterlineLength: number;
  waterlineBreadth: number;
}

/**
 * Creates an empty {@link HullLoads} to pass to {@link HullIntegrator.integrate}.
 * @capability hull-hydrostatics reusable output buffer for hull pressure integration
 */
export function createHullLoads(): HullLoads {
  return {
    force: new Float64Array(3),
    moment: new Float64Array(3),
    volume: 0,
    centroid: new Float64Array(3),
    wettedArea: 0,
    waterplaneArea: 0,
    waterplaneCentroid: new Float64Array(2),
    waterplaneIxx: 0,
    waterplaneIyy: 0,
    waterplaneIxy: 0,
    waterlineLength: 0,
    waterlineBreadth: 0,
  };
}

/** Integrates water pressure over a hull mesh in any pose. */
export interface HullIntegrator {
  /**
   * Poses the mesh (`earth = rotation · hull + translation`, `rotation` a row-major 3×3) and integrates the water's
   * pressure over every wetted triangle, cutting triangles exactly where they cross the surface. Writes into `out`.
   */
  integrate(rotation: ArrayLike<number>, translation: ArrayLike<number>, water: HullWater, out: HullLoads): HullLoads;
}

/**
 * Creates a {@link HullIntegrator} for a closed, outward-facing mesh. Pressure is taken linear over each (cut) triangle,
 * which is exact for still water, so buoyancy, its centre and the waterplane come straight out of the geometry; the
 * submerged volume and its centroid use the divergence theorem over the wetted surface alone (the waterplane carries
 * none of it). Scratch buffers are allocated once.
 * @capability hull-hydrostatics pressure integration over a hull mesh cut at the free surface
 */
export function createHullIntegrator(mesh: HullMesh): HullIntegrator {
  const count = mesh.positions.length / 3;
  const earth = new Float64Array(count * 3);
  const depth = new Float64Array(count);
  const pressure = new Float64Array(count);
  // One cut polygon: up to four corners of x, y, z, depth, pressure.
  const poly = new Float64Array(4 * 5);
  const tri = new Float64Array(3 * 5);

  return {
    integrate(rotation, translation, water, out) {
      out.force.fill(0);
      out.moment.fill(0);
      out.volume = 0;
      out.wettedArea = 0;
      let vx = 0, vy = 0, vz = 0;
      let wa = 0, wcx = 0, wcy = 0, wixx = 0, wiyy = 0, wixy = 0;
      let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;

      function addTriangle(a: number, b: number, c: number): void {
        const ax = poly[a] ?? 0, ay = poly[a + 1] ?? 0, az = poly[a + 2] ?? 0;
        const bx = poly[b] ?? 0, by = poly[b + 1] ?? 0, bz = poly[b + 2] ?? 0;
        const cx = poly[c] ?? 0, cy = poly[c + 1] ?? 0, cz = poly[c + 2] ?? 0;
        const da = poly[a + 3] ?? 0, db = poly[b + 3] ?? 0, dc = poly[c + 3] ?? 0;
        const pa = poly[a + 4] ?? 0, pb = poly[b + 4] ?? 0, pc = poly[c + 4] ?? 0;
        const ux = bx - ax, uy = by - ay, uz = bz - az;
        const wx = cx - ax, wy = cy - ay, wz = cz - az;
        // Area vector: half the cross product, along the outward normal.
        const nx = 0.5 * (uy * wz - uz * wy);
        const ny = 0.5 * (uz * wx - ux * wz);
        const nz = 0.5 * (ux * wy - uy * wx);
        out.wettedArea += Math.hypot(nx, ny, nz);
        const pSum = pa + pb + pc;
        const pMean = pSum / 3;
        out.force[0] = (out.force[0] ?? 0) - pMean * nx;
        out.force[1] = (out.force[1] ?? 0) - pMean * ny;
        out.force[2] = (out.force[2] ?? 0) - pMean * nz;
        // ∫p·r dA / A for linear p over a triangle: (Σpᵢrᵢ + Σpᵢ·Σrᵢ)/12; moment = −(that) × area vector.
        const rx = (pa * ax + pb * bx + pc * cx + pSum * (ax + bx + cx)) / 12;
        const ry = (pa * ay + pb * by + pc * cy + pSum * (ay + by + cy)) / 12;
        const rz = (pa * az + pb * bz + pc * cz + pSum * (az + bz + cz)) / 12;
        out.moment[0] = (out.moment[0] ?? 0) - (ry * nz - rz * ny);
        out.moment[1] = (out.moment[1] ?? 0) - (rz * nx - rx * nz);
        out.moment[2] = (out.moment[2] ?? 0) - (rx * ny - ry * nx);
        // Volume integrals by the divergence theorem with fields that vanish on the free surface (e = −depth).
        const ea = -da, eb = -db, ec = -dc;
        const eSum = ea + eb + ec;
        out.volume += (nz * eSum) / 3;
        vx += (nz * (ax * ea + bx * eb + cx * ec + (ax + bx + cx) * eSum)) / 12;
        vy += (nz * (ay * ea + by * eb + cy * ec + (ay + by + cy) * eSum)) / 12;
        // ∫z dV = ∮ (z² − η²)/2 n_z with η = z + depth: (z − η)(z + η)/2 = e·(2z + d)/2.
        const ha = az + 0.5 * da, hb = bz + 0.5 * db, hc = cz + 0.5 * dc;
        vz += (nz * (ha * ea + hb * eb + hc * ec + (ha + hb + hc) * eSum)) / 12;
      }

      function addWaterline(p: number, q: number): void {
        const xp = poly[p] ?? 0, yp = poly[p + 1] ?? 0, xq = poly[q] ?? 0, yq = poly[q + 1] ?? 0;
        const cross = xp * yq - xq * yp;
        xMin = Math.min(xMin, xp, xq);
        xMax = Math.max(xMax, xp, xq);
        yMin = Math.min(yMin, yp, yq);
        yMax = Math.max(yMax, yp, yq);
        wa += cross / 2;
        wcx += ((xp + xq) * cross) / 6;
        wcy += ((yp + yq) * cross) / 6;
        wixx += ((yp * yp + yp * yq + yq * yq) * cross) / 12;
        wiyy += ((xp * xp + xp * xq + xq * xq) * cross) / 12;
        wixy += ((xp * yq + 2 * xp * yp + 2 * xq * yq + xq * yp) * cross) / 24;
      }

      function loadCorner(slot: number, vertex: number): void {
        tri[slot] = earth[vertex * 3] ?? 0;
        tri[slot + 1] = earth[vertex * 3 + 1] ?? 0;
        tri[slot + 2] = earth[vertex * 3 + 2] ?? 0;
        tri[slot + 3] = depth[vertex] ?? 0;
        tri[slot + 4] = pressure[vertex] ?? 0;
      }

      function copyCorner(to: number, from: number): void {
        for (let k = 0; k < 5; k += 1) poly[to + k] = tri[from + k] ?? 0;
      }

      function crossing(to: number, from: number, onto: number): void {
        const d0 = tri[from + 3] ?? 0;
        const d1 = tri[onto + 3] ?? 0;
        const s = d0 / (d0 - d1);
        for (let k = 0; k < 5; k += 1) poly[to + k] = (tri[from + k] ?? 0) + s * ((tri[onto + k] ?? 0) - (tri[from + k] ?? 0));
        // The surface itself: zero submergence and zero gauge pressure.
        poly[to + 3] = 0;
        poly[to + 4] = 0;
      }

      const r0 = rotation[0] ?? 0, r1 = rotation[1] ?? 0, r2 = rotation[2] ?? 0;
      const r3 = rotation[3] ?? 0, r4 = rotation[4] ?? 0, r5 = rotation[5] ?? 0;
      const r6 = rotation[6] ?? 0, r7 = rotation[7] ?? 0, r8 = rotation[8] ?? 0;
      const tx = translation[0] ?? 0, ty = translation[1] ?? 0, tz = translation[2] ?? 0;
      const p = mesh.positions;
      for (let i = 0; i < count; i += 1) {
        const x = p[i * 3] ?? 0, y = p[i * 3 + 1] ?? 0, z = p[i * 3 + 2] ?? 0;
        const ex = r0 * x + r1 * y + r2 * z + tx;
        const ey = r3 * x + r4 * y + r5 * z + ty;
        const ez = r6 * x + r7 * y + r8 * z + tz;
        earth[i * 3] = ex;
        earth[i * 3 + 1] = ey;
        earth[i * 3 + 2] = ez;
        const d = water.submergence(ex, ey, ez);
        depth[i] = d;
        pressure[i] = d > 0 ? water.pressure(ex, ey, ez) : 0;
      }
      const t = mesh.triangles;
      for (let k = 0; k < t.length; k += 3) {
        const ia = t[k] ?? 0, ib = t[k + 1] ?? 0, ic = t[k + 2] ?? 0;
        const da = depth[ia] ?? 0, db = depth[ib] ?? 0, dc = depth[ic] ?? 0;
        if (da <= 0 && db <= 0 && dc <= 0) continue;
        loadCorner(0, ia);
        loadCorner(5, ib);
        loadCorner(10, ic);
        if (da > 0 && db > 0 && dc > 0) {
          copyCorner(0, 0);
          copyCorner(5, 5);
          copyCorner(10, 10);
          addTriangle(0, 5, 10);
          continue;
        }
        // Walk the edges in order, keeping wet corners and adding a point wherever an edge crosses the surface.
        let n = 0;
        let exit = -1;
        let entry = -1;
        for (let e = 0; e < 3; e += 1) {
          const from = e * 5;
          const onto = ((e + 1) % 3) * 5;
          const dFrom = tri[from + 3] ?? 0;
          const dOnto = tri[onto + 3] ?? 0;
          if (dFrom > 0) {
            copyCorner(n * 5, from);
            n += 1;
          }
          if (dFrom > 0 !== dOnto > 0) {
            crossing(n * 5, from, onto);
            if (dFrom > 0) exit = n * 5;
            else entry = n * 5;
            n += 1;
          }
        }
        if (n >= 3) addTriangle(0, 5, 10);
        if (n === 4) addTriangle(0, 10, 15);
        if (exit >= 0 && entry >= 0) addWaterline(exit, entry);
      }
      const v = out.volume;
      out.centroid[0] = v !== 0 ? vx / v : 0;
      out.centroid[1] = v !== 0 ? vy / v : 0;
      out.centroid[2] = v !== 0 ? vz / v : 0;
      const sign = wa < 0 ? -1 : 1;
      const area = sign * wa;
      out.waterplaneArea = area;
      const cx = area > 0 ? (sign * wcx) / area : 0;
      const cy = area > 0 ? (sign * wcy) / area : 0;
      out.waterplaneCentroid[0] = cx;
      out.waterplaneCentroid[1] = cy;
      out.waterplaneIxx = sign * wixx - area * cy * cy;
      out.waterplaneIyy = sign * wiyy - area * cx * cx;
      out.waterplaneIxy = sign * wixy - area * cx * cy;
      out.waterlineLength = xMax > xMin ? xMax - xMin : 0;
      out.waterlineBreadth = yMax > yMin ? yMax - yMin : 0;
      return out;
    },
  };
}

/**
 * Row-major rotation for heel `phi` (about +x, positive heels to starboard) then trim `theta` (about +y, positive bow down).
 * @capability hull-hydrostatics heel-then-trim rotation matrix in hull axes
 */
export function heelTrimRotation(phi: number, theta: number, out: Float64Array = new Float64Array(9)): Float64Array {
  const cp = Math.cos(phi), sp = Math.sin(phi), ct = Math.cos(theta), st = Math.sin(theta);
  // R = Ry(theta) · Rx(phi)
  out[0] = ct;
  out[1] = st * sp;
  out[2] = st * cp;
  out[3] = 0;
  out[4] = cp;
  out[5] = -sp;
  out[6] = -st;
  out[7] = ct * sp;
  out[8] = ct * cp;
  return out;
}

/** Mass properties of a floating hull, hull axes. */
export interface FloatingCondition {
  /** Displacement mass, kg. */
  massKg: number;
  /** Centre of gravity, hull axes (`x` from the table's aft end, `z` above the keel). */
  centreOfGravity: readonly [number, number, number];
  density?: number;
  gravity?: number;
}

/** A hull's floating attitude. */
export interface FloatingAttitude {
  /** Height of the centre of gravity above the still water surface, m. */
  heightOfG: number;
  /** Heel, rad (positive to starboard). */
  heel: number;
  /** Trim, rad (positive bow down). */
  trim: number;
}

interface PosedLoads {
  loads: HullLoads;
  /** Moment of the pressure about G, earth axes. */
  momentAboutG: Float64Array;
}

function createPoser(mesh: HullMesh, condition: FloatingCondition) {
  const integrator = createHullIntegrator(mesh);
  const water = stillWater(condition.density, condition.gravity);
  const loads = createHullLoads();
  const rotation = new Float64Array(9);
  const translation = new Float64Array(3);
  const momentAboutG = new Float64Array(3);
  const [gx, gy, gz] = condition.centreOfGravity;
  return (attitude: FloatingAttitude): PosedLoads => {
    heelTrimRotation(attitude.heel, attitude.trim, rotation);
    // earth = R·(r − G) + (0, 0, heightOfG)
    translation[0] = -((rotation[0] ?? 0) * gx + (rotation[1] ?? 0) * gy + (rotation[2] ?? 0) * gz);
    translation[1] = -((rotation[3] ?? 0) * gx + (rotation[4] ?? 0) * gy + (rotation[5] ?? 0) * gz);
    translation[2] = attitude.heightOfG - ((rotation[6] ?? 0) * gx + (rotation[7] ?? 0) * gy + (rotation[8] ?? 0) * gz);
    integrator.integrate(rotation, translation, water, loads);
    const h = attitude.heightOfG;
    const f = loads.force;
    // M_G = M_O − r_G × F with r_G = (0, 0, h).
    momentAboutG[0] = (loads.moment[0] ?? 0) + h * (f[1] ?? 0);
    momentAboutG[1] = (loads.moment[1] ?? 0) - h * (f[0] ?? 0);
    momentAboutG[2] = loads.moment[2] ?? 0;
    return { loads, momentAboutG };
  };
}

/**
 * Newton's method with a finite-difference Jacobian and step halving, for the small hydrostatic balances here.
 * `residual` writes `n` scaled residuals; returns whether the norm fell below `tolerance`.
 */
function newton(x: Float64Array, n: number, residual: (x: Float64Array, out: Float64Array) => void, steps: Float64Array, tolerance: number): boolean {
  const r = new Float64Array(n);
  const trial = new Float64Array(n);
  const rt = new Float64Array(n);
  const jac = new Float64Array(n * n);
  const norm = (v: Float64Array) => Math.sqrt(v.reduce((sum, value) => sum + value * value, 0));
  residual(x, r);
  for (let iteration = 0; iteration < 60; iteration += 1) {
    const current = norm(r);
    if (current < tolerance) return true;
    for (let j = 0; j < n; j += 1) {
      trial.set(x);
      const h = steps[j] ?? 1e-6;
      trial[j] = (trial[j] ?? 0) + h;
      residual(trial, rt);
      for (let i = 0; i < n; i += 1) jac[i * n + j] = ((rt[i] ?? 0) - (r[i] ?? 0)) / h;
    }
    const delta = Float64Array.from(r, (value) => -value);
    solveLinearSystem(jac, delta, n);
    let scale = 1;
    for (let halving = 0; halving < 30; halving += 1) {
      for (let i = 0; i < n; i += 1) trial[i] = (x[i] ?? 0) + scale * (delta[i] ?? 0);
      residual(trial, rt);
      if (norm(rt) < current) break;
      scale /= 2;
    }
    x.set(trial);
    r.set(rt);
  }
  return norm(r) < tolerance;
}

/**
 * Finds where a hull floats freely in still water: the height, heel and trim at which buoyancy carries the weight and
 * passes through the centre of gravity.
 * @capability hull-hydrostatics free-floating equilibrium (sinkage, heel, trim) of a hull mesh
 */
export function floatingEquilibrium(mesh: HullMesh, condition: FloatingCondition, guess?: FloatingAttitude): FloatingAttitude {
  const pose = createPoser(mesh, condition);
  const weight = condition.massKg * (condition.gravity ?? MARINE_GRAVITY);
  const scale = Math.cbrt(Math.abs(condition.massKg / (condition.density ?? SEA_WATER_DENSITY)));
  const x = Float64Array.of(guess?.heightOfG ?? 0, guess?.heel ?? 0, guess?.trim ?? 0);
  if (guess === undefined) x[0] = bracketHeight(pose, weight, condition.centreOfGravity[2]);
  newton(
    x,
    3,
    (v, out) => {
      const { loads, momentAboutG } = pose({ heightOfG: v[0] ?? 0, heel: v[1] ?? 0, trim: v[2] ?? 0 });
      out[0] = ((loads.force[2] ?? 0) - weight) / weight;
      out[1] = (momentAboutG[0] ?? 0) / (weight * scale);
      out[2] = (momentAboutG[1] ?? 0) / (weight * scale);
    },
    Float64Array.of(1e-5 * scale, 1e-6, 1e-6),
    1e-11,
  );
  return { heightOfG: x[0] ?? 0, heel: x[1] ?? 0, trim: x[2] ?? 0 };
}

function bracketHeight(pose: (attitude: FloatingAttitude) => PosedLoads, weight: number, kg: number): number {
  // Buoyancy falls as G rises; bisect between the hull fully sunk and fully clear.
  let low = -kg - 1e3;
  let high = kg + 1e3;
  for (let i = 0; i < 200; i += 1) {
    const mid = 0.5 * (low + high);
    const lift = pose({ heightOfG: mid, heel: 0, trim: 0 }).loads.force[2] ?? 0;
    if (lift > weight) low = mid;
    else high = mid;
  }
  return 0.5 * (low + high);
}

/** Upright hydrostatic particulars at the free-floating attitude, hull axes. */
export interface HydrostaticParticulars {
  attitude: FloatingAttitude;
  /** Displaced volume, m³. */
  volume: number;
  /** Mean draught at the keel, m (height of the waterline above `z = 0` at the centre of gravity's station). */
  draft: number;
  /** Centre of buoyancy, hull axes. */
  centreOfBuoyancy: [number, number, number];
  wettedArea: number;
  waterplaneArea: number;
  /** Waterline length and breadth, m. */
  waterlineLength: number;
  waterlineBreadth: number;
  /** Longitudinal centre of flotation, hull axes `x`. */
  centreOfFlotation: number;
  /** Transverse metacentric radius `I_T / ∇`, m. */
  transverseMetacentricRadius: number;
  /** Longitudinal metacentric radius `I_L / ∇`, m. */
  longitudinalMetacentricRadius: number;
  /** Height of the transverse metacentre above the keel, m. */
  transverseMetacentre: number;
  /** Transverse metacentric height `KM_T − KG`, m. */
  transverseMetacentricHeight: number;
  /** Longitudinal metacentric height `KM_L − KG`, m. */
  longitudinalMetacentricHeight: number;
}

/**
 * Floats a hull and reads its hydrostatics off the integrated geometry: volume, centre of buoyancy, waterplane, metacentric
 * radii (`I/∇` of the cut waterplane) and metacentric heights.
 * @capability hull-hydrostatics displacement, KB, LCB, waterplane, BM and GM of a hull mesh
 */
export function hydrostaticParticulars(mesh: HullMesh, condition: FloatingCondition): HydrostaticParticulars {
  const attitude = floatingEquilibrium(mesh, condition);
  const pose = createPoser(mesh, condition);
  const { loads } = pose(attitude);
  const rotation = heelTrimRotation(attitude.heel, attitude.trim);
  const [gx, gy, gz] = condition.centreOfGravity;
  // hull = Rᵀ·(earth − (0, 0, h)) + G
  const toHull = (ex: number, ey: number, ez: number): [number, number, number] => {
    const z = ez - attitude.heightOfG;
    return [
      (rotation[0] ?? 0) * ex + (rotation[3] ?? 0) * ey + (rotation[6] ?? 0) * z + gx,
      (rotation[1] ?? 0) * ex + (rotation[4] ?? 0) * ey + (rotation[7] ?? 0) * z + gy,
      (rotation[2] ?? 0) * ex + (rotation[5] ?? 0) * ey + (rotation[8] ?? 0) * z + gz,
    ];
  };
  const centreOfBuoyancy = toHull(loads.centroid[0] ?? 0, loads.centroid[1] ?? 0, loads.centroid[2] ?? 0);
  const flotation = toHull(loads.waterplaneCentroid[0] ?? 0, loads.waterplaneCentroid[1] ?? 0, 0);
  const volume = loads.volume;
  const bmT = loads.waterplaneIxx / volume;
  const bmL = loads.waterplaneIyy / volume;
  const kmT = centreOfBuoyancy[2] + bmT;
  // The keel point under G: its depth below the surface.
  const keelDepth = -((rotation[7] ?? 0) * -gy + (rotation[8] ?? 0) * -gz + attitude.heightOfG);
  return {
    attitude,
    volume,
    draft: keelDepth,
    centreOfBuoyancy,
    wettedArea: loads.wettedArea,
    waterplaneArea: loads.waterplaneArea,
    waterlineLength: loads.waterlineLength,
    waterlineBreadth: loads.waterlineBreadth,
    centreOfFlotation: flotation[0],
    transverseMetacentricRadius: bmT,
    longitudinalMetacentricRadius: bmL,
    transverseMetacentre: kmT,
    transverseMetacentricHeight: kmT - gz,
    longitudinalMetacentricHeight: centreOfBuoyancy[2] + bmL - gz,
  };
}

/** One point of a righting-arm curve. */
export interface RightingArmPoint {
  /** Heel, rad. */
  heel: number;
  /** Righting arm GZ, m (positive rights the hull). */
  arm: number;
  /** Free trim at this heel, rad. */
  trim: number;
  /** Height of G above the water, m. */
  heightOfG: number;
}

/**
 * The statical stability (GZ) curve with free trim: at each heel the hull sinks and trims until buoyancy carries the
 * weight with no trimming moment, and the remaining heeling moment over the weight is the righting arm. Heels in rad.
 * @capability hull-hydrostatics large-angle righting-arm (GZ) curve with free trim from hull geometry
 */
export function rightingArmCurve(mesh: HullMesh, condition: FloatingCondition, heels: readonly number[]): RightingArmPoint[] {
  const pose = createPoser(mesh, condition);
  const weight = condition.massKg * (condition.gravity ?? MARINE_GRAVITY);
  const upright = floatingEquilibrium(mesh, condition);
  const scale = Math.cbrt(Math.abs(condition.massKg / (condition.density ?? SEA_WATER_DENSITY)));
  const x = Float64Array.of(upright.heightOfG, upright.trim);
  return heels.map((heel) => {
    newton(
      x,
      2,
      (v, out) => {
        const { loads, momentAboutG } = pose({ heightOfG: v[0] ?? 0, heel, trim: v[1] ?? 0 });
        out[0] = ((loads.force[2] ?? 0) - weight) / weight;
        out[1] = (momentAboutG[1] ?? 0) / (weight * scale);
      },
      Float64Array.of(1e-5 * scale, 1e-6),
      1e-11,
    );
    const { momentAboutG } = pose({ heightOfG: x[0] ?? 0, heel, trim: x[1] ?? 0 });
    return { heel, arm: -(momentAboutG[0] ?? 0) / weight, trim: x[1] ?? 0, heightOfG: x[0] ?? 0 };
  });
}

/** Stability figures read off a GZ curve, the ones intact-stability criteria (IMO IS Code 2008, 2.2) ask for. */
export interface StabilitySummary {
  /** Largest righting arm, m, and the heel where it occurs, rad. */
  maxArm: number;
  maxArmHeel: number;
  /** Heel where the arm returns to zero, rad (`NaN` past the curve's end). */
  vanishingHeel: number;
  /** Area under the curve to 30° and 40°, m·rad. */
  areaTo30: number;
  areaTo40: number;
}

/**
 * Reads the {@link StabilitySummary} off a GZ curve (trapezoidal areas).
 * @capability hull-hydrostatics IMO intact-stability figures (max GZ, vanishing angle, areas) from a GZ curve
 */
export function summarizeStability(curve: readonly RightingArmPoint[]): StabilitySummary {
  let maxArm = -Infinity;
  let maxArmHeel = 0;
  let vanishingHeel = Number.NaN;
  let areaTo30 = 0;
  let areaTo40 = 0;
  const deg30 = Math.PI / 6;
  const deg40 = (40 * Math.PI) / 180;
  for (let i = 0; i < curve.length; i += 1) {
    const point = curve[i];
    if (point === undefined) continue;
    if (point.arm > maxArm) {
      maxArm = point.arm;
      maxArmHeel = point.heel;
    }
    const previous = curve[i - 1];
    if (previous === undefined) continue;
    if (Number.isNaN(vanishingHeel) && previous.arm > 0 && point.arm <= 0 && point.heel > 0) {
      vanishingHeel = previous.heel + (previous.arm / (previous.arm - point.arm)) * (point.heel - previous.heel);
    }
    const strip = (to: number) => {
      const end = Math.min(point.heel, to);
      if (end <= previous.heel) return 0;
      const armAtEnd = previous.arm + ((point.arm - previous.arm) * (end - previous.heel)) / (point.heel - previous.heel);
      return 0.5 * (previous.arm + armAtEnd) * (end - previous.heel);
    };
    areaTo30 += strip(deg30);
    areaTo40 += strip(deg40);
  }
  return { maxArm, maxArmHeel, vanishingHeel, areaTo30, areaTo40 };
}
