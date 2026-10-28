// @skill jgengine-world
/**
 * Convex polyhedra as lists of faces, cut by planes: the cells a rock breaks into.
 *
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */

/** A point in a cell's space, m. */
export type CellVec = readonly [number, number, number];

/** One face: vertices counter-clockwise seen from outside; `fracture` marks a face made by a cut. */
export interface CellFace {
  vertices: CellVec[];
  fracture: boolean;
}

/** A convex polyhedron. */
export interface ConvexCell {
  faces: CellFace[];
}

/** The half-space n·x ≤ offset; `n` need not be unit length. */
export interface CellPlane {
  normal: CellVec;
  offset: number;
}

const EPSILON = 1e-12;

function sub(a: CellVec, b: CellVec): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: CellVec, b: CellVec): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: CellVec, b: CellVec): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * An axis-aligned box cell from `min` to `max`.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function boxCell(min: CellVec, max: CellVec): ConvexCell {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const quad = (a: CellVec, b: CellVec, c: CellVec, d: CellVec): CellFace => ({ vertices: [a, b, c, d], fracture: false });
  return {
    faces: [
      quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]),
      quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]),
      quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]),
      quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]),
      quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]),
      quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]),
    ],
  };
}

/**
 * Keep the part of `cell` inside `plane`, closing the cut with one new face (marked `fracture` when `fracture` is true).
 * Returns an empty cell when nothing is left.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function clipCell(cell: ConvexCell, plane: CellPlane, fracture = true): ConvexCell {
  const scale = Math.hypot(plane.normal[0], plane.normal[1], plane.normal[2]);
  if (scale < EPSILON) return cell;
  const n: CellVec = [plane.normal[0] / scale, plane.normal[1] / scale, plane.normal[2] / scale];
  const offset = plane.offset / scale;
  const faces: CellFace[] = [];
  const cut: [number, number, number][] = [];
  let outside = false;
  for (const face of cell.faces) {
    const kept: CellVec[] = [];
    const count = face.vertices.length;
    for (let i = 0; i < count; i += 1) {
      const a = face.vertices[i];
      const b = face.vertices[(i + 1) % count];
      if (a === undefined || b === undefined) continue;
      const da = dot(n, a) - offset;
      const db = dot(n, b) - offset;
      if (da <= 0) kept.push(a);
      else outside = true;
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const t = da / (da - db);
        const p: [number, number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        kept.push(p);
        cut.push(p);
      } else if (da === 0) cut.push([a[0], a[1], a[2]]);
    }
    if (kept.length >= 3) faces.push({ vertices: kept, fracture: face.fracture });
  }
  if (!outside) return cell;
  if (faces.length === 0) return { faces: [] };
  const cap = orderedCap(cut, n);
  if (cap.length >= 3) faces.push({ vertices: cap, fracture });
  return { faces };
}

/** Distinct cut points ordered counter-clockwise about `n` (the cap's outward normal). */
function orderedCap(points: readonly CellVec[], n: CellVec): CellVec[] {
  let span = 0;
  for (const p of points) span = Math.max(span, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
  const tolerance = Math.max(span, 1) * 1e-9;
  const unique: CellVec[] = [];
  for (const p of points) {
    if (!unique.some((q) => Math.abs(q[0] - p[0]) <= tolerance && Math.abs(q[1] - p[1]) <= tolerance && Math.abs(q[2] - p[2]) <= tolerance)) unique.push(p);
  }
  if (unique.length < 3) return [];
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const p of unique) {
    cx += p[0];
    cy += p[1];
    cz += p[2];
  }
  const centre: CellVec = [cx / unique.length, cy / unique.length, cz / unique.length];
  const helper: CellVec = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = cross(n, helper);
  const v = cross(n, u);
  return unique
    .map((p) => {
      const d = sub(p, centre);
      return { p, angle: Math.atan2(dot(d, v), dot(d, u)) };
    })
    .sort((a, b) => a.angle - b.angle)
    .map((entry) => entry.p);
}

/**
 * Volume and centroid of a cell, by the divergence theorem over fan triangles.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function cellVolume(cell: ConvexCell): { volume: number; centroid: [number, number, number] } {
  let volume = 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const face of cell.faces) {
    const first = face.vertices[0];
    if (first === undefined) continue;
    for (let i = 1; i + 1 < face.vertices.length; i += 1) {
      const b = face.vertices[i];
      const c = face.vertices[i + 1];
      if (b === undefined || c === undefined) continue;
      const v = dot(first, cross(b, c)) / 6;
      volume += v;
      cx += (v * (first[0] + b[0] + c[0])) / 4;
      cy += (v * (first[1] + b[1] + c[1])) / 4;
      cz += (v * (first[2] + b[2] + c[2])) / 4;
    }
  }
  if (Math.abs(volume) < EPSILON * EPSILON) return { volume: 0, centroid: [0, 0, 0] };
  return { volume, centroid: [cx / volume, cy / volume, cz / volume] };
}

/**
 * Whether `point` lies inside every face plane of `cell`.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function cellContains(cell: ConvexCell, point: CellVec): boolean {
  for (const face of cell.faces) {
    const [a, b, c] = face.vertices;
    if (a === undefined || b === undefined || c === undefined) continue;
    const n = cross(sub(b, a), sub(c, a));
    if (dot(n, sub(point, a)) > 0) return false;
  }
  return true;
}

/**
 * The cell moved by `offset` and scaled by `scale` about `centre`.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function transformCell(cell: ConvexCell, centre: CellVec, scale: number, offset: CellVec = [0, 0, 0]): ConvexCell {
  return {
    faces: cell.faces.map((face) => ({
      fracture: face.fracture,
      vertices: face.vertices.map((p): CellVec => [centre[0] + (p[0] - centre[0]) * scale + offset[0], centre[1] + (p[1] - centre[1]) * scale + offset[1], centre[2] + (p[2] - centre[2]) * scale + offset[2]]),
    })),
  };
}
