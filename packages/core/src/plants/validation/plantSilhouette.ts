import type { PlantStructure } from "../structure/plantStructure";

/** The world box a set of silhouettes is drawn into, so masks of different plants line up. */
export interface PlantSilhouetteFrame {
  /** Half the width of the box in metres, centred on the stem. */
  halfWidthM: number;
  /** Height of the box in metres, from the stem base. */
  heightM: number;
  /** Mask pixels along the height; the width gets as many. Default 48. */
  size?: number;
}

/** Silhouettes of one plant from several sides: one 0/1 mask per view, `size` × `size`, rows from the top. */
export interface PlantSilhouettes {
  size: number;
  views: Uint8Array[];
}

/**
 * Side-on silhouettes of a plant from `views` directions spread evenly around it, drawn
 * orthographically into `frame`: wood as its segments at their radius, and each leaf row as a disc of
 * the area its leaves cover. Two plants drawn into one frame can be compared view by view with
 * {@link silhouetteIoU}.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export function plantSilhouettes(structure: PlantStructure, frame: PlantSilhouetteFrame, views = 8): PlantSilhouettes {
  const size = Math.max(8, Math.floor(frame.size ?? 48));
  const pixelM = frame.heightM / size;
  const out: Uint8Array[] = [];
  const { start, end, radiusStart, radiusEnd } = structure.segments;
  const { position, size: leafSize, count } = structure.leaves;
  const segmentRows = radiusStart.length;
  const leafRows = leafSize.length;
  for (let view = 0; view < views; view += 1) {
    const angle = (view / views) * Math.PI * 2;
    const ax = Math.cos(angle);
    const az = Math.sin(angle);
    const mask = new Uint8Array(size * size);
    const toU = (x: number, z: number): number => (x * ax + z * az + frame.halfWidthM) / (2 * frame.halfWidthM) * size;
    const toV = (y: number): number => size - y / pixelM;
    for (let row = 0; row < segmentRows; row += 1) {
      const u0 = toU(start[row * 3] ?? 0, start[row * 3 + 2] ?? 0);
      const v0 = toV(start[row * 3 + 1] ?? 0);
      const u1 = toU(end[row * 3] ?? 0, end[row * 3 + 2] ?? 0);
      const v1 = toV(end[row * 3 + 1] ?? 0);
      const radius = Math.max(radiusStart[row] ?? 0, radiusEnd[row] ?? 0) / pixelM;
      const steps = Math.max(1, Math.ceil(Math.hypot(u1 - u0, v1 - v0)));
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        stampDisc(mask, size, u0 + (u1 - u0) * t, v0 + (v1 - v0) * t, radius);
      }
    }
    for (let row = 0; row < leafRows; row += 1) {
      // A row stands for `count` leaves; its disc covers their combined area.
      const radius = (0.5 * (leafSize[row] ?? 0) * Math.sqrt(count[row] ?? 1)) / pixelM;
      stampDisc(mask, size, toU(position[row * 3] ?? 0, position[row * 3 + 2] ?? 0), toV(position[row * 3 + 1] ?? 0), radius);
    }
    out.push(mask);
  }
  return { size, views: out };
}

function stampDisc(mask: Uint8Array, size: number, u: number, v: number, radius: number): void {
  const r = Math.max(0.5, radius);
  const minX = Math.max(0, Math.floor(u - r));
  const maxX = Math.min(size - 1, Math.floor(u + r));
  const minY = Math.max(0, Math.floor(v - r));
  const maxY = Math.min(size - 1, Math.floor(v + r));
  const r2 = r * r;
  for (let y = minY; y <= maxY; y += 1) {
    const dy = y + 0.5 - v;
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x + 0.5 - u;
      if (dx * dx + dy * dy <= r2 || (radius < 0.5 && x === Math.floor(u) && y === Math.floor(v))) mask[y * size + x] = 1;
    }
  }
}

/**
 * Intersection over union of two silhouette sets, view by view, averaged over the views; 1 when both
 * are empty.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export function silhouetteIoU(a: PlantSilhouettes, b: PlantSilhouettes): number {
  const views = Math.min(a.views.length, b.views.length);
  if (views === 0) return 1;
  let total = 0;
  for (let view = 0; view < views; view += 1) {
    const ma = a.views[view];
    const mb = b.views[view];
    if (ma === undefined || mb === undefined) continue;
    let both = 0;
    let either = 0;
    for (let index = 0; index < ma.length; index += 1) {
      const x = ma[index] ?? 0;
      const y = mb[index] ?? 0;
      if (x !== 0 && y !== 0) both += 1;
      if (x !== 0 || y !== 0) either += 1;
    }
    total += either === 0 ? 1 : both / either;
  }
  return total / views;
}

/**
 * Where a plant's main limbs point: the share of first-order branches whose first segment leaves the
 * stem toward each of `bins` compass sectors, counter-clockwise from +x. Sums to 1, or all zero for a
 * plant with no limbs.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export function branchAzimuthHistogram(structure: PlantStructure, bins = 12): Float64Array {
  const histogram = new Float64Array(bins);
  const { start, end, parent, order } = structure.segments;
  let total = 0;
  for (let row = 0; row < order.length; row += 1) {
    if (order[row] !== 1) continue;
    const up = parent[row] ?? -1;
    if (up < 0 || order[up] !== 0) continue;
    const dx = (end[row * 3] ?? 0) - (start[row * 3] ?? 0);
    const dz = (end[row * 3 + 2] ?? 0) - (start[row * 3 + 2] ?? 0);
    if (dx === 0 && dz === 0) continue;
    const turn = Math.atan2(dz, dx) / (Math.PI * 2);
    const bin = Math.min(bins - 1, Math.floor((turn - Math.floor(turn)) * bins));
    histogram[bin] = (histogram[bin] ?? 0) + 1;
    total += 1;
  }
  if (total > 0) for (let bin = 0; bin < bins; bin += 1) histogram[bin] = (histogram[bin] ?? 0) / total;
  return histogram;
}

/**
 * Total variation distance between two histograms: 0 when equal, 1 when they share nothing.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export function histogramDistance(a: Float64Array, b: Float64Array): number {
  let sum = 0;
  const bins = Math.max(a.length, b.length);
  for (let bin = 0; bin < bins; bin += 1) sum += Math.abs((a[bin] ?? 0) - (b[bin] ?? 0));
  return sum / 2;
}
