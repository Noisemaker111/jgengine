// @skill jgengine-world

/**
 * A hull as a table of offsets, the way lines plans publish it. Hull axes: `x` forward from the aft end of the table,
 * `y` to port, `z` up from the baseline (keel). The top waterline is the deck edge.
 */
export interface HullOffsets {
  /** Station positions along the hull, m, ascending. */
  stations: readonly number[];
  /** Waterline heights above the baseline, m, ascending; the last is the deck. */
  waterlines: readonly number[];
  /** Half-breadths, m: `halfBreadths[station][waterline]`. */
  halfBreadths: readonly (readonly number[])[];
}

/** A closed, outward-facing triangle mesh in hull axes: `positions` holds `x, y, z` triples, `triangles` index triples. */
export interface HullMesh {
  positions: Float64Array;
  triangles: Uint32Array;
}

/**
 * Builds a closed, outward-facing triangle mesh from a table of offsets: the two hull sides, the deck, and flat end caps
 * where a station has breadth (a transom). Every section is a closed ring from the keel up the starboard side, across the
 * deck and down the port side.
 * @capability hull-form triangle mesh of a hull from a published table of offsets
 */
export function hullMeshFromOffsets(offsets: HullOffsets): HullMesh {
  const { stations, waterlines, halfBreadths } = offsets;
  const ns = stations.length;
  const nw = waterlines.length;
  if (ns < 2 || nw < 2) throw new Error("hullMeshFromOffsets: need at least two stations and two waterlines");
  const ring = 2 * nw;
  const positions = new Float64Array(ns * ring * 3);
  for (let i = 0; i < ns; i += 1) {
    const x = stations[i] ?? 0;
    const row = halfBreadths[i] ?? [];
    for (let j = 0; j < nw; j += 1) {
      const y = row[j] ?? 0;
      const z = waterlines[j] ?? 0;
      const starboard = (i * ring + j) * 3;
      positions[starboard] = x;
      positions[starboard + 1] = -y;
      positions[starboard + 2] = z;
      const port = (i * ring + (ring - 1 - j)) * 3;
      positions[port] = x;
      positions[port + 1] = y;
      positions[port + 2] = z;
    }
  }
  const triangles: number[] = [];
  for (let i = 0; i + 1 < ns; i += 1) {
    for (let k = 0; k < ring; k += 1) {
      const a = i * ring + k;
      const b = i * ring + ((k + 1) % ring);
      const c = (i + 1) * ring + ((k + 1) % ring);
      const d = (i + 1) * ring + k;
      triangles.push(a, b, c, a, c, d);
    }
  }
  // End caps: a fan from the section's own centroid, so a transom or a blunt bow closes the volume.
  const capCentre = (i: number): number => {
    let cy = 0;
    let cz = 0;
    for (let k = 0; k < ring; k += 1) {
      cy += positions[(i * ring + k) * 3 + 1] ?? 0;
      cz += positions[(i * ring + k) * 3 + 2] ?? 0;
    }
    return addPoint(stations[i] ?? 0, cy / ring, cz / ring);
  };
  const extra: number[] = [];
  const addPoint = (x: number, y: number, z: number): number => {
    extra.push(x, y, z);
    return ns * ring + extra.length / 3 - 1;
  };
  const aft = capCentre(0);
  const fore = capCentre(ns - 1);
  for (let k = 0; k < ring; k += 1) {
    const next = (k + 1) % ring;
    triangles.push(aft, next, k);
    triangles.push(fore, (ns - 1) * ring + k, (ns - 1) * ring + next);
  }
  const all = new Float64Array(positions.length + extra.length);
  all.set(positions);
  all.set(extra, positions.length);
  const mesh: HullMesh = { positions: all, triangles: Uint32Array.from(triangles) };
  if (meshVolume(mesh) < 0) {
    const t = mesh.triangles;
    for (let k = 0; k < t.length; k += 3) {
      const swap = t[k + 1] ?? 0;
      t[k + 1] = t[k + 2] ?? 0;
      t[k + 2] = swap;
    }
  }
  return mesh;
}

/**
 * Signed volume enclosed by a mesh, m³ (positive when its triangles face outward).
 * @capability hull-form enclosed volume of a closed triangle mesh
 */
export function meshVolume(mesh: HullMesh): number {
  const p = mesh.positions;
  const t = mesh.triangles;
  let six = 0;
  for (let k = 0; k < t.length; k += 3) {
    const a = (t[k] ?? 0) * 3;
    const b = (t[k + 1] ?? 0) * 3;
    const c = (t[k + 2] ?? 0) * 3;
    const ax = p[a] ?? 0, ay = p[a + 1] ?? 0, az = p[a + 2] ?? 0;
    const bx = p[b] ?? 0, by = p[b + 1] ?? 0, bz = p[b + 2] ?? 0;
    const cx = p[c] ?? 0, cy = p[c + 1] ?? 0, cz = p[c + 2] ?? 0;
    six += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return six / 6;
}

function grid(count: number, from: number, to: number, cluster = false): number[] {
  return Array.from({ length: count }, (_, index) => {
    const s = index / (count - 1);
    const shaped = cluster ? 0.5 - 0.5 * Math.cos(Math.PI * s) : s;
    return from + (to - from) * shaped;
  });
}

/** Dimensions of a {@link wigleyHull}. */
export interface WigleyHullOptions {
  length: number;
  beam: number;
  draft: number;
  /** Height of the vertical topsides above the waterline, m (default `draft`). */
  freeboard?: number;
  /** Stations along the length (default `61`). */
  stations?: number;
  /** Waterlines from keel to waterline (default `24`); the topsides add two more. */
  waterlines?: number;
}

/**
 * The Wigley parabolic hull, `y = B/2 · (1 − (2x/L)²) · (1 − (z/T)²)` below the waterline, with vertical topsides above
 * it — the standard mathematical test hull of ship hydrodynamics. Its hydrostatics are known in closed form: `C_B = 4/9`,
 * `C_WP = 2/3`, `KB = 5T/8`, `BM_T = 3B²/(35T)`, `BM_L = 3L²/(40T)`. The table's `x` runs `0..L` from the stern.
 * @capability hull-form the Wigley parabolic test hull as a table of offsets
 */
export function wigleyHull(options: WigleyHullOptions): HullOffsets {
  const { length, beam, draft } = options;
  const freeboard = options.freeboard ?? draft;
  const stations = grid(options.stations ?? 61, 0, length, true);
  const below = grid(options.waterlines ?? 24, 0, draft);
  const waterlines = [...below, draft + 0.5 * freeboard, draft + freeboard];
  const halfBreadths = stations.map((x) => {
    const xi = (2 * x) / length - 1;
    const plan = 1 - xi * xi;
    return waterlines.map((z) => {
      const zeta = Math.min(0, z - draft) / draft;
      return 0.5 * beam * plan * (1 - zeta * zeta);
    });
  });
  return { stations, waterlines, halfBreadths };
}

/**
 * A rectangular box barge `length × beam × depth`: the textbook hull whose large-angle righting arm has a closed form.
 * @capability hull-form a rectangular box barge as a table of offsets
 */
export function boxBarge(length: number, beam: number, depth: number, stations = 3, waterlines = 3): HullOffsets {
  const xs = grid(stations, 0, length);
  const zs = grid(waterlines, 0, depth);
  return { stations: xs, waterlines: zs, halfBreadths: xs.map(() => zs.map(() => beam / 2)) };
}

/** Dimensions of a {@link prismaticPlaningHull}. */
export interface PrismaticPlaningHullOptions {
  /** Length of the prismatic run, m. */
  length: number;
  /** Chine beam, m. */
  beam: number;
  /** Deadrise angle, rad. */
  deadrise: number;
  /** Side height above the chine, m. */
  sideHeight: number;
  /** Length of the bow taper at the forward end, m (default `0.3 · length`). */
  bowLength?: number;
  stations?: number;
}

/**
 * A constant-deadrise planing hull: a V bottom of the given deadrise up to a hard chine, vertical topsides above it, a
 * flat transom aft and a bow that narrows to a point over `bowLength`. The prismatic hull Savitsky's equations describe.
 * @capability hull-form a constant-deadrise prismatic planing hull as a table of offsets
 */
export function prismaticPlaningHull(options: PrismaticPlaningHullOptions): HullOffsets {
  const { length, beam, deadrise, sideHeight } = options;
  const bow = options.bowLength ?? 0.3 * length;
  const chineHeight = 0.5 * beam * Math.tan(deadrise);
  const vee = grid(9, 0, chineHeight);
  const waterlines = [...vee, chineHeight + 0.5 * sideHeight, chineHeight + sideHeight];
  const stations = grid(options.stations ?? 41, 0, length);
  const halfBreadths = stations.map((x) => {
    const taper = x <= length - bow ? 1 : Math.max(0, (length - x) / bow);
    const halfBeam = 0.5 * beam * Math.sqrt(taper);
    return waterlines.map((z) => {
      const atChine = chineHeight > 0 ? Math.min(1, z / chineHeight) : 1;
      return halfBeam * atChine;
    });
  });
  return { stations, waterlines, halfBreadths };
}
