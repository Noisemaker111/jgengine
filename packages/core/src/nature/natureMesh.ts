/**
 * The mesh a nature generator returns, and the pure builders every species grows from: tapered
 * tubes (trunks, branches, logs), lumpy blobs (leaf clusters, bush clumps), cones (conifer tiers),
 * folded fronds (palms, ferns, cycads) and cut, eroded stones. Plain typed arrays, no three.js, so a
 * species is deterministic, testable and cheap to bake into a handful of instanced variants.
 */
import { hashString } from "../random/rng";

function pick<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new RangeError(`index ${index} outside ${values.length} items`);
  return value;
}

/** Indexed triangle mesh with per-vertex sRGB colours, in metres with the base at y = 0. */
export interface NatureMesh {
  positions: Float32Array;
  normals: Float32Array;
  /** sRGB 0..1, three per vertex. */
  colors: Float32Array;
  indices: Uint32Array;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  triangles: number;
}

/**
 * True when a generator output is a {@link NatureMesh}.
 * @capability nature-generator seeded trees, palms, bushes, ferns, rocks and pebbles with editor variants and instanced scatter
 */
export function isNatureMesh(value: unknown): value is NatureMesh {
  return typeof value === "object" && value !== null && "positions" in value && value.positions instanceof Float32Array && "indices" in value && value.indices instanceof Uint32Array;
}

/** A point or direction in a nature mesh's local space. */
export type NatureVec = readonly [number, number, number];

/** An sRGB colour, 0..1 per channel. */
export type NatureRgb = readonly [number, number, number];

/** Parse `#rrggbb` (or `#rgb`) to sRGB 0..1; falls back to mid grey. @internal */
export function hexRgb(hex: string): NatureRgb {
  const body = hex.startsWith("#") ? hex.slice(1) : hex;
  const full = body.length === 3 ? body.split("").map((c) => c + c).join("") : body;
  const value = Number.parseInt(full, 16);
  if (full.length !== 6 || !Number.isFinite(value)) return [0.5, 0.5, 0.5];
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** `color` scaled by `light` and nudged per channel by `tint` (each -1..1 times `amount`). @internal */
export function shade(color: NatureRgb, light: number, tint: NatureVec = [0, 0, 0], amount = 0): NatureRgb {
  return [clamp01(color[0] * light + tint[0] * amount), clamp01(color[1] * light + tint[1] * amount), clamp01(color[2] * light + tint[2] * amount)];
}

/** Linear blend between two colours. @internal */
export function mixRgb(a: NatureRgb, b: NatureRgb, t: number): NatureRgb {
  const k = clamp01(t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function lattice(seed: number, x: number, y: number, z: number): number {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Seeded 3D value noise in 0..1, smooth between integer lattice points. @internal */
export function natureNoise(seed: number, x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const w = smooth(z - zi);
  let total = 0;
  for (let dz = 0; dz <= 1; dz += 1) {
    for (let dy = 0; dy <= 1; dy += 1) {
      for (let dx = 0; dx <= 1; dx += 1) {
        const weight = (dx === 1 ? u : 1 - u) * (dy === 1 ? v : 1 - v) * (dz === 1 ? w : 1 - w);
        total += lattice(seed, xi + dx, yi + dy, zi + dz) * weight;
      }
    }
  }
  return total;
}

/** A numeric seed for {@link natureNoise} from a seed string. @internal */
export function noiseSeed(seed: string): number {
  return hashString(seed) | 0;
}

function normalize(v: NatureVec): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length < 1e-9 ? [0, 1, 0] : [v[0] / length, v[1] / length, v[2] / length];
}

function cross(a: NatureVec, b: NatureVec): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** A unit vector perpendicular to `axis`. */
function perpendicular(axis: NatureVec): [number, number, number] {
  const helper: NatureVec = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return normalize(cross(axis, helper));
}

/** Accumulates vertices and triangles, then emits a {@link NatureMesh} with smooth normals. @internal */
export class NatureMeshBuilder {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];
  private readonly upBias: number[] = [];

  /** Vertex count so far. */
  get vertexCount(): number {
    return this.positions.length / 3;
  }

  /**
   * Add one vertex and return its index. `upBias` 0..1 bends its normal toward straight up, so thin
   * leaf blades light like the canopy they belong to instead of going black edge-on.
   */
  vertex(p: NatureVec, color: NatureRgb, upBias = 0): number {
    this.positions.push(p[0], p[1], p[2]);
    this.colors.push(color[0], color[1], color[2]);
    this.upBias.push(upBias);
    return this.positions.length / 3 - 1;
  }

  triangle(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }

  /** Emit the mesh: smooth area-weighted normals, bounds and triangle count. */
  build(): NatureMesh {
    const positions = Float32Array.from(this.positions);
    const indices = Uint32Array.from(this.indices);
    const normals = new Float32Array(positions.length);
    for (let i = 0; i < indices.length; i += 3) {
      const a = (indices[i] ?? 0) * 3;
      const b = (indices[i + 1] ?? 0) * 3;
      const c = (indices[i + 2] ?? 0) * 3;
      const ux = (positions[b] ?? 0) - (positions[a] ?? 0);
      const uy = (positions[b + 1] ?? 0) - (positions[a + 1] ?? 0);
      const uz = (positions[b + 2] ?? 0) - (positions[a + 2] ?? 0);
      const vx = (positions[c] ?? 0) - (positions[a] ?? 0);
      const vy = (positions[c + 1] ?? 0) - (positions[a + 1] ?? 0);
      const vz = (positions[c + 2] ?? 0) - (positions[a + 2] ?? 0);
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      for (const index of [a, b, c]) {
        normals[index] = (normals[index] ?? 0) + nx;
        normals[index + 1] = (normals[index + 1] ?? 0) + ny;
        normals[index + 2] = (normals[index + 2] ?? 0) + nz;
      }
    }
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      const length = Math.hypot((normals[i] ?? 0), (normals[i + 1] ?? 0), (normals[i + 2] ?? 0)) || 1;
      const bias = this.upBias[i / 3] ?? 0;
      const nx = ((normals[i] ?? 0) / length) * (1 - bias);
      const ny = ((normals[i + 1] ?? 0) / length) * (1 - bias) + bias;
      const nz = ((normals[i + 2] ?? 0) / length) * (1 - bias);
      const biased = Math.hypot(nx, ny, nz) || 1;
      normals[i] = nx / biased;
      normals[i + 1] = ny / biased;
      normals[i + 2] = nz / biased;
      for (let axis = 0; axis < 3; axis += 1) {
        const value = (positions[i + axis] ?? 0);
        if (value < (min[axis] ?? 0)) min[axis] = value;
        if (value > (max[axis] ?? 0)) max[axis] = value;
      }
    }
    if (positions.length === 0) {
      min.fill(0);
      max.fill(0);
    }
    return { positions, normals, colors: Float32Array.from(this.colors), indices, bounds: { min, max }, triangles: indices.length / 3 };
  }
}

/** Options for {@link addTube}. */
export interface TubeOptions {
  /** Ring vertex count, at least 3. */
  sides: number;
  /** Colour of ring `index` (0 at the base). */
  color(index: number, t: number): NatureRgb;
  /** Close the far end with a point (twig tip) instead of leaving it open. Default true. */
  closeTip?: boolean;
  /** Radial wobble 0..1 seeded by `seed`, for gnarled bark. */
  wobble?: number;
  seed?: number;
}

/**
 * A tapered tube along `path` with radius `radii[i]` at each point: trunks, branches, logs. Rings
 * follow the path's tangent with a rotation-minimising frame so a bent trunk does not twist.
 * @capability nature-generator seeded trees, palms, bushes, ferns, rocks and pebbles with editor variants and instanced scatter
 */
export function addTube(builder: NatureMeshBuilder, path: readonly NatureVec[], radii: readonly number[], options: TubeOptions): void {
  if (path.length < 2) return;
  const sides = Math.max(3, Math.floor(options.sides));
  const tangentAt = (i: number): [number, number, number] => {
    const a = pick(path, Math.max(0, i - 1));
    const b = pick(path, Math.min(path.length - 1, i + 1));
    return normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  };
  let tangent = tangentAt(0);
  let normal = perpendicular(tangent);
  const rings: number[] = [];
  for (let i = 0; i < path.length; i += 1) {
    const next = tangentAt(i);
    // Rotation-minimising frame: project the previous normal onto the new tangent's plane.
    const dot = normal[0] * next[0] + normal[1] * next[1] + normal[2] * next[2];
    normal = normalize([normal[0] - next[0] * dot, normal[1] - next[1] * dot, normal[2] - next[2] * dot]);
    tangent = next;
    const binormal = cross(tangent, normal);
    const center = pick(path, i);
    const radius = radii[Math.min(i, radii.length - 1)] ?? 0.1;
    const t = i / (path.length - 1);
    const color = options.color(i, t);
    rings.push(builder.vertexCount);
    for (let s = 0; s < sides; s += 1) {
      const angle = (s / sides) * Math.PI * 2;
      const wobble = options.wobble === undefined ? 1 : 1 + (natureNoise(options.seed ?? 0, Math.cos(angle) * 1.6, i * 0.9, Math.sin(angle) * 1.6) - 0.5) * options.wobble;
      const r = radius * wobble;
      const c = Math.cos(angle) * r;
      const sn = Math.sin(angle) * r;
      builder.vertex([center[0] + normal[0] * c + binormal[0] * sn, center[1] + normal[1] * c + binormal[1] * sn, center[2] + normal[2] * c + binormal[2] * sn], color);
    }
  }
  for (let i = 0; i < rings.length - 1; i += 1) {
    const a = pick(rings, i);
    const b = pick(rings, i + 1);
    for (let s = 0; s < sides; s += 1) {
      const s1 = (s + 1) % sides;
      builder.triangle(a + s, b + s1, b + s);
      builder.triangle(a + s, a + s1, b + s1);
    }
  }
  if (options.closeTip !== false) {
    const last = pick(path, path.length - 1);
    const tip = builder.vertex([last[0] + tangent[0] * (radii[radii.length - 1] ?? 0), last[1] + tangent[1] * (radii[radii.length - 1] ?? 0), last[2] + tangent[2] * (radii[radii.length - 1] ?? 0)], options.color(path.length - 1, 1));
    const ring = pick(rings, rings.length - 1);
    for (let s = 0; s < sides; s += 1) builder.triangle(ring + s, ring + ((s + 1) % sides), tip);
  }
}

const ICO_T = (1 + Math.sqrt(5)) / 2;
const ICO_RAW: NatureVec[] = [
  [-1, ICO_T, 0], [1, ICO_T, 0], [-1, -ICO_T, 0], [1, -ICO_T, 0],
  [0, -1, ICO_T], [0, 1, ICO_T], [0, -1, -ICO_T], [0, 1, -ICO_T],
  [ICO_T, 0, -1], [ICO_T, 0, 1], [-ICO_T, 0, -1], [-ICO_T, 0, 1],
];
const ICO_VERTICES: NatureVec[] = ICO_RAW.map((v) => normalize(v));
const ICO_FACES: [number, number, number][] = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

const sphereCache = new Map<number, { vertices: NatureVec[]; faces: [number, number, number][] }>();

/** A unit icosphere with `level` subdivisions (0: 20 faces, 1: 80, 2: 320), cached. @internal */
export function icosphere(level: number): { vertices: readonly NatureVec[]; faces: readonly (readonly [number, number, number])[] } {
  const depth = Math.max(0, Math.min(3, Math.floor(level)));
  const cached = sphereCache.get(depth);
  if (cached !== undefined) return cached;
  let vertices = [...ICO_VERTICES];
  let faces = ICO_FACES.map((face): [number, number, number] => [face[0], face[1], face[2]]);
  for (let step = 0; step < depth; step += 1) {
    const midpoints = new Map<string, number>();
    const midpoint = (a: number, b: number): number => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const known = midpoints.get(key);
      if (known !== undefined) return known;
      const va = pick(vertices, a);
      const vb = pick(vertices, b);
      vertices.push(normalize([(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2]));
      midpoints.set(key, vertices.length - 1);
      return vertices.length - 1;
    };
    const next: [number, number, number][] = [];
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
    vertices = [...vertices];
  }
  const sphere = { vertices, faces };
  sphereCache.set(depth, sphere);
  return sphere;
}

/** Options for {@link addBlob}. */
export interface BlobOptions {
  center: NatureVec;
  radii: NatureVec;
  /** Icosphere subdivisions, 0..2. */
  level: number;
  /** Noise displacement 0..1 of the radius. */
  lumpiness: number;
  seed: number;
  color: NatureRgb;
  /** Per-vertex colour variation 0..1. */
  colorJitter: number;
  /** Darken the underside by this much (fake ambient occlusion), 0..1. */
  shadeBelow: number;
}

/**
 * A lumpy ellipsoid: a leaf cluster, a bush clump, a coconut.
 * @capability nature-generator seeded trees, palms, bushes, ferns, rocks and pebbles with editor variants and instanced scatter
 */
export function addBlob(builder: NatureMeshBuilder, options: BlobOptions): void {
  const { vertices, faces } = icosphere(options.level);
  const base = builder.vertexCount;
  const [cx, cy, cz] = options.center;
  for (const v of vertices) {
    const n = natureNoise(options.seed, v[0] * 1.7 + 3, v[1] * 1.7, v[2] * 1.7 - 5);
    const r = 1 + (n - 0.5) * 2 * options.lumpiness;
    const jitter = (natureNoise(options.seed + 17, v[0] * 3.1, v[1] * 3.1, v[2] * 3.1) - 0.5) * 2;
    const light = 1 - options.shadeBelow * (1 - (v[1] + 1) / 2) + jitter * options.colorJitter * 0.5;
    builder.vertex([cx + v[0] * options.radii[0] * r, cy + v[1] * options.radii[1] * r, cz + v[2] * options.radii[2] * r], shade(options.color, light, [jitter * 0.3, jitter * 0.5, -jitter * 0.2], options.colorJitter * 0.25));
  }
  for (const [a, b, c] of faces) builder.triangle(base + a, base + b, base + c);
}

/** Options for {@link addCone}. */
export interface ConeOptions {
  base: NatureVec;
  height: number;
  radius: number;
  sides: number;
  /** How far the rim hangs below the base, as a fraction of height. */
  droop: number;
  /** Rim radius jitter 0..1 for a ragged tier. */
  ragged: number;
  seed: number;
  color: NatureRgb;
  rimColor: NatureRgb;
}

/**
 * A closed, drooping cone: one conifer tier.
 * @capability nature-generator seeded trees, palms, bushes, ferns, rocks and pebbles with editor variants and instanced scatter
 */
export function addCone(builder: NatureMeshBuilder, options: ConeOptions): void {
  const sides = Math.max(4, Math.floor(options.sides));
  const [bx, by, bz] = options.base;
  const apex = builder.vertex([bx, by + options.height, bz], shade(options.color, 1.08));
  const rim: number[] = [];
  for (let s = 0; s < sides * 2; s += 1) {
    // Alternate long and short rim points so the tier edge reads as needle clumps, not a lampshade.
    const angle = (s / (sides * 2)) * Math.PI * 2;
    const tooth = s % 2 === 0 ? 1 : 0.78;
    const r = options.radius * tooth * (1 + (natureNoise(options.seed, Math.cos(angle) * 2, s * 0.37, Math.sin(angle) * 2) - 0.5) * options.ragged);
    const drop = options.height * options.droop * (s % 2 === 0 ? 1 : 0.7);
    rim.push(builder.vertex([bx + Math.cos(angle) * r, by - drop, bz + Math.sin(angle) * r], s % 2 === 0 ? options.rimColor : mixRgb(options.rimColor, options.color, 0.5)));
  }
  const under = builder.vertex([bx, by + options.height * 0.12, bz], shade(options.color, 0.55));
  for (let s = 0; s < rim.length; s += 1) {
    const a = pick(rim, s);
    const b = pick(rim, (s + 1) % rim.length);
    builder.triangle(apex, b, a);
    builder.triangle(under, a, b);
  }
}

/** Options for {@link addFrond}. */
export interface FrondOptions {
  base: NatureVec;
  /** Unit direction in the XZ plane the frond reaches toward. */
  heading: number;
  /** Start pitch in radians above horizontal. */
  pitch: number;
  length: number;
  width: number;
  /** How far the tip curls down, 0..1.5. */
  droop: number;
  segments: number;
  /** Leaflet teeth per side; 0 for a smooth blade. */
  leaflets: number;
  /** Fold of the blade along its rib, 0 flat to 1 a deep V. */
  fold: number;
  color: NatureRgb;
  tipColor: NatureRgb;
}

/**
 * A folded, drooping leaf blade: palm and cycad fronds, fern fronds, broad bush leaves. Both faces
 * are emitted (the shared material is single-sided) with normals leaning up, so the underside of a
 * raised frond reads as lit foliage rather than a black sliver.
 * @capability nature-generator seeded trees, palms, bushes, ferns, rocks and pebbles with editor variants and instanced scatter
 */
export function addFrond(builder: NatureMeshBuilder, options: FrondOptions): void {
  const segments = Math.max(2, Math.floor(options.segments));
  const dirX = Math.cos(options.heading);
  const dirZ = Math.sin(options.heading);
  const sideX = -dirZ;
  const sideZ = dirX;
  let x = options.base[0];
  let y = options.base[1];
  let z = options.base[2];
  const step = options.length / segments;
  let previous: [number, number, number, number, number, number] | null = null;
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const pitch = options.pitch - options.droop * t * t * 2.2;
    if (i > 0) {
      x += dirX * Math.cos(pitch) * step;
      z += dirZ * Math.cos(pitch) * step;
      y += Math.sin(pitch) * step;
    }
    const profile = Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95));
    const tooth = options.leaflets > 0 && i % 2 === 1 ? 0.45 : 1;
    const half = (options.width / 2) * profile * tooth;
    const lift = half * options.fold * 0.6;
    const color = mixRgb(options.color, options.tipColor, t);
    const ribAt: NatureVec = [x, y, z];
    const leftAt: NatureVec = [x + sideX * half, y - lift, z + sideZ * half];
    const rightAt: NatureVec = [x - sideX * half, y - lift, z - sideZ * half];
    const rib = builder.vertex(ribAt, shade(color, 1.05), 0.45);
    const left = builder.vertex(leftAt, shade(color, 0.92), 0.45);
    const right = builder.vertex(rightAt, shade(color, 0.92), 0.45);
    const under = shade(color, 0.8);
    const ribB = builder.vertex(ribAt, under, 0.9);
    const leftB = builder.vertex(leftAt, under, 0.9);
    const rightB = builder.vertex(rightAt, under, 0.9);
    if (previous !== null) {
      const [pr, pl, pp, prB, plB, ppB] = previous;
      builder.triangle(pr, left, rib);
      builder.triangle(pr, pl, left);
      builder.triangle(pr, rib, right);
      builder.triangle(pr, right, pp);
      builder.triangle(prB, ribB, leftB);
      builder.triangle(prB, leftB, plB);
      builder.triangle(prB, rightB, ribB);
      builder.triangle(prB, ppB, rightB);
    }
    previous = [rib, left, right, ribB, leftB, rightB];
  }
}

/** Options for {@link addStone}. */
export interface StoneOptions {
  center: NatureVec;
  /** Half extents before shaping. */
  radii: NatureVec;
  level: number;
  /** Noise displacement 0..1. */
  roughness: number;
  /** Number of flat cuts that give the stone faces and edges. */
  facets: number;
  /** 0 keeps cuts sharp; 1 rounds them back toward a pebble. */
  erosion: number;
  /** Fraction of the height buried below y = center. */
  sink: number;
  seed: number;
  random: () => number;
  color: NatureRgb;
  mossColor: NatureRgb;
  /** Moss cover on upward faces, 0..1. */
  moss: number;
  colorVariance: number;
}

/**
 * One stone: an icosphere displaced by noise, sliced by `facets` random planes (sharp edges), with
 * `erosion` blending the cuts back toward smooth, moss on the faces that look up, and a flat buried
 * base. Vertices are not shared between faces, so it shades faceted like a real low-poly rock.
 * @capability nature-generator seeded trees, palms, bushes, ferns, rocks and pebbles with editor variants and instanced scatter
 */
export function addStone(builder: NatureMeshBuilder, options: StoneOptions): void {
  const { vertices, faces } = icosphere(options.level);
  const planes: { n: [number, number, number]; d: number }[] = [];
  for (let i = 0; i < Math.floor(options.facets); i += 1) {
    const theta = options.random() * Math.PI * 2;
    const phi = Math.acos(options.random() * 1.6 - 0.6);
    planes.push({ n: [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)], d: 0.55 + options.random() * 0.35 });
  }
  const shaped = vertices.map((v): [number, number, number] => {
    const n = natureNoise(options.seed, v[0] * 1.9 + 7, v[1] * 1.9, v[2] * 1.9) * 0.65 + natureNoise(options.seed + 5, v[0] * 4.3, v[1] * 4.3, v[2] * 4.3) * 0.35;
    let p: [number, number, number] = [v[0] * (1 + (n - 0.5) * 2 * options.roughness), v[1] * (1 + (n - 0.5) * 2 * options.roughness), v[2] * (1 + (n - 0.5) * 2 * options.roughness)];
    for (const plane of planes) {
      const over = p[0] * plane.n[0] + p[1] * plane.n[1] + p[2] * plane.n[2] - plane.d;
      if (over > 0) {
        const cut = over * (1 - options.erosion * 0.8);
        p = [p[0] - plane.n[0] * cut, p[1] - plane.n[1] * cut, p[2] - plane.n[2] * cut];
      }
    }
    const floor = -1 + options.sink * 2;
    if (p[1] < floor) p[1] = floor + (p[1] - floor) * 0.15;
    return [options.center[0] + p[0] * options.radii[0], options.center[1] + (p[1] - floor) * options.radii[1], options.center[2] + p[2] * options.radii[2]];
  });
  // A cut can slice the underside off; settle the stone so its lowest point still rests on its base.
  const lowest = shaped.reduce((min, point) => Math.min(min, point[1]), Infinity);
  for (const point of shaped) point[1] -= lowest - options.center[1];
  const tone = (options.random() - 0.5) * options.colorVariance;
  for (const [a, b, c] of faces) {
    const pa = pick(shaped, a);
    const pb = pick(shaped, b);
    const pc = pick(shaped, c);
    const normal = normalize(cross([pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]]));
    const mid: NatureVec = [(pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3, (pa[2] + pb[2] + pc[2]) / 3];
    const grain = (natureNoise(options.seed + 31, mid[0] * 2.5, mid[1] * 2.5, mid[2] * 2.5) - 0.5) * options.colorVariance;
    const mossy = options.moss > 0 && normal[1] > 1 - options.moss * 0.9 && natureNoise(options.seed + 9, mid[0] * 1.3, mid[1] * 1.3, mid[2] * 1.3) < 0.35 + options.moss * 0.5;
    const light = 0.82 + normal[1] * 0.12 + tone + grain;
    const color = shade(mossy ? mixRgb(options.color, options.mossColor, 0.7) : options.color, mossy ? 0.92 + grain : light);
    const ia = builder.vertex(pa, color);
    const ib = builder.vertex(pb, color);
    const ic = builder.vertex(pc, color);
    builder.triangle(ia, ib, ic);
  }
}
