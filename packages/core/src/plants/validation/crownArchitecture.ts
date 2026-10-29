import { CROWN_HULL_BINS, CROWN_HULL_SECTORS, type PlantStructure } from "../structure/plantStructure";

/** Leaf area of one leaf of size `sizeM`, as the growth model counts it. */
const LEAF_AREA_PER_SIZE_SQ = 0.55;
/** Mean projection of a randomly oriented leaf onto a plane (spherical leaf angles). */
const PROJECTION = 0.5;

/** Measures of how a crown is built, beyond its size: where it forks, its main limbs and how open it is. */
export interface CrownArchitecture {
  /**
   * Height of the lowest fork, as a share of tree height: where a scaffold limb at least `forkRatio`
   * of the trunk's diameter there leaves it (a codominant split). 1 for a stem the leader runs
   * straight up.
   */
  forkHeightShare: number;
  /** Limbs leaving the trunk at least `scaffoldRatio` of its breast-height diameter across. */
  scaffoldLimbs: number;
  /** Share of leaf area within `shellDepthShare` of the crown radius of the crown's outer surface. */
  shellShare: number;
  /** Share of the crown's side-on outline where sky shows through leaves and wood. */
  gapFraction: number;
}

/** Thresholds {@link crownArchitecture} reads limbs and the leaf shell with. */
export interface CrownArchitectureOptions {
  /** Limb over trunk diameter that counts as a fork; default 0.6. */
  forkRatio?: number;
  /** Limb over breast-height trunk diameter that counts as a scaffold limb; default 1/3. */
  scaffoldRatio?: number;
  /** Depth of the outer leaf shell as a share of crown radius; default 0.25. */
  shellDepthShare?: number;
  /** Side views averaged for the gap fraction; default 4. */
  views?: number;
  /** Raster cells across the crown height for the gap fraction; default 64. */
  cells?: number;
}

/**
 * How a crown is built. A decurrent (deliquescent) broadleaf loses its leader and divides low into a
 * few large scaffold limbs, an excurrent conifer keeps one stem with thin whorled branches (Brown,
 * McAlpine & Kormanik 1967; Zimmermann & Brown 1971); a branch over a third of the trunk's diameter is
 * a scaffold limb and one past about 0.6 a codominant stem (Gilman 2011). Shade-tolerant trees hold
 * their leaves in a thin outer shell, intolerant ones through the crown (Horn 1971); the gap fraction
 * reads sky through the crown side-on by Beer–Lambert extinction of the projected leaf area in each
 * cell, as foliage transparency is rated in the field (Schomaker et al. 2007).
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export function crownArchitecture(structure: PlantStructure, options: CrownArchitectureOptions = {}): CrownArchitecture {
  const forkRatio = options.forkRatio ?? 0.6;
  const scaffoldRatio = options.scaffoldRatio ?? 1 / 3;
  const { start, end, radiusStart, radiusEnd, parent, order } = structure.segments;
  const height = Math.max(1e-6, structure.stats.heightM);
  const breastRadius = Math.max(1e-6, (structure.stats.dbhCm / 200) || (radiusStart[0] ?? 0));
  let forkY = height;
  let scaffolds = 0;
  for (let i = 0; i < order.length; i += 1) {
    if (order[i] !== 1) continue;
    const p = parent[i] ?? -1;
    if (p < 0 || order[p] !== 0) continue;
    const limb = radiusStart[i] ?? 0;
    if (limb < scaffoldRatio * breastRadius) continue;
    scaffolds += 1;
    const y = start[i * 3 + 1] ?? 0;
    if (limb >= forkRatio * Math.max(1e-6, radiusEnd[p] ?? 0) && y < forkY) forkY = y;
  }
  return {
    forkHeightShare: Math.min(1, forkY / height),
    scaffoldLimbs: scaffolds,
    shellShare: shellShare(structure, options.shellDepthShare ?? 0.25),
    gapFraction: gapFraction(structure, options.views ?? 4, options.cells ?? 64, start, end, radiusStart, radiusEnd),
  };
}

function hullRadius(hull: Float32Array, y: number, x: number, z: number): number {
  const bottom = hull[0] ?? 0;
  const top = hull[1] ?? 0;
  const span = Math.max(1e-6, top - bottom);
  const bin = Math.min(CROWN_HULL_BINS - 1, Math.max(0, Math.floor(((y - bottom) / span) * CROWN_HULL_BINS)));
  const angle = Math.atan2(z, x);
  const sector = Math.min(CROWN_HULL_SECTORS - 1, Math.max(0, Math.floor((((angle + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI)) * CROWN_HULL_SECTORS)));
  return hull[2 + bin * CROWN_HULL_SECTORS + sector] ?? 0;
}

function shellShare(structure: PlantStructure, depthShare: number): number {
  const hull = structure.crownHull;
  const depthM = Math.max(0.25, depthShare * structure.stats.crownRadiusM);
  const top = hull[1] ?? 0;
  const { position, size, count } = structure.leaves;
  let shell = 0;
  let total = 0;
  for (let row = 0; row < size.length; row += 1) {
    const x = position[row * 3] ?? 0;
    const y = position[row * 3 + 1] ?? 0;
    const z = position[row * 3 + 2] ?? 0;
    const s = size[row] ?? 0;
    const area = (count[row] ?? 1) * s * s;
    const depth = Math.min(hullRadius(hull, y, x, z) - Math.hypot(x, z), top - y);
    total += area;
    if (depth <= depthM) shell += area;
  }
  return total > 0 ? shell / total : 0;
}

function gapFraction(structure: PlantStructure, views: number, cells: number, start: Float32Array, end: Float32Array, radiusStart: Float32Array, radiusEnd: Float32Array): number {
  const hull = structure.crownHull;
  const bottom = hull[0] ?? 0;
  const top = hull[1] ?? 0;
  const span = top - bottom;
  if (span <= 0) return 0;
  const cell = span / cells;
  const half = Math.max(structure.stats.crownRadiusM, cell) * 1.05;
  const cols = Math.max(1, Math.ceil((2 * half) / cell));
  const { position, size, count } = structure.leaves;
  let gapSum = 0;
  let crownCells = 0;
  for (let view = 0; view < views; view += 1) {
    const angle = (view / views) * Math.PI;
    const ax = Math.cos(angle);
    const az = Math.sin(angle);
    const leafArea = new Float64Array(cols * cells);
    const wood = new Uint8Array(cols * cells);
    const colOf = (x: number, z: number): number => Math.floor((x * ax + z * az + half) / cell);
    const rowOf = (y: number): number => Math.floor((y - bottom) / cell);
    for (let row = 0; row < size.length; row += 1) {
      const c = colOf(position[row * 3] ?? 0, position[row * 3 + 2] ?? 0);
      const r = rowOf(position[row * 3 + 1] ?? 0);
      if (c < 0 || c >= cols || r < 0 || r >= cells) continue;
      const s = size[row] ?? 0;
      leafArea[r * cols + c] = (leafArea[r * cols + c] ?? 0) + (count[row] ?? 1) * LEAF_AREA_PER_SIZE_SQ * s * s;
    }
    for (let i = 0; i < radiusStart.length; i += 1) {
      // Only wood at least a cell wide hides the sky behind a whole cell.
      if (2 * Math.max(radiusStart[i] ?? 0, radiusEnd[i] ?? 0) < cell) continue;
      const c0 = colOf(start[i * 3] ?? 0, start[i * 3 + 2] ?? 0);
      const r0 = rowOf(start[i * 3 + 1] ?? 0);
      const c1 = colOf(end[i * 3] ?? 0, end[i * 3 + 2] ?? 0);
      const r1 = rowOf(end[i * 3 + 1] ?? 0);
      const steps = Math.max(1, Math.abs(c1 - c0), Math.abs(r1 - r0));
      for (let k = 0; k <= steps; k += 1) {
        const c = Math.round(c0 + ((c1 - c0) * k) / steps);
        const r = Math.round(r0 + ((r1 - r0) * k) / steps);
        if (c >= 0 && c < cols && r >= 0 && r < cells) wood[r * cols + c] = 1;
      }
    }
    for (let r = 0; r < cells; r += 1) {
      // The crown's outline on this row: from its first to its last leafy or woody cell.
      let first = -1;
      let last = -1;
      for (let c = 0; c < cols; c += 1) {
        if ((leafArea[r * cols + c] ?? 0) > 0 || (wood[r * cols + c] ?? 0) === 1) {
          if (first < 0) first = c;
          last = c;
        }
      }
      for (let c = first; c >= 0 && c <= last; c += 1) {
        crownCells += 1;
        if ((wood[r * cols + c] ?? 0) === 1) continue;
        gapSum += Math.exp((-PROJECTION * (leafArea[r * cols + c] ?? 0)) / (cell * cell));
      }
    }
  }
  return crownCells > 0 ? gapSum / crownCells : 0;
}
