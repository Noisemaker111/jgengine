// @skill jgengine-world
import { normalizeToonRamp, type ToonRamp } from "../../material/toonRamp";
import { hexRgb, icosphere, type NatureMesh, type NatureRgb } from "../../nature/natureMesh";
import type { LeafShapeParams } from "../species/plantSpecies";
import { hashPlantStructure, PLANT_CLUSTER_LEVELS, PLANT_REGION, type PlantStructure } from "../structure/plantStructure";
import { PLANT_LEAF_ATLAS_CELL_COUNT, PLANT_LEAF_ATLAS_CELLS } from "./plantLeafAtlas";

/** Detail of each mesh level, highest first: leaves, shoot cards, then leaf clusters at two sizes. */
export const PLANT_MESH_LODS = [1, 0.5, 0.25, 0.1] as const;

/** Most triangles a plant mesh may have at each level of {@link PLANT_MESH_LODS}, at any age. */
export const PLANT_MESH_TRIANGLE_BUDGETS = [120_000, 30_000, 8_000, 1_500] as const;

/** Share of each level's budget the wood may take; the foliage gets the rest. */
const BARK_SHARE = [0.33, 0.27, 0.25, 0.2] as const;

/**
 * How a grown plant looks: everything a style changes without regrowing it. A game builds its own
 * looks from these parts; the engine names none.
 * @capability plant-mesh turn a grown plant into a styled mesh at four detail levels within fixed triangle budgets
 */
export interface PlantStyle {
  /**
   * `leaves`: textured from the species' leaf shape at every level: each leaf near, leafy shoot cards
   * further out, crossed leaf-cluster cards far away. `clumps`: untextured rounded clumps per shoot
   * and limb (toon, clay).
   */
  foliage: "leaves" | "clumps";
  /** Drawn leaf size over the species' leaf size, 0.5..5. */
  leafScale: number;
  /** Multiplies the leaf colours; `#ffffff` keeps the species' own. */
  leafTint: string;
  /** Multiplies the bark colours; `#ffffff` keeps the species' own. */
  barkTint: string;
  /** 0 grey .. 1 as grown .. 2 vivid. */
  saturation: number;
  /** Overall brightness, 1 as grown. */
  brightness: number;
  /** Per-leaf and per-ring colour variation, 0..0.5. */
  colorJitter: number;
  /** 0 tints the grown colours .. 1 paints every surface its tint colour flat (clay, chalk, a silhouette). */
  paint: number;
  /** `lit`: physically lit. `ramp`: cel-shaded through {@link PlantStyle.ramp}. */
  shading: "lit" | "ramp";
  ramp: ToonRamp;
  /** Generated bark grain on the wood (lit shading only). */
  barkGrain: boolean;
}

/**
 * The style a plant gets when none is given: the species' own colours, lit, with real leaves.
 * @capability plant-mesh turn a grown plant into a styled mesh at four detail levels within fixed triangle budgets
 */
export const DEFAULT_PLANT_STYLE: PlantStyle = {
  foliage: "leaves",
  leafScale: 2.6,
  leafTint: "#ffffff",
  barkTint: "#ffffff",
  saturation: 1,
  brightness: 1,
  colorJitter: 0.15,
  paint: 0,
  shading: "lit",
  ramp: { bands: 3, softness: 0.2, shadow: 0.35 },
  barkGrain: true,
};

/** What the draw side needs to pick materials for a plant mesh. */
export interface PlantMeshLook {
  shading: "lit" | "ramp";
  ramp: ToonRamp;
  barkGrain: boolean;
  /** The leaf shape the foliage's atlas is baked from ({@link bakePlantLeafAtlas}); null draws untextured foliage. */
  leafAtlas: LeafShapeParams | null;
}

/**
 * A grown plant drawn in one style at one detail level: wood and foliage as separate vertex-coloured
 * meshes so each takes its own material.
 * @capability plant-mesh turn a grown plant into a styled mesh at four detail levels within fixed triangle budgets
 */
export interface PlantMesh {
  /** {@link hashPlantStructure} of the structure it was built from. */
  structureHash: string;
  speciesId: string;
  ageYears: number;
  /** Index into {@link PLANT_MESH_LODS}. */
  lod: number;
  stats: PlantStructure["stats"];
  bark: NatureMesh;
  leaves: NatureMesh;
  /** Two atlas coordinates per foliage vertex when {@link PlantMeshLook.leafAtlas} is set, else empty. */
  leafUvs: Float32Array;
  look: PlantMeshLook;
  triangles: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

/**
 * True when a generator output is a {@link PlantMesh}.
 * @capability plant-mesh turn a grown plant into a styled mesh at four detail levels within fixed triangle budgets
 */
export function isPlantMesh(value: unknown): value is PlantMesh {
  return typeof value === "object" && value !== null && "structureHash" in value && "bark" in value && "leaves" in value && "look" in value;
}

/**
 * The level of {@link PLANT_MESH_LODS} a generator detail value draws.
 * @capability plant-mesh turn a grown plant into a styled mesh at four detail levels within fixed triangle budgets
 */
export function plantMeshLod(detail: number): number {
  if (detail >= 0.75) return 0;
  if (detail >= 0.375) return 1;
  if (detail >= 0.15) return 2;
  return 3;
}

/** Growable vertex and index buffers with explicit normals, emitted as a {@link NatureMesh}. */
class PartWriter {
  positions: Float32Array = new Float32Array(3 * 1024);
  normals: Float32Array = new Float32Array(3 * 1024);
  colors: Float32Array = new Float32Array(3 * 1024);
  uvs: Float32Array = new Float32Array(2 * 1024);
  indices: Uint32Array = new Uint32Array(3 * 1024);
  vertexCount = 0;
  indexCount = 0;

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, color: Float64Array): number {
    if ((this.vertexCount + 1) * 3 > this.positions.length) {
      this.positions = grow(this.positions);
      this.normals = grow(this.normals);
      this.colors = grow(this.colors);
      this.uvs = grow(this.uvs);
    }
    const at = this.vertexCount * 3;
    this.positions[at] = x;
    this.positions[at + 1] = y;
    this.positions[at + 2] = z;
    this.normals[at] = nx;
    this.normals[at + 1] = ny;
    this.normals[at + 2] = nz;
    this.colors[at] = color[0] ?? 0;
    this.colors[at + 1] = color[1] ?? 0;
    this.colors[at + 2] = color[2] ?? 0;
    this.vertexCount += 1;
    return this.vertexCount - 1;
  }

  /** Atlas coordinates of the vertex just written. */
  uv(u: number, v: number): void {
    const at = (this.vertexCount - 1) * 2;
    this.uvs[at] = u;
    this.uvs[at + 1] = v;
  }

  builtUvs(): Float32Array {
    return this.uvs.slice(0, this.vertexCount * 2);
  }

  triangle(a: number, b: number, c: number): void {
    if (this.indexCount + 3 > this.indices.length) this.indices = growIndices(this.indices);
    this.indices[this.indexCount] = a;
    this.indices[this.indexCount + 1] = b;
    this.indices[this.indexCount + 2] = c;
    this.indexCount += 3;
  }

  get triangles(): number {
    return this.indexCount / 3;
  }

  build(surface?: "bark"): NatureMesh {
    const positions = this.positions.slice(0, this.vertexCount * 3);
    return {
      positions,
      normals: this.normals.slice(0, this.vertexCount * 3),
      colors: this.colors.slice(0, this.vertexCount * 3),
      indices: this.indices.slice(0, this.indexCount),
      bounds: boundsOf(positions),
      triangles: this.indexCount / 3,
      ...(surface === undefined ? {} : { surface }),
    };
  }
}

function boundsOf(positions: Float32Array): { min: [number, number, number]; max: [number, number, number] } {
  if (positions.length === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] ?? 0;
    const y = positions[i + 1] ?? 0;
    const z = positions[i + 2] ?? 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

function unionBounds(a: NatureMesh, b: NatureMesh): { min: [number, number, number]; max: [number, number, number] } {
  if (b.triangles === 0) return a.bounds;
  if (a.triangles === 0) return b.bounds;
  return {
    min: [Math.min(a.bounds.min[0], b.bounds.min[0]), Math.min(a.bounds.min[1], b.bounds.min[1]), Math.min(a.bounds.min[2], b.bounds.min[2])],
    max: [Math.max(a.bounds.max[0], b.bounds.max[0]), Math.max(a.bounds.max[1], b.bounds.max[1]), Math.max(a.bounds.max[2], b.bounds.max[2])],
  };
}

function grow(array: Float32Array): Float32Array {
  const next = new Float32Array(array.length * 2);
  next.set(array);
  return next;
}

function growIndices(array: Uint32Array): Uint32Array {
  const next = new Uint32Array(array.length * 2);
  next.set(array);
  return next;
}

/** 0..1 from two integers, the same on every engine. */
function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

function seedNumber(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h | 0;
}

/** Colour post-process a style applies to every vertex colour. */
interface ColorGrade {
  tint: NatureRgb;
  paint: number;
  saturation: number;
  brightness: number;
  jitter: number;
}

function grade(out: Float64Array, g: ColorGrade, variation: number): void {
  let r = (out[0] ?? 0) * g.tint[0];
  let gr = (out[1] ?? 0) * g.tint[1];
  let b = (out[2] ?? 0) * g.tint[2];
  const luma = 0.2126 * r + 0.7152 * gr + 0.0722 * b;
  const light = g.brightness * (1 + (variation - 0.5) * 2 * g.jitter);
  r = luma + (r - luma) * g.saturation;
  gr = luma + (gr - luma) * g.saturation;
  b = luma + (b - luma) * g.saturation;
  // Paint keeps a trace of the grown shading (its luma) so a painted crown still reads.
  const relief = 0.75 + 0.5 * luma;
  r = (r + (g.tint[0] * relief - r) * g.paint) * light;
  gr = (gr + (g.tint[1] * relief - gr) * g.paint) * light;
  b = (b + (g.tint[2] * relief - b) * g.paint) * light;
  out[0] = r < 0 ? 0 : r > 1 ? 1 : r;
  out[1] = gr < 0 ? 0 : gr > 1 ? 1 : gr;
  out[2] = b < 0 ? 0 : b > 1 ? 1 : b;
}

function mixInto(out: Float64Array, a: NatureRgb, b: NatureRgb, t: number): void {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  out[0] = a[0] + (b[0] - a[0]) * k;
  out[1] = a[1] + (b[1] - a[1]) * k;
  out[2] = a[2] + (b[2] - a[2]) * k;
}

const DRY_LEAF: NatureRgb = [0.55, 0.47, 0.25];
const DEADWOOD: NatureRgb = [0.55, 0.53, 0.5];
const YOUNG_SHOOT: NatureRgb = [0.45, 0.38, 0.22];

/** Each leaf row's colour before grading: season, depth in the crown and health. */
function leafRowColors(structure: PlantStructure): Float32Array {
  const rows = structure.leaves.size.length;
  const out = new Float32Array(rows * 3);
  const spring = hexRgb(structure.leafColor.spring);
  const summer = hexRgb(structure.leafColor.summer);
  const autumn = hexRgb(structure.leafColor.autumn);
  const color = new Float64Array(3);
  const { colorState, crownDepth, health } = structure.leaves;
  for (let row = 0; row < rows; row += 1) {
    const chlorophyll = colorState[row * 4] ?? 1;
    const senescence = colorState[row * 4 + 3] ?? 0;
    const young = senescence > 0 ? 0 : Math.min(1, (1 - chlorophyll) / 0.3);
    mixInto(color, summer, spring, young);
    const base: NatureRgb = [color[0] ?? 0, color[1] ?? 0, color[2] ?? 0];
    mixInto(color, base, autumn, senescence);
    const weak: NatureRgb = [color[0] ?? 0, color[1] ?? 0, color[2] ?? 0];
    mixInto(color, weak, DRY_LEAF, (1 - (health[row] ?? 1)) * 0.5);
    const shadeIn = 1 - 0.4 * (crownDepth[row] ?? 0);
    out[row * 3] = (color[0] ?? 0) * shadeIn;
    out[row * 3 + 1] = (color[1] ?? 0) * shadeIn;
    out[row * 3 + 2] = (color[2] ?? 0) * shadeIn;
  }
  return out;
}

const scratchA = new Float64Array(3);
const scratchB = new Float64Array(3);

function normalizeInto(out: Float64Array, x: number, y: number, z: number): void {
  const length = Math.sqrt(x * x + y * y + z * z);
  if (length < 1e-12) {
    out[0] = 0;
    out[1] = 1;
    out[2] = 0;
    return;
  }
  out[0] = x / length;
  out[1] = y / length;
  out[2] = z / length;
}

/** Two unit vectors perpendicular to (ux, uy, uz) and to each other, into scratchA and scratchB. */
function basisAround(ux: number, uy: number, uz: number): void {
  const helperX = Math.abs(uy) < 0.9 ? 0 : 1;
  const helperY = Math.abs(uy) < 0.9 ? 1 : 0;
  normalizeInto(scratchA, uy * 0 - uz * helperY, uz * helperX - ux * 0, ux * helperY - uy * helperX);
  const ax = scratchA[0] ?? 0;
  const ay = scratchA[1] ?? 0;
  const az = scratchA[2] ?? 0;
  normalizeInto(scratchB, uy * az - uz * ay, uz * ax - ux * az, ux * ay - uy * ax);
}

interface BarkBuild {
  writer: PartWriter;
  structure: PlantStructure;
  grade: ColorGrade;
  seed: number;
  lod: number;
  budget: number;
}

function sidesFor(radius: number, lod: number): number {
  const table = [
    [10, 7, 5, 3],
    [7, 5, 4, 3],
    [6, 4, 3, 3],
    [5, 3, 3, 3],
  ][lod] ?? [3, 3, 3, 3];
  if (radius > 0.2) return table[0] ?? 3;
  if (radius > 0.05) return table[1] ?? 3;
  if (radius > 0.015) return table[2] ?? 3;
  return table[3] ?? 3;
}

/**
 * The thinnest wood radius drawn within a triangle budget: segments are drawn thickest first, each
 * costing two triangles per side of the axis it belongs to, until the budget runs out.
 */
function radiusCutoff(radiusStart: Float32Array, axisRadius: Float32Array, lod: number, budget: number): number {
  const n = radiusStart.length;
  const byRadius = Array.from({ length: n }, (_, i) => i);
  byRadius.sort((a, b) => (radiusStart[b] ?? 0) - (radiusStart[a] ?? 0) || a - b);
  let used = 0;
  for (const i of byRadius) {
    used += 2 * sidesFor(axisRadius[i] ?? 0, lod);
    if (used > budget) return (radiusStart[i] ?? 0) + 1e-7;
  }
  return 0;
}

function barkRingColor(build: BarkBuild, segment: number, ring: number, y: number, out: Float64Array): void {
  const { structure } = build;
  const bark = hexRgb(structure.bark.color);
  const region = structure.segments.region[segment] ?? PLANT_REGION.branch;
  if (region === PLANT_REGION.deadwood) mixInto(out, bark, DEADWOOD, 0.7);
  else if (region === PLANT_REGION.twig) mixInto(out, bark, YOUNG_SHOOT, 0.5);
  else if (region === PLANT_REGION.scar) mixInto(out, bark, [bark[0] * 0.6, bark[1] * 0.55, bark[2] * 0.5], 1);
  else mixInto(out, bark, bark, 0);
  const groundShade = 0.75 + 0.25 * Math.min(1, Math.max(0, y) / 2);
  out[0] = (out[0] ?? 0) * groundShade;
  out[1] = (out[1] ?? 0) * groundShade;
  out[2] = (out[2] ?? 0) * groundShade;
  grade(out, build.grade, hash01(build.seed ^ segment, ring));
}

function addBark(build: BarkBuild): void {
  const { structure, writer, lod } = build;
  const { start, end, radiusStart, radiusEnd, parent, order } = structure.segments;
  const n = order.length;
  // An axis continues through the first child of the same order; every other child starts a new one.
  const next = new Int32Array(n).fill(-1);
  const continues = new Uint8Array(n);
  const axisRadius = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const p = parent[i] ?? -1;
    if (p >= 0 && (order[i] ?? 0) === (order[p] ?? 0) && (next[p] ?? -1) < 0) {
      next[p] = i;
      continues[i] = 1;
    }
    axisRadius[i] = continues[i] === 1 ? (axisRadius[p] ?? 0) : (radiusStart[i] ?? 0);
  }
  // The trunk's buried ring costs one more ring of the thickest sides.
  const cutoff = radiusCutoff(radiusStart, axisRadius, lod, build.budget - 2 * sidesFor(radiusStart[0] ?? 0, lod));
  const color = new Float64Array(3);
  const ringX: number[] = [];
  const ringY: number[] = [];
  const ringZ: number[] = [];
  const ringR: number[] = [];
  const ringSeg: number[] = [];
  for (let first = 0; first < n; first += 1) {
    if (continues[first] === 1 || (radiusStart[first] ?? 0) < cutoff) continue;
    ringX.length = 0;
    ringY.length = 0;
    ringZ.length = 0;
    ringR.length = 0;
    ringSeg.length = 0;
    const trunk = (order[first] ?? 0) === 0 && (parent[first] ?? -1) < 0;
    if (trunk) {
      // Sink the trunk a little so it never floats on a slope, flaring at the root collar.
      ringX.push(start[first * 3] ?? 0);
      ringY.push(-0.3);
      ringZ.push(start[first * 3 + 2] ?? 0);
      ringR.push((radiusStart[first] ?? 0) * 1.45);
      ringSeg.push(first);
    }
    ringX.push(start[first * 3] ?? 0);
    ringY.push(start[first * 3 + 1] ?? 0);
    ringZ.push(start[first * 3 + 2] ?? 0);
    ringR.push((radiusStart[first] ?? 0) * (trunk ? 1.3 : 1));
    ringSeg.push(first);
    for (let s = first; s >= 0 && (radiusStart[s] ?? 0) >= cutoff; s = next[s] ?? -1) {
      ringX.push(end[s * 3] ?? 0);
      ringY.push(end[s * 3 + 1] ?? 0);
      ringZ.push(end[s * 3 + 2] ?? 0);
      ringR.push(radiusEnd[s] ?? 0);
      ringSeg.push(s);
    }
    addAxisTube(build, ringX, ringY, ringZ, ringR, ringSeg, color);
  }
  if (writer.triangles === 0 && n > 0) {
    // A seedling thinner than any cutoff still shows its stem.
    ringX.length = 0;
    ringY.length = 0;
    ringZ.length = 0;
    ringR.length = 0;
    ringSeg.length = 0;
    for (let s = 0; s >= 0; s = next[s] ?? -1) {
      if (ringX.length === 0) {
        ringX.push(start[0] ?? 0);
        ringY.push(start[1] ?? 0);
        ringZ.push(start[2] ?? 0);
        ringR.push(radiusStart[0] ?? 0);
        ringSeg.push(0);
      }
      ringX.push(end[s * 3] ?? 0);
      ringY.push(end[s * 3 + 1] ?? 0);
      ringZ.push(end[s * 3 + 2] ?? 0);
      ringR.push(radiusEnd[s] ?? 0);
      ringSeg.push(s);
    }
    addAxisTube(build, ringX, ringY, ringZ, ringR, ringSeg, color);
  }
}

/** One axis as a tube with rotation-minimising rings and radial normals. */
function addAxisTube(build: BarkBuild, xs: number[], ys: number[], zs: number[], rs: number[], segs: number[], color: Float64Array): void {
  const count = xs.length;
  if (count < 2) return;
  const { writer, lod } = build;
  const sides = sidesFor(rs[0] ?? 0, lod);
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let previousRing = -1;
  for (let i = 0; i < count; i += 1) {
    const a = Math.max(0, i - 1);
    const b = Math.min(count - 1, i + 1);
    normalizeInto(scratchA, (xs[b] ?? 0) - (xs[a] ?? 0), (ys[b] ?? 0) - (ys[a] ?? 0), (zs[b] ?? 0) - (zs[a] ?? 0));
    const tx = scratchA[0] ?? 0;
    const ty = scratchA[1] ?? 1;
    const tz = scratchA[2] ?? 0;
    if (i === 0) {
      basisAround(tx, ty, tz);
      nx = scratchA[0] ?? 1;
      ny = scratchA[1] ?? 0;
      nz = scratchA[2] ?? 0;
    } else {
      const dot = nx * tx + ny * ty + nz * tz;
      normalizeInto(scratchB, nx - tx * dot, ny - ty * dot, nz - tz * dot);
      nx = scratchB[0] ?? 1;
      ny = scratchB[1] ?? 0;
      nz = scratchB[2] ?? 0;
    }
    const bx = ty * nz - tz * ny;
    const by = tz * nx - tx * nz;
    const bz = tx * ny - ty * nx;
    const cx = xs[i] ?? 0;
    const cy = ys[i] ?? 0;
    const cz = zs[i] ?? 0;
    const radius = Math.max(rs[i] ?? 0, 0.0008);
    barkRingColor(build, segs[i] ?? 0, i, cy, color);
    const ring = writer.vertexCount;
    for (let s = 0; s < sides; s += 1) {
      const angle = (s / sides) * Math.PI * 2;
      const c = Math.cos(angle);
      const sn = Math.sin(angle);
      const rx = nx * c + bx * sn;
      const ry = ny * c + by * sn;
      const rz = nz * c + bz * sn;
      writer.vertex(cx + rx * radius, cy + ry * radius, cz + rz * radius, rx, ry, rz, color);
    }
    if (previousRing >= 0) {
      for (let s = 0; s < sides; s += 1) {
        const s1 = (s + 1) % sides;
        writer.triangle(previousRing + s, ring + s1, ring + s);
        writer.triangle(previousRing + s, previousRing + s1, ring + s1);
      }
    }
    previousRing = ring;
  }
}

interface FoliageBuild {
  writer: PartWriter;
  structure: PlantStructure;
  style: PlantStyle;
  grade: ColorGrade;
  rowColors: Float32Array;
  seed: number;
  budget: number;
}

/** Outward direction of a leaf row from its limb clump's centre, for soft volumetric leaf lighting. */
function outwardInto(structure: PlantStructure, row: number, out: Float64Array): void {
  const level = structure.clusters.levels[Math.min(1, PLANT_CLUSTER_LEVELS - 1)];
  const id = structure.leaves.cluster[row * PLANT_CLUSTER_LEVELS + 1] ?? 0;
  const p = structure.leaves.position;
  const cx = level?.center[id * 3] ?? 0;
  const cy = level?.center[id * 3 + 1] ?? 0;
  const cz = level?.center[id * 3 + 2] ?? 0;
  normalizeInto(out, (p[row * 3] ?? 0) - cx, (p[row * 3 + 1] ?? 0) - cy + 0.3, (p[row * 3 + 2] ?? 0) - cz);
}

/** Left edge of an atlas cell in texture u. */
function cellU(cell: number): number {
  return cell / PLANT_LEAF_ATLAS_CELL_COUNT;
}

/**
 * Textured leaf quads around each leaf row. `perRow` leaves per row (1 draws one leafy shoot card
 * standing for the row's leaves), rows kept at `keep` with sizes scaled so the crown keeps its cover.
 */
function addLeafCards(build: FoliageBuild, perRowOverride: number | null, cardScale: number): void {
  const { structure, writer, style } = build;
  const { position, normal, up, size, count, segment } = structure.leaves;
  const { start } = structure.segments;
  const rows = size.length;
  let leaves = 0;
  for (let row = 0; row < rows; row += 1) leaves += perRowOverride ?? (count[row] ?? 1);
  // Sampled a little under the budget so the hard stop below rarely drops the last rows.
  const keep = Math.min(1, (0.97 * build.budget) / Math.max(1, leaves * 2));
  const coverScale = 1 / Math.sqrt(keep);
  const color = new Float64Array(3);
  const outward = new Float64Array(3);
  const face = new Float64Array(3);
  const dir = new Float64Array(3);
  for (let row = 0; row < rows; row += 1) {
    if (keep < 1 && hash01(build.seed, row) >= keep) continue;
    const perRow = perRowOverride ?? (count[row] ?? 1);
    const px = position[row * 3] ?? 0;
    const py = position[row * 3 + 1] ?? 0;
    const pz = position[row * 3 + 2] ?? 0;
    // Leaves sit along the outer part of the shoot that bears them, not all at its tip.
    const node = segment[row] ?? -1;
    const sx = node >= 0 ? (start[node * 3] ?? px) : px;
    const sy = node >= 0 ? (start[node * 3 + 1] ?? py) : py;
    const sz = node >= 0 ? (start[node * 3 + 2] ?? pz) : pz;
    const shootLength = Math.sqrt((px - sx) * (px - sx) + (py - sy) * (py - sy) + (pz - sz) * (pz - sz));
    const ux = up[row * 3] ?? 0;
    const uy = up[row * 3 + 1] ?? 1;
    const uz = up[row * 3 + 2] ?? 0;
    const lnx = normal[row * 3] ?? 0;
    const lny = normal[row * 3 + 1] ?? 1;
    const lnz = normal[row * 3 + 2] ?? 0;
    outwardInto(structure, row, outward);
    basisAround(ux, uy, uz);
    const ax = scratchA[0] ?? 1;
    const ay = scratchA[1] ?? 0;
    const az = scratchA[2] ?? 0;
    const bx = scratchB[0] ?? 0;
    const by = scratchB[1] ?? 0;
    const bz = scratchB[2] ?? 1;
    const leafLength = (size[row] ?? 0.1) * style.leafScale * cardScale * coverScale;
    // A shoot card stands for every leaf on the shoot, so it is never shorter than half the shoot.
    const length = perRow === 1 ? Math.max(leafLength, shootLength * 0.5 * style.leafScale) : leafLength;
    const turn = hash01(build.seed ^ 0x5bd1, row) * Math.PI * 2;
    for (let k = 0; k < perRow; k += 1) {
      if (writer.triangles + 2 > build.budget) return;
      const angle = turn + (k / perRow) * Math.PI * 2;
      const ox = ax * Math.cos(angle) + bx * Math.sin(angle);
      const oy = ay * Math.cos(angle) + by * Math.sin(angle);
      const oz = az * Math.cos(angle) + bz * Math.sin(angle);
      const spread = perRow === 1 ? 0.45 : 0.8;
      normalizeInto(dir, ox * spread + ux * 0.4, oy * spread + uy * 0.4 - 0.2, oz * spread + uz * 0.4);
      const dx = dir[0] ?? 0;
      const dy = dir[1] ?? 0;
      const dz = dir[2] ?? 0;
      // The blade faces its row's normal as far as it can while lying along its own direction.
      const along = lnx * dx + lny * dy + lnz * dz;
      normalizeInto(face, lnx - dx * along, lny - dy * along, lnz - dz * along);
      const fx = face[0] ?? 0;
      const fy = face[1] ?? 1;
      const fz = face[2] ?? 0;
      const wx = dy * fz - dz * fy;
      const wy = dz * fx - dx * fz;
      const wz = dx * fy - dy * fx;
      normalizeInto(face, fx * 0.35 + (outward[0] ?? 0) * 0.65, fy * 0.35 + (outward[1] ?? 0) * 0.65, fz * 0.35 + (outward[2] ?? 0) * 0.65);
      const nx = face[0] ?? 0;
      const ny = face[1] ?? 1;
      const nz = face[2] ?? 0;
      const t = perRow === 1 ? 0.35 : 0.3 + (0.7 * (k + 0.5)) / perRow;
      // The atlas leaf spans about 0.1..0.9 of its cell, so the quad is a little longer than the leaf.
      const quad = length / 0.8;
      const half = quad * 0.5;
      const baseX = sx + (px - sx) * t - dx * quad * 0.1;
      const baseY = sy + (py - sy) * t - dy * quad * 0.1;
      const baseZ = sz + (pz - sz) * t - dz * quad * 0.1;
      color[0] = build.rowColors[row * 3] ?? 0;
      color[1] = build.rowColors[row * 3 + 1] ?? 0;
      color[2] = build.rowColors[row * 3 + 2] ?? 0;
      grade(color, build.grade, hash01(build.seed + k, row));
      const u0 = cellU(perRow === 1 ? PLANT_LEAF_ATLAS_CELLS.shoot : PLANT_LEAF_ATLAS_CELLS.leaf);
      const u1 = u0 + cellU(1);
      const v0 = writer.vertex(baseX - wx * half, baseY - wy * half, baseZ - wz * half, nx, ny, nz, color);
      writer.uv(u0, 0);
      const v1 = writer.vertex(baseX + wx * half, baseY + wy * half, baseZ + wz * half, nx, ny, nz, color);
      writer.uv(u1, 0);
      const v2 = writer.vertex(baseX + dx * quad + wx * half, baseY + dy * quad + wy * half, baseZ + dz * quad + wz * half, nx, ny, nz, color);
      writer.uv(u1, 1);
      const v3 = writer.vertex(baseX + dx * quad - wx * half, baseY + dy * quad - wy * half, baseZ + dz * quad - wz * half, nx, ny, nz, color);
      writer.uv(u0, 1);
      writer.triangle(v0, v1, v2);
      writer.triangle(v0, v2, v3);
    }
  }
}

const OCTAHEDRON = {
  vertices: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const,
  faces: [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]] as const,
};

/**
 * Rounded clumps over an even grid of the crown: every occupied cell of `cell` metres becomes one
 * clump at the mean of its leaves, sized by how full it is and coloured by their mean colour. The
 * cell grows until the clumps fit the budget, so a clump never stands for a whole limb.
 */
function addClumps(build: FoliageBuild, baseCell: number, sphereLevel: number): void {
  const { writer } = build;
  const shape = sphereLevel < 0 ? OCTAHEDRON : icosphere(sphereLevel);
  const { slots, cell, sums, members, meanMembers } = groupLeaves(build, baseCell, shape.faces.length);
  const vertexColor = new Float64Array(3);
  for (let slot = 0; slot < slots; slot += 1) {
    const n = Math.max(1, members[slot] ?? 1);
    const cx = (sums[slot * 6] ?? 0) / n;
    const cy = (sums[slot * 6 + 1] ?? 0) / n;
    const cz = (sums[slot * 6 + 2] ?? 0) / n;
    const fill = Math.min(1.2, Math.sqrt(n / Math.max(1, meanMembers)));
    const radius = cell * (0.38 + 0.32 * fill);
    const base = writer.vertexCount;
    for (let v = 0; v < shape.vertices.length; v += 1) {
      const vertex = shape.vertices[v];
      const vx = vertex?.[0] ?? 0;
      const vy = vertex?.[1] ?? 0;
      const vz = vertex?.[2] ?? 0;
      const lump = 1 + (hash01(build.seed ^ slot, v) - 0.5) * 0.3;
      const below = 1 - 0.3 * (1 - (vy + 1) / 2);
      vertexColor[0] = ((sums[slot * 6 + 3] ?? 0) / n) * below;
      vertexColor[1] = ((sums[slot * 6 + 4] ?? 0) / n) * below;
      vertexColor[2] = ((sums[slot * 6 + 5] ?? 0) / n) * below;
      grade(vertexColor, build.grade, hash01(build.seed + slot, v));
      writer.vertex(cx + vx * radius * lump, cy + vy * radius * lump * 0.85, cz + vz * radius * lump, vx, vy, vz, vertexColor);
    }
    for (const face of shape.faces) writer.triangle(base + face[0], base + face[1], base + face[2]);
  }
}

interface LeafGroups {
  slots: number;
  /** Final grid cell size, metres. */
  cell: number;
  /** Per slot: summed position (3) then summed colour (3). */
  sums: Float64Array;
  members: Uint32Array;
  meanMembers: number;
}

/**
 * Leaf rows grouped over an even grid of the crown: every occupied cell of `baseCell` metres is one
 * group at the mean of its leaves. The cell grows until the groups fit the budget at `perGroup`
 * triangles each, so a group never stands for a whole limb.
 */
function groupLeaves(build: FoliageBuild, baseCell: number, perGroup: number): LeafGroups {
  const { structure } = build;
  const most = Math.max(1, Math.floor(build.budget / perGroup));
  const { position } = structure.leaves;
  const rows = structure.leaves.size.length;
  const slotOf = new Int32Array(rows);
  let cell = baseCell;
  let slots = 0;
  for (;;) {
    const cells = new Map<number, number>();
    for (let row = 0; row < rows; row += 1) {
      const ix = Math.floor((position[row * 3] ?? 0) / cell) + 1024;
      const iy = Math.floor((position[row * 3 + 1] ?? 0) / cell) + 1024;
      const iz = Math.floor((position[row * 3 + 2] ?? 0) / cell) + 1024;
      const key = ix + iy * 2048 + iz * 4194304;
      let slot = cells.get(key);
      if (slot === undefined) {
        slot = cells.size;
        cells.set(key, slot);
      }
      slotOf[row] = slot;
    }
    slots = cells.size;
    if (slots <= most) break;
    cell *= 1.25;
  }
  const sums = new Float64Array(slots * 6);
  const members = new Uint32Array(slots);
  for (let row = 0; row < rows; row += 1) {
    const slot = slotOf[row] ?? 0;
    members[slot] = (members[slot] ?? 0) + 1;
    for (let k = 0; k < 3; k += 1) {
      sums[slot * 6 + k] = (sums[slot * 6 + k] ?? 0) + (position[row * 3 + k] ?? 0);
      sums[slot * 6 + 3 + k] = (sums[slot * 6 + 3 + k] ?? 0) + (build.rowColors[row * 3 + k] ?? 0);
    }
  }
  let meanMembers = 0;
  for (let slot = 0; slot < slots; slot += 1) meanMembers += (members[slot] ?? 0) / slots;
  return { slots, cell, sums, members, meanMembers };
}

/**
 * Crossed leaf-cluster cards over the crown, textured with the atlas's cluster cell: two upright
 * cards per group, plus a tilted level one when `level` is set. Normals point out from the crown's
 * middle, so the whole crown lights as one volume.
 */
function addClusterCards(build: FoliageBuild, baseCell: number, level: boolean): void {
  const { writer, structure } = build;
  const cardsPerGroup = level ? 3 : 2;
  const { slots, cell, sums, members, meanMembers } = groupLeaves(build, baseCell, cardsPerGroup * 2);
  const { heightM, crownBaseM } = structure.stats;
  const midY = (heightM + crownBaseM) / 2;
  const u0 = cellU(PLANT_LEAF_ATLAS_CELLS.cluster);
  const u1 = u0 + cellU(1);
  const color = new Float64Array(3);
  const normal = new Float64Array(3);
  for (let slot = 0; slot < slots; slot += 1) {
    const n = Math.max(1, members[slot] ?? 1);
    const cx = (sums[slot * 6] ?? 0) / n;
    const cy = (sums[slot * 6 + 1] ?? 0) / n;
    const cz = (sums[slot * 6 + 2] ?? 0) / n;
    const fill = Math.min(1.2, Math.sqrt(n / Math.max(1, meanMembers)));
    // The atlas cluster fills about two thirds of its cell, so a card is wider than its group.
    const half = cell * (0.55 + 0.35 * fill);
    const yaw = hash01(build.seed ^ 0x2f6b, slot) * Math.PI;
    for (let card = 0; card < cardsPerGroup; card += 1) {
      // Upright cards cross at right angles; the third lies tilted towards the sky.
      const angle = yaw + (card * Math.PI) / 2;
      const ax = Math.cos(angle);
      const az = Math.sin(angle);
      const flat = card === 2;
      const bx = flat ? -az * 0.94 : 0;
      const by = flat ? 0.34 : 1;
      const bz = flat ? ax * 0.94 : 0;
      const base = writer.vertexCount;
      for (let k = 0; k < 4; k += 1) {
        const su = k === 0 || k === 3 ? -1 : 1;
        const sv = k < 2 ? -1 : 1;
        const x = cx + (ax * su + bx * sv) * half;
        const y = cy + by * sv * half;
        const z = cz + (az * su + bz * sv) * half;
        normalizeInto(normal, x, (y - midY) * 1.2 + half * 0.6, z);
        const shade = 0.82 + (0.18 * (sv + 1)) / 2;
        color[0] = ((sums[slot * 6 + 3] ?? 0) / n) * shade;
        color[1] = ((sums[slot * 6 + 4] ?? 0) / n) * shade;
        color[2] = ((sums[slot * 6 + 5] ?? 0) / n) * shade;
        grade(color, build.grade, hash01(build.seed + slot, card * 4 + k));
        writer.vertex(x, y, z, normal[0] ?? 0, normal[1] ?? 1, normal[2] ?? 0, color);
        writer.uv(su < 0 ? u0 : u1, sv < 0 ? 0 : 1);
      }
      writer.triangle(base, base + 1, base + 2);
      writer.triangle(base, base + 2, base + 3);
    }
  }
}

function addFoliage(build: FoliageBuild, lod: number): void {
  if (build.structure.leaves.size.length === 0) return;
  const clumps = build.style.foliage === "clumps";
  // Clump cells start about four drawn leaves across and widen with each level.
  const cell = Math.max(0.4, 4 * (build.structure.leaves.size[0] ?? 0.1) * build.style.leafScale);
  if (lod === 0) {
    if (clumps) addClumps(build, cell, 1);
    else addLeafCards(build, null, 1);
  } else if (lod === 1) {
    if (clumps) addClumps(build, cell * 1.5, 0);
    else addLeafCards(build, 1, 1.9);
  } else if (lod === 2) {
    if (clumps) addClumps(build, cell * 2, 0);
    else addClusterCards(build, cell * 1.2, true);
  } else if (clumps) {
    addClumps(build, cell * 3.5, -1);
  } else {
    addClusterCards(build, cell * 2, false);
  }
}

/** What {@link buildPlantMesh} draws. */
export interface PlantMeshInput {
  structure: PlantStructure;
  style?: PlantStyle;
  /** Generator detail, 0..1; picks the level of {@link PLANT_MESH_LODS}. Default 1. */
  detail?: number;
  /** The structure's hash when the caller already has it. */
  structureHash?: string;
}

/**
 * Draw a grown plant in one style at one detail level, within that level's triangle budget at any
 * age: leaf blades near, shoot cards, then limb and crown clumps; wood thinnest-first culled to fit.
 * @capability plant-mesh turn a grown plant into a styled mesh at four detail levels within fixed triangle budgets
 */
export function buildPlantMesh(input: PlantMeshInput): PlantMesh {
  const { structure } = input;
  const style = input.style ?? DEFAULT_PLANT_STYLE;
  const lod = plantMeshLod(input.detail ?? 1);
  const budget = PLANT_MESH_TRIANGLE_BUDGETS[lod] ?? 1_500;
  const barkBudget = Math.floor(budget * (BARK_SHARE[lod] ?? 0.25));
  const seed = seedNumber(structure.seed);
  const saturation = Math.max(0, Math.min(2, style.saturation));
  const brightness = Math.max(0.2, Math.min(2, style.brightness));
  const jitter = Math.max(0, Math.min(0.5, style.colorJitter));
  const paint = Math.max(0, Math.min(1, style.paint));
  const barkWriter = new PartWriter();
  addBark({ writer: barkWriter, structure, grade: { tint: hexRgb(style.barkTint), paint, saturation, brightness, jitter: jitter * 0.5 }, seed, lod, budget: barkBudget });
  const leafWriter = new PartWriter();
  addFoliage(
    {
      writer: leafWriter,
      structure,
      style,
      grade: { tint: hexRgb(style.leafTint), paint, saturation, brightness, jitter },
      rowColors: leafRowColors(structure),
      seed,
      budget: budget - barkWriter.triangles,
    },
    lod,
  );
  const bark = barkWriter.build(style.barkGrain && style.shading === "lit" ? "bark" : undefined);
  const leaves = leafWriter.build();
  const textured = style.foliage === "leaves";
  const bounds = unionBounds(bark, leaves);
  return {
    structureHash: input.structureHash ?? hashPlantStructure(structure),
    speciesId: structure.speciesId,
    ageYears: structure.ageYears,
    lod,
    stats: structure.stats,
    bark,
    leaves,
    leafUvs: textured ? leafWriter.builtUvs() : new Float32Array(0),
    look: { shading: style.shading, ramp: normalizeToonRamp(style.ramp), barkGrain: style.barkGrain, leafAtlas: textured ? { ...structure.leafShape } : null },
    triangles: bark.triangles + leaves.triangles,
    bounds,
  };
}
