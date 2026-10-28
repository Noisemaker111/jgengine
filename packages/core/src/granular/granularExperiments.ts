// @skill jgengine-world
/**
 * Laboratory experiments run on {@link createGranularLayer}, each the setup of a published
 * measurement: the axisymmetric column collapse of Lube, Huppert, Sparks & Hallworth (2004), the
 * steady inclined-plane flow of Pouliquen (1999), and a heap poured from a point. Tests compare their
 * numbers with the papers' and with the discrete element reference in `physics/reference`.
 *
 * @capability granular-flow sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield
 */
import { createGranularLayer } from "./granularLayer";
import type { GranularMaterial } from "./granularMaterial";

/** Where a released column of the continuum came to rest. */
export interface ContinuumCollapse {
  /** Edge of the deposit over the column radius, r_∞ / r_i. */
  runout: number;
  /** Final over initial height. */
  height: number;
  /** Seconds until the last cell stopped. */
  duration: number;
}

/**
 * Release a column of `aspect` = h_i / r_i, radius `radius` m, on a flat bed and measure the deposit. The edge
 * is the farthest cell deeper than 1% of the initial height.
 * @capability granular-flow sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield
 */
export function continuumCollapse(material: GranularMaterial, aspect: number, radius = 0.1, cellsPerRadius = 20): ContinuumCollapse {
  const dx = radius / cellsPerRadius;
  const reach = radius * (aspect < 1.7 ? 1 + 1.24 * aspect : 1 + 1.6 * Math.sqrt(aspect)) * 1.6;
  const n = Math.ceil((2 * reach) / dx) + 1;
  const centre = ((n - 1) / 2) * dx;
  const depth = new Float64Array(n * n);
  for (let gz = 0; gz < n; gz += 1) {
    for (let gx = 0; gx < n; gx += 1) if (Math.hypot(gx * dx - centre, gz * dx - centre) <= radius) depth[gz * n + gx] = aspect * radius;
  }
  const layer = createGranularLayer({ cols: n, rows: n, spacingX: dx, materials: [material], depth, maxSubsteps: 400 });
  let time = 0;
  let duration = 0;
  while (layer.awakeCount() > 0 && time < 5) {
    const report = layer.step(0.01);
    time += report.simulated;
    if (report.moved > 0) duration = time;
  }
  let edge = 0;
  let top = 0;
  for (let i = 0; i < n * n; i += 1) {
    const h = layer.depth(i);
    top = Math.max(top, h);
    if (h > 0.01 * aspect * radius) edge = Math.max(edge, Math.hypot((i % n) * dx - centre, Math.floor(i / n) * dx - centre));
  }
  return { runout: edge / radius, height: top / (aspect * radius), duration };
}

/** Steady flow down a rough incline, read at the middle of a long channel. */
export interface FlumeFlow {
  depth: number;
  velocity: number;
  /** u / √(g h). */
  froude: number;
}

/**
 * A uniform layer `depth` m deep released on a `angle`° incline, run for `seconds`, then read far from both ends:
 * the steady uniform flow Pouliquen (1999) measured.
 * @capability granular-flow sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield
 */
export function inclinedFlume(material: GranularMaterial, angle: number, depth: number, seconds = 3, gravity = 9.81): FlumeFlow {
  const dx = Math.max(depth / 2, 2e-3);
  // Long enough that neither end reaches the middle: disturbances travel at most u + √(gh) ≈ 3√(gh).
  const n = Math.ceil((2 * seconds * 3 * Math.sqrt(gravity * depth) + 0.1) / dx);
  const slope = Math.tan((angle * Math.PI) / 180);
  const bed = new Float64Array(n);
  for (let gx = 0; gx < n; gx += 1) bed[gx] = -slope * gx * dx;
  const start = new Float64Array(n).fill(depth);
  const layer = createGranularLayer({ cols: n, rows: 1, spacingX: dx, materials: [material], bed, depth: start, maxSubsteps: 4000, gravity });
  const steps = Math.ceil(seconds / 0.05);
  for (let k = 0; k < steps; k += 1) layer.step(seconds / steps);
  const cell = Math.floor(n / 2);
  const velocity = layer.velocity(cell)[0];
  const h = layer.depth(cell);
  return { depth: h, velocity, froude: velocity / Math.sqrt(gravity * h) };
}

/** A heap poured from a point. */
export interface PouredHeap {
  height: number;
  /** Mean flank slope between 15% and 85% of the height, along the grid axis and along the diagonal, degrees. */
  axisSlope: number;
  diagonalSlope: number;
  /** Solid volume in the layer over the volume poured. */
  conserved: number;
}

/**
 * Pour `volume` m³ in small batches onto the middle of a flat bed of `cell` m cells and measure the heap once still.
 * @capability granular-flow sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield
 */
export function pouredHeap(material: GranularMaterial, volume = 0.6, cell = 0.1, cells = 61): PouredHeap {
  const layer = createGranularLayer({ cols: cells, rows: cells, spacingX: cell, materials: [material] });
  const mid = (cells - 1) / 2;
  const centre = mid * cell;
  const batches = 300;
  for (let k = 0; k < batches; k += 1) {
    layer.deposit(centre, centre, 1.5 * cell, volume / batches);
    layer.step(1 / 60);
    layer.step(1 / 60);
  }
  for (let k = 0; k < 900 && layer.awakeCount() > 0; k += 1) layer.step(1 / 60);
  const height = layer.surface(layer.index(mid, mid));
  const slope = (dx: number, dz: number): number => {
    let first: [number, number] | undefined;
    let last: [number, number] | undefined;
    for (let k = 0; k <= mid; k += 1) {
      const h = layer.surface(layer.index(mid + k * dx, mid + k * dz));
      if (h <= 0.15 * height || h >= 0.85 * height) continue;
      const point: [number, number] = [k * cell * Math.hypot(dx, dz), h];
      first ??= point;
      last = point;
    }
    if (first === undefined || last === undefined || last[0] === first[0]) return Number.NaN;
    return (Math.atan2(first[1] - last[1], last[0] - first[0]) * 180) / Math.PI;
  };
  return { height, axisSlope: slope(1, 0), diagonalSlope: slope(1, 1), conserved: layer.totalSolid() / volume };
}
