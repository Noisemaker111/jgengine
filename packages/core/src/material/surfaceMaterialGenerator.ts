/**
 * Seeded PBR surface materials on the generator contract: sand, grass, soil, mud, rock, gravel, bark
 * and snow, each baked from bounded params and a seed into tileable albedo, height, normal,
 * roughness and AO maps. Every feature (noise lattices, cells, ripples, splatted stones and blades)
 * wraps at the tile edge, so the maps repeat with no seam. Looks (beach sand, meadow, forest soil,
 * granite, basalt, sandstone, oak and pine bark …) are schema presets. Baking is pure CPU work
 * bounded by the `resolution` param, done once at load; the draw side turns the maps into textures
 * and the terrain blends them by height, slope and shoreline.
 *
 * @capability surface-material-generator seeded tileable PBR ground and nature materials (sand, grass, soil, mud, rock, gravel, bark, snow)
 */
import { defineGenerator, generatorContext, generatorSeed, registerGenerator, type GeneratorContext } from "../generator/generator";
import { parseParams, type ParamsOf } from "../generator/paramSchema";
import { defineParamSchema } from "../generator/paramSchema";
import { hashString } from "../random/rng";
import { runToEnd, type SlicedJob } from "../run/slicedWork";
import { clamp01, lerp } from "../math/scalar";

/** The generator output family every surface material returns: {@link SurfaceMaterialMaps}. */
export const SURFACE_MATERIAL_OUTPUT = "surface-material";

/** The surface kinds the material generator draws. */
export const SURFACE_MATERIAL_KINDS = ["sand", "grass", "soil", "mud", "rock", "gravel", "bark", "snow"] as const;

/** One surface kind. */
export type SurfaceMaterialKind = (typeof SURFACE_MATERIAL_KINDS)[number];

/**
 * One baked surface material: square tileable maps, row-major, `size` texels a side, `v` down the
 * rows. Albedo is sRGB with height (0..1) in alpha; `surface` packs the tangent-space normal's x and
 * y (0.5 is flat; x tilts toward +u, y toward +v), roughness and ambient occlusion.
 */
export interface SurfaceMaterialMaps {
  kind: SurfaceMaterialKind;
  size: number;
  /** RGBA bytes: sRGB albedo, alpha the height map. */
  albedo: Uint8Array;
  /** RGBA bytes: normal x, normal y, roughness, AO. */
  surface: Uint8Array;
  /** Mean albedo in linear RGB, for tinting the map toward another colour without losing its grain. */
  meanLinear: readonly [number, number, number];
}

/**
 * True when a generator output is {@link SurfaceMaterialMaps}.
 * @capability surface-material-generator seeded tileable PBR ground and nature materials (sand, grass, soil, mud, rock, gravel, bark, snow)
 */
export function isSurfaceMaterialMaps(value: unknown): value is SurfaceMaterialMaps {
  return typeof value === "object" && value !== null && "albedo" in value && value.albedo instanceof Uint8Array && "surface" in value && value.surface instanceof Uint8Array;
}

/** The surface material param schema: kind, colours, feature scale, stones, cracks, cover and wear. */
export const SURFACE_MATERIAL_SCHEMA = defineParamSchema({
  groups: [
    { id: "surface", label: "Surface" },
    { id: "features", label: "Features" },
    { id: "colour", label: "Colour" },
    { id: "finish", label: "Finish" },
  ],
  fields: [
    { type: "seed", key: "seed", label: "seed", default: "" },
    {
      type: "select",
      key: "kind",
      label: "kind",
      group: "surface",
      vary: false,
      default: "sand",
      options: SURFACE_MATERIAL_KINDS.map((value) => ({ value })),
    },
    {
      type: "select",
      key: "resolution",
      label: "resolution",
      group: "surface",
      vary: false,
      default: "512",
      options: [{ value: "64" }, { value: "128" }, { value: "256" }, { value: "512" }, { value: "1024" }],
    },
    { type: "range", key: "scale", label: "feature scale", group: "features", min: 0.5, max: 3, step: 0.05, default: 1, explore: [0.75, 1.4] },
    { type: "range", key: "stones", label: "stones", group: "features", min: 0, max: 1, step: 0.01, default: 0.2 },
    { type: "range", key: "stoneSize", label: "stone size", group: "features", min: 0, max: 1, step: 0.01, default: 0.4 },
    { type: "range", key: "cracks", label: "cracks", group: "features", min: 0, max: 1, step: 0.01, default: 0.3 },
    { type: "range", key: "ripples", label: "ripples / furrows", group: "features", min: 0, max: 1, step: 0.01, default: 0.4 },
    { type: "range", key: "cover", label: "cover (blades, moss, lichen)", group: "features", min: 0, max: 1, step: 0.01, default: 0.3 },
    { type: "color", key: "color", label: "base", group: "colour", default: "#d9c79a", explore: { hue: 10, saturation: 0.2, lightness: 0.06 } },
    { type: "color", key: "color2", label: "secondary", group: "colour", default: "#a08a62", explore: { hue: 12, saturation: 0.2, lightness: 0.06 } },
    { type: "color", key: "coverColor", label: "cover", group: "colour", default: "#5d7a33", explore: { hue: 14, saturation: 0.2, lightness: 0.06 } },
    { type: "range", key: "colorVariance", label: "colour variation", group: "colour", min: 0, max: 0.5, step: 0.01, default: 0.18 },
    { type: "range", key: "roughness", label: "roughness", group: "finish", min: 0.2, max: 1, step: 0.01, default: 0.88 },
    { type: "range", key: "wetness", label: "wetness", group: "finish", min: 0, max: 1, step: 0.01, default: 0 },
    { type: "range", key: "relief", label: "relief", group: "finish", min: 0, max: 2, step: 0.01, default: 1, explore: [0.75, 1.3] },
  ],
  presets: [
    { id: "sand", label: "Sand", values: { kind: "sand", color: "#d6c49a", color2: "#9e8a66", coverColor: "#e9e2d0", stones: 0.12, stoneSize: 0.3, ripples: 0.45, cover: 0.15, cracks: 0, roughness: 0.9, relief: 0.9 } },
    { id: "beach-sand", label: "Beach sand", values: { kind: "sand", color: "#e6d7b2", color2: "#a8987a", coverColor: "#f2ece0", stones: 0.25, stoneSize: 0.35, ripples: 0.3, cover: 0.35, cracks: 0, roughness: 0.92, relief: 0.85 } },
    { id: "dune", label: "Dune sand", values: { kind: "sand", color: "#d9a868", color2: "#a87444", coverColor: "#e8c48c", stones: 0, ripples: 0.9, cover: 0.05, roughness: 0.94, relief: 1.1 } },
    { id: "grass", label: "Grass", values: { kind: "grass", color: "#5a4632", color2: "#3e3024", coverColor: "#5f8a34", cover: 0.85, stones: 0.1, stoneSize: 0.3, cracks: 0.1, ripples: 0.2, roughness: 0.9, relief: 1 } },
    { id: "meadow", label: "Meadow", values: { kind: "grass", color: "#6a5236", color2: "#46362a", coverColor: "#7a9a3c", cover: 0.7, stones: 0.05, colorVariance: 0.3, roughness: 0.92, relief: 1.1 } },
    { id: "dry-grass", label: "Dry grass", values: { kind: "grass", color: "#8a6f4a", color2: "#5c4632", coverColor: "#b4a05a", cover: 0.6, stones: 0.15, colorVariance: 0.25, roughness: 0.95 } },
    { id: "soil", label: "Forest soil", values: { kind: "soil", color: "#5e4632", color2: "#3a2a1e", coverColor: "#7a5a2c", stones: 0.25, stoneSize: 0.35, cracks: 0.15, cover: 0.45, roughness: 0.92, relief: 1 } },
    { id: "dirt", label: "Dry dirt", values: { kind: "soil", color: "#8a6a4a", color2: "#5a4430", coverColor: "#9a8460", stones: 0.4, stoneSize: 0.4, cracks: 0.55, cover: 0.1, roughness: 0.95, relief: 1 } },
    { id: "mud", label: "Mud", values: { kind: "mud", color: "#806a52", color2: "#5e4c3a", coverColor: "#5a5a3a", wetness: 0.7, cracks: 0.1, stones: 0.1, ripples: 0.5, roughness: 0.75, relief: 0.9 } },
    { id: "cracked-mud", label: "Cracked mud", values: { kind: "mud", color: "#7a6448", color2: "#4a3a2a", wetness: 0.1, cracks: 0.9, stones: 0.05, ripples: 0.1, roughness: 0.9, relief: 1.2 } },
    { id: "rock", label: "Granite", values: { kind: "rock", color: "#8c8a84", color2: "#5e5c58", coverColor: "#a8a878", cracks: 0.5, ripples: 0.15, cover: 0.2, stones: 0.1, roughness: 0.82, relief: 1.2 } },
    { id: "cliff", label: "Cliff rock", values: { kind: "rock", color: "#7a756c", color2: "#4e4a44", coverColor: "#5c6e38", cracks: 0.7, ripples: 0.45, cover: 0.3, roughness: 0.86, relief: 1.4 } },
    { id: "basalt", label: "Basalt", values: { kind: "rock", color: "#3e3c3c", color2: "#2a2828", coverColor: "#6a6a4a", cracks: 0.8, ripples: 0.05, cover: 0.1, roughness: 0.78, relief: 1.3 } },
    { id: "sandstone", label: "Sandstone", values: { kind: "rock", color: "#c09a6a", color2: "#9a7048", coverColor: "#8a8a5a", cracks: 0.35, ripples: 0.8, cover: 0.05, roughness: 0.9, relief: 1.1 } },
    { id: "gravel", label: "Gravel", values: { kind: "gravel", color: "#8e8a82", color2: "#4a4038", coverColor: "#a89c88", stones: 0.8, stoneSize: 0.35, roughness: 0.85, relief: 1.2 } },
    { id: "pebbles", label: "River pebbles", values: { kind: "gravel", color: "#9a948a", color2: "#5a5048", coverColor: "#7a6e60", stones: 0.9, stoneSize: 0.7, roughness: 0.6, wetness: 0.2, relief: 1.3 } },
    { id: "bark", label: "Oak bark", values: { kind: "bark", color: "#6a5644", color2: "#30261e", coverColor: "#5a6e30", ripples: 0.75, cracks: 0.35, cover: 0.15, roughness: 0.9, relief: 1.4 } },
    { id: "pine-bark", label: "Pine bark", values: { kind: "bark", color: "#6e4a34", color2: "#2e1e16", coverColor: "#6a6a40", ripples: 0.45, cracks: 0.7, cover: 0.05, roughness: 0.88, relief: 1.5 } },
    { id: "palm-bark", label: "Palm bark", values: { kind: "bark", color: "#8a7458", color2: "#4a3c2c", coverColor: "#6a7040", ripples: 0.2, cracks: 0.15, cover: 0.05, scale: 0.7, roughness: 0.9, relief: 1.2 } },
    { id: "snow", label: "Snow", values: { kind: "snow", color: "#eef2f6", color2: "#b8c8dc", coverColor: "#6a6058", ripples: 0.4, cover: 0.05, stones: 0, roughness: 0.6, relief: 0.7 } },
  ],
});

/** Parsed surface material params. */
export type SurfaceMaterialParams = ParamsOf<typeof SURFACE_MATERIAL_SCHEMA>;

// ---------------------------------------------------------------------------------------------
// Tileable noise. Every lattice and cell grid wraps at an integer period over the unit tile.

function mod(value: number, period: number): number {
  const r = value % period;
  return r < 0 ? r + period : r;
}

function hash3(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Lattices and cell grids a bake reuses, keyed by period and seed. Hashing every lattice corner per
 * texel made a 512 map cost half a second; a table read is a fraction of that. Cleared per bake.
 */
const lattices = new Map<number, Float32Array>();
const cellGrids = new Map<number, Float32Array>();

function clearCaches(): void {
  lattices.clear();
  cellGrids.clear();
  slotKeys.fill(-1);
  slotTables.fill(undefined);
}

function latticeKey(pu: number, pv: number, seed: number): number {
  return pu + pv * 4096 + (seed & 0xffff) * 16777216;
}

// A direct-mapped front cache over the map: a bake reads a handful of lattices millions of times.
const SLOTS = 64;
const slotKeys = new Float64Array(SLOTS).fill(-1);
const slotTables: (Float32Array | undefined)[] = new Array<Float32Array | undefined>(SLOTS);

function lattice(pu: number, pv: number, seed: number): Float32Array {
  const key = latticeKey(pu, pv, seed);
  const slot = (pu * 31 + pv * 17 + seed) & (SLOTS - 1);
  const front = slotTables[slot];
  if (front !== undefined && slotKeys[slot] === key) return front;
  let table = lattices.get(key);
  if (table === undefined) {
    table = new Float32Array(pu * pv);
    for (let y = 0; y < pv; y += 1) for (let x = 0; x < pu; x += 1) table[y * pu + x] = hash3(x, y, seed);
    lattices.set(key, table);
  }
  slotKeys[slot] = key;
  slotTables[slot] = table;
  return table;
}

/** Value noise over the unit tile with `pu` x `pv` lattice cells, wrapping at the edge. 0..1. */
function vnoise(u: number, v: number, pu: number, pv: number, seed: number): number {
  const table = lattice(pu, pv, seed);
  const x = u * pu;
  const y = v * pv;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const x0 = mod(ix, pu);
  const y0 = mod(iy, pv) * pu;
  const x1 = x0 + 1 === pu ? 0 : x0 + 1;
  const y1 = y0 + pu === pu * pv ? 0 : y0 + pu;
  const a = table[y0 + x0] ?? 0;
  const b = table[y0 + x1] ?? 0;
  const c = table[y1 + x0] ?? 0;
  const d = table[y1 + x1] ?? 0;
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Fractal value noise; each octave doubles the period, so it still wraps. 0..1. */
function fbm(u: number, v: number, period: number, octaves: number, seed: number, anisotropy = 1): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let pu = Math.max(1, Math.round(period));
  let pv = Math.max(1, Math.round(period * anisotropy));
  for (let o = 0; o < octaves; o += 1) {
    sum += vnoise(u, v, pu, pv, seed + o * 1013) * amp;
    norm += amp;
    amp *= 0.5;
    pu *= 2;
    pv *= 2;
  }
  return sum / norm;
}

/** Ridged fractal noise: sharp crests where value noise crosses its middle. 0..1. */
function ridged(u: number, v: number, period: number, octaves: number, seed: number, anisotropy = 1): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let pu = Math.max(1, Math.round(period));
  let pv = Math.max(1, Math.round(period * anisotropy));
  for (let o = 0; o < octaves; o += 1) {
    const n = 1 - Math.abs(vnoise(u, v, pu, pv, seed + o * 7919) * 2 - 1);
    sum += n * n * amp;
    norm += amp;
    amp *= 0.5;
    pu *= 2;
    pv *= 2;
  }
  return sum / norm;
}

/** Nearest-cell result of {@link cells}: distances in cell units and the nearest cell's random id. */
interface CellHit {
  f1: number;
  f2: number;
  id: number;
}

const cellHit: CellHit = { f1: 0, f2: 0, id: 0 };

function cellGrid(cu: number, cv: number, seed: number, jitter: number): Float32Array {
  const key = latticeKey(cu, cv, seed) + jitter * 1e-3;
  const cached = cellGrids.get(key);
  if (cached !== undefined) return cached;
  const grid = new Float32Array(cu * cv * 3);
  for (let y = 0; y < cv; y += 1) {
    for (let x = 0; x < cu; x += 1) {
      const i = (y * cu + x) * 3;
      grid[i] = 0.5 + (hash3(x, y, seed) - 0.5) * jitter;
      grid[i + 1] = 0.5 + (hash3(x, y, seed + 31) - 0.5) * jitter;
      grid[i + 2] = hash3(x, y, seed + 97);
    }
  }
  cellGrids.set(key, grid);
  return grid;
}

/** Wrapping Worley cells, `cu` x `cv` over the tile. Reuses one result object. */
function cells(u: number, v: number, cu: number, cv: number, seed: number, jitter = 0.85): CellHit {
  const grid = cellGrid(cu, cv, seed, jitter);
  const x = u * cu;
  const y = v * cv;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let f1 = 9;
  let f2 = 9;
  let id = 0;
  for (let j = -1; j <= 1; j += 1) {
    const gy = mod(iy + j, cv) * cu;
    for (let i = -1; i <= 1; i += 1) {
      const g = (gy + mod(ix + i, cu)) * 3;
      const dx = ix + i + (grid[g] ?? 0) - x;
      const dy = iy + j + (grid[g + 1] ?? 0) - y;
      const d = dx * dx + dy * dy;
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = grid[g + 2] ?? 0;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  cellHit.f1 = Math.sqrt(f1);
  cellHit.f2 = Math.sqrt(f2);
  cellHit.id = id;
  return cellHit;
}

/**
 * Ragged crack lines: cell borders through a warped domain, varying in width and fading out in
 * places, so they read as fractures rather than paving joints. 0 away from a crack, 1 in it.
 */
function crackLines(u: number, v: number, count: number, seed: number, width: number): number {
  const wu = u + (fbm(u, v, 4, 3, seed + 1) - 0.5) * (0.9 / count);
  const wv = v + (fbm(u, v, 4, 3, seed + 2) - 0.5) * (0.9 / count);
  const c = cells(wu, wv, count, count, seed, 0.95);
  const w = width * (0.45 + fbm(u, v, 9, 2, seed + 3) * 1.1);
  const line = 1 - smoothstep(0, w, c.f2 - c.f1);
  const fade = smoothstep(0.32, 0.55, fbm(u, v, 3, 3, seed + 4));
  return line * fade;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  return smooth(clamp01((x - edge0) / (edge1 - edge0)));
}

type Rgb = [number, number, number];

function hexRgb(hex: string): Rgb {
  const text = hex.replace("#", "");
  const full = text.length === 3 ? text.split("").map((c) => c + c).join("") : text;
  const value = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(value)) return [0.5, 0.5, 0.5];
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

const SRGB_TO_LINEAR = Float32Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

// ---------------------------------------------------------------------------------------------
// The bake canvas: height, colour and roughness per texel, plus wrapped splats.

class SurfaceCanvas {
  readonly size: number;
  readonly height: Float32Array;
  readonly color: Float32Array;
  readonly rough: Float32Array;

  constructor(size: number) {
    this.size = size;
    this.height = new Float32Array(size * size);
    this.color = new Float32Array(size * size * 3);
    this.rough = new Float32Array(size * size);
  }

  set(index: number, h: number, r: number, g: number, b: number, rough: number): void {
    this.height[index] = h;
    this.color[index * 3] = r;
    this.color[index * 3 + 1] = g;
    this.color[index * 3 + 2] = b;
    this.rough[index] = rough;
  }

  /**
   * Visit every texel within `radius` (tile units) of a centre, wrapping across the edges; `visit`
   * gets the texel index and the offset from the centre in tile units.
   */
  stamp(cu: number, cv: number, radius: number, visit: (index: number, du: number, dv: number) => void): void {
    const size = this.size;
    const r = Math.max(1, Math.ceil(radius * size));
    const cx = cu * size;
    const cy = cv * size;
    const x0 = Math.floor(cx - r);
    const y0 = Math.floor(cy - r);
    for (let y = y0; y <= y0 + 2 * r + 1; y += 1) {
      const row = mod(y, size) * size;
      const dv = (y + 0.5 - cy) / size;
      for (let x = x0; x <= x0 + 2 * r + 1; x += 1) {
        visit(row + mod(x, size), (x + 0.5 - cx) / size, dv);
      }
    }
  }
}

interface BakeInputs {
  params: SurfaceMaterialParams;
  canvas: SurfaceCanvas;
  seed: number;
  random: () => number;
  base: Rgb;
  second: Rgb;
  cover: Rgb;
  /** Feature scale: more, smaller features as it rises. */
  s: number;
}

/** A bake step that yields between rows, so a sliced runner can hand the thread back. */
type BakeJob = Generator<void, void, void>;

/** Writes each texel from `shade(u, v, index)`, which fills the canvas at `index`. */
function* eachTexel(canvas: SurfaceCanvas, shade: (u: number, v: number, index: number) => void): BakeJob {
  const size = canvas.size;
  for (let y = 0; y < size; y += 1) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x += 1) shade((x + 0.5) / size, v, y * size + x);
    yield;
  }
}

/** Large soft colour drift so one tile never reads as one flat hue. */
function variance(u: number, v: number, seed: number, amount: number): number {
  return 1 + (fbm(u, v, 3, 3, seed + 404) - 0.5) * 2 * amount;
}

/**
 * Splat round stones (pebbles, gravel, shells): domed height, a colour per stone picked between
 * `palette` entries, smoother roughness. A stone only lands where it stands above what is there.
 */
function* splatStones(
  input: BakeInputs,
  count: number,
  radiusMin: number,
  radiusMax: number,
  palette: readonly Rgb[],
  lift: number,
  roughness: number,
  where?: (u: number, v: number) => boolean,
): BakeJob {
  const { canvas, random } = input;
  for (let n = 0; n < count; n += 1) {
    if ((n & 31) === 31) yield;
    const cu = random();
    const cv = random();
    const radius = lerp(radiusMin, radiusMax, random() ** 1.6);
    const stretch = lerp(0.6, 1.4, random());
    const angle = random() * Math.PI;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const pick = palette[Math.floor(random() * palette.length) % palette.length] ?? input.base;
    const shadeBy = lerp(0.7, 1.2, random());
    const tall = lift * lerp(0.6, 1.1, random());
    if (where !== undefined && !where(cu, cv)) continue;
    canvas.stamp(cu, cv, radius * Math.max(stretch, 1 / stretch), (index, du, dv) => {
      const a = (du * ca + dv * sa) / (radius * stretch);
      const b = (-du * sa + dv * ca) / (radius / stretch);
      const d2 = a * a + b * b;
      if (d2 >= 1) return;
      const dome = Math.sqrt(1 - d2);
      const h = (canvas.height[index] ?? 0) * 0.35 + tall * dome;
      if (h <= (canvas.height[index] ?? 0)) return;
      const rim = 0.82 + 0.18 * dome;
      canvas.set(index, h, pick[0] * shadeBy * rim, pick[1] * shadeBy * rim, pick[2] * shadeBy * rim, roughness);
    });
  }
}

/** Splat thin strokes (grass blades, twigs, pine needles) that rise toward their tip. */
function* splatStrokes(
  input: BakeInputs,
  count: number,
  length: number,
  width: number,
  color: (random: () => number) => Rgb,
  lift: number,
  roughness: number,
  accept: (u: number, v: number, random: () => number) => boolean,
): BakeJob {
  const { canvas, random } = input;
  const size = canvas.size;
  const halfWidth = Math.max(0.6, width * size) / size;
  for (let n = 0; n < count; n += 1) {
    if ((n & 31) === 31) yield;
    const cu = random();
    const cv = random();
    const len = length * lerp(0.5, 1.3, random());
    const angle = random() * Math.PI * 2;
    const tint = color(random);
    const base = lerp(0.2, 0.55, random());
    if (!accept(cu, cv, random)) continue;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    canvas.stamp(cu + dx * len * 0.5, cv + dy * len * 0.5, len * 0.5 + halfWidth, (index, du, dv) => {
      // Along the stroke from its root (0) to its tip (1), and across it.
      const along = (du * dx + dv * dy) / len + 0.5;
      if (along < 0 || along > 1) return;
      const across = Math.abs(-du * dy + dv * dx) / (halfWidth * (1.15 - along * 0.6));
      if (across >= 1) return;
      const h = lift * (base + (1 - base) * along) * (1 - across * across * 0.5);
      if (h <= (canvas.height[index] ?? 0)) return;
      const light = 0.62 + 0.5 * along;
      canvas.set(index, h, tint[0] * light, tint[1] * light, tint[2] * light, roughness);
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Per-kind recipes.

function* bakeSand(input: BakeInputs): BakeJob {
  const { params, canvas, seed, base, second, cover, s } = input;
  const rippleCount = Math.max(1, Math.round(7 * s));
  yield* eachTexel(canvas, (u, v, i) => {
    const warp = fbm(u, v, 3, 3, seed + 11);
    const ripple = 0.5 + 0.5 * Math.sin(2 * Math.PI * (v * rippleCount + u + warp * 1.6));
    const ripples = ripple * ripple * params.ripples;
    const soft = fbm(u, v, 6 * s, 4, seed + 3);
    const grain = vnoise(u, v, canvas.size >> 1, canvas.size >> 1, seed + 5);
    const speck = hash3(i, 7, seed);
    const h = soft * 0.45 + ripples * 0.4 + grain * 0.08;
    const tone = variance(u, v, seed, params.colorVariance) * (0.92 + grain * 0.12 + ripple * 0.06 * params.ripples);
    let r = base[0] * tone;
    let g = base[1] * tone;
    let b = base[2] * tone;
    // Dark mineral grains and bright quartz flecks.
    if (speck > 0.93) {
      const k = 0.6;
      r = lerp(r, second[0], k);
      g = lerp(g, second[1], k);
      b = lerp(b, second[2], k);
    } else if (speck < 0.03) {
      r = lerp(r, 1, 0.35);
      g = lerp(g, 1, 0.35);
      b = lerp(b, 1, 0.35);
    }
    canvas.set(i, h, r, g, b, params.roughness);
  });
  const pebbles = Math.round(params.stones * 260 * s * s);
  yield* splatStones(input, pebbles, 0.003, 0.004 + params.stoneSize * 0.012, [second, base, [second[0] * 0.7, second[1] * 0.7, second[2] * 0.7]], 0.85, params.roughness * 0.7);
  // Shell and coral bits.
  const shells = Math.round(params.cover * 120 * s * s);
  yield* splatStones(input, shells, 0.002, 0.006, [cover], 0.7, params.roughness * 0.55);
}

function* bakeSoilBase(input: BakeInputs, dampen: number): BakeJob {
  const { params, canvas, seed, base, second, s } = input;
  const clods = Math.max(2, Math.round(14 * s));
  const crackCells = Math.max(2, Math.round(5 * s));
  yield* eachTexel(canvas, (u, v, i) => {
    const c = cells(u, v, clods, clods, seed + 21);
    const clod = 1 - smoothstep(0, 0.75, c.f1);
    const clodId = c.id;
    const crackDepth = crackLines(u, v, crackCells, seed + 41, 0.07) * params.cracks;
    const soft = fbm(u, v, 5 * s, 5, seed + 7);
    const fine = vnoise(u, v, canvas.size >> 2, canvas.size >> 2, seed + 9);
    const h = (soft * 0.5 + clod * 0.35 * dampen + fine * 0.1) * (1 - crackDepth * 0.85);
    const mixK = smoothstep(0.35, 0.7, fbm(u, v, 4, 3, seed + 13)) * 0.7 + (1 - clod) * 0.3;
    const tone = variance(u, v, seed, params.colorVariance) * (0.85 + clodId * 0.15 + fine * 0.12) * (1 - crackDepth * 0.5);
    canvas.set(
      i,
      h,
      lerp(base[0], second[0], mixK) * tone,
      lerp(base[1], second[1], mixK) * tone,
      lerp(base[2], second[2], mixK) * tone,
      params.roughness + crackDepth * 0.05,
    );
  });
}

function* bakeSoil(input: BakeInputs): BakeJob {
  const { params, s, second, base, cover } = input;
  yield* bakeSoilBase(input, 1);
  const stones = Math.round(params.stones * 340 * s * s);
  yield* splatStones(input, stones, 0.003, 0.005 + params.stoneSize * 0.018, [[0.55, 0.52, 0.48], [0.42, 0.4, 0.37], base], 0.95, params.roughness * 0.8);
  // Leaf litter and twigs.
  const litter = Math.round(params.cover * 900 * s * s);
  yield* splatStrokes(
    input,
    litter,
    0.018 / s,
    0.0025,
    (random) => {
      const k = random();
      return [lerp(cover[0], second[0], k), lerp(cover[1], second[1], k), lerp(cover[2], second[2], k)];
    },
    0.9,
    params.roughness,
    () => true,
  );
}

function* bakeGrass(input: BakeInputs): BakeJob {
  const { params, canvas, seed, s, cover } = input;
  yield* bakeSoilBase(input, 0.6);
  const stones = Math.round(params.stones * 200 * s * s);
  yield* splatStones(input, stones, 0.003, 0.004 + params.stoneSize * 0.012, [[0.55, 0.52, 0.48], [0.45, 0.43, 0.4]], 0.7, params.roughness * 0.8);
  // Blades cluster into tufts; the soil shows through between them where cover is low.
  const tufts = (u: number, v: number): number => {
    const patch = fbm(u, v, 4, 3, seed + 61);
    const clump = 1 - smoothstep(0.1, 0.8, cells(u, v, Math.max(2, Math.round(18 * s)), Math.max(2, Math.round(18 * s)), seed + 63).f1);
    return clamp01((patch - (1 - params.cover) * 0.7) * 2.2) * (0.55 + 0.45 * clump);
  };
  const blades = Math.round(canvas.size * canvas.size * 0.11 * (0.25 + params.cover));
  const spreadBy = params.colorVariance;
  yield* splatStrokes(
    input,
    blades,
    0.022 / s,
    0.0024,
    (random) => {
      const dry = random() < 0.12 + spreadBy * 0.3 ? lerp(0.3, 0.7, random()) : 0;
      const shadeBy = lerp(1 - spreadBy, 1 + spreadBy * 0.6, random());
      return [
        lerp(cover[0], 0.62, dry) * shadeBy,
        lerp(cover[1], 0.55, dry) * shadeBy,
        lerp(cover[2], 0.3, dry) * shadeBy,
      ];
    },
    1.2,
    params.roughness,
    (u, v, random) => random() < tufts(u, v),
  );
}

function* bakeMud(input: BakeInputs): BakeJob {
  const { params, canvas, seed, base, second, cover, s } = input;
  const crackCells = Math.max(2, Math.round(7 * s));
  const rutCount = Math.max(1, Math.round(3 * s));
  yield* eachTexel(canvas, (u, v, i) => {
    const soft = fbm(u, v, 3 * s, 5, seed + 3);
    const rut = 0.5 + 0.5 * Math.sin(2 * Math.PI * (u * rutCount + fbm(u, v, 2, 3, seed + 5) * 1.2));
    const fine = vnoise(u, v, canvas.size >> 2, canvas.size >> 2, seed + 9);
    const crackLine = crackLines(u, v, crackCells, seed + 41, 0.06) * params.cracks;
    let h = soft * 0.7 + rut * 0.2 * params.ripples + fine * 0.05;
    // Puddles fill the hollows: flat, dark and glossy.
    const level = 0.32 + params.wetness * 0.18;
    const puddle = smoothstep(level, level - 0.06, h) * params.wetness;
    h = Math.max(h, lerp(h, level, puddle)) * (1 - crackLine * 0.8);
    const mixK = smoothstep(0.3, 0.75, fbm(u, v, 5, 3, seed + 13));
    const tone = variance(u, v, seed, params.colorVariance) * (0.9 + fine * 0.15) * (1 - puddle * 0.35) * (1 - crackLine * 0.4);
    const algae = smoothstep(0.65, 0.8, fbm(u, v, 6, 3, seed + 17)) * params.cover * 0.6;
    canvas.set(
      i,
      h,
      lerp(lerp(base[0], second[0], mixK), cover[0], algae) * tone,
      lerp(lerp(base[1], second[1], mixK), cover[1], algae) * tone,
      lerp(lerp(base[2], second[2], mixK), cover[2], algae) * tone,
      lerp(params.roughness, 0.08, puddle),
    );
  });
  const stones = Math.round(params.stones * 160 * s * s);
  yield* splatStones(input, stones, 0.003, 0.004 + params.stoneSize * 0.014, [[0.4, 0.36, 0.32], second], 0.85, 0.35);
}

function* bakeRock(input: BakeInputs): BakeJob {
  const { params, canvas, seed, base, second, cover, s } = input;
  const strata = Math.max(1, Math.round(9 * s));
  const big = Math.max(2, Math.round(3 * s));
  const small = Math.max(3, Math.round(11 * s));
  yield* eachTexel(canvas, (u, v, i) => {
    const body = ridged(u, v, 3 * s, 6, seed + 3);
    const warp = fbm(u, v, 3, 3, seed + 5);
    const band = 0.5 + 0.5 * Math.sin(2 * Math.PI * (v * strata + warp * 2.2));
    const layered = band * params.ripples;
    const lineA = crackLines(u, v, big, seed + 41, 0.05);
    const blockId = cellHit.id;
    const lineB = crackLines(u, v, small, seed + 43, 0.035);
    const crack = clamp01(lineA * params.cracks + lineB * params.cracks * 0.4);
    const fine = vnoise(u, v, canvas.size >> 1, canvas.size >> 1, seed + 9);
    const blockLift = (blockId - 0.5) * 0.12 * params.cracks;
    const pits = vnoise(u, v, canvas.size >> 3, canvas.size >> 3, seed + 15);
    const h = clamp01((body * 0.7 + layered * 0.22 + fine * 0.07 - pits * 0.06 + blockLift) * (1 - crack * 0.7));
    const mixK = clamp01(smoothstep(0.3, 0.75, fbm(u, v, 5, 4, seed + 13)) * 0.7 + band * params.ripples * 0.3);
    // Lichen spots on the faces, moss down in the cracks and hollows.
    const spots = cells(u, v, Math.max(4, Math.round(26 * s)), Math.max(4, Math.round(26 * s)), seed + 71);
    const lichen = (1 - smoothstep(0.2, 0.42, spots.f1)) * smoothstep(1 - params.cover, 1.05 - params.cover * 0.5, fbm(u, v, 4, 3, seed + 73));
    const moss = clamp01((crack * 0.8 + (1 - body) * 0.3) * params.cover * smoothstep(0.4, 0.6, fbm(u, v, 3, 3, seed + 75)));
    const growth = clamp01(lichen * 0.85 + moss);
    const tone = variance(u, v, seed, params.colorVariance) * (0.82 + fine * 0.2 + body * 0.12) * (1 - crack * 0.45);
    canvas.set(
      i,
      h,
      lerp(lerp(base[0], second[0], mixK) * tone, cover[0], growth),
      lerp(lerp(base[1], second[1], mixK) * tone, cover[1], growth),
      lerp(lerp(base[2], second[2], mixK) * tone, cover[2], growth),
      params.roughness + crack * 0.08 - fine * 0.08,
    );
  });
  const chips = Math.round(params.stones * 120 * s * s);
  yield* splatStones(input, chips, 0.003, 0.004 + params.stoneSize * 0.01, [second, base], 0.9, params.roughness);
}

function* bakeGravel(input: BakeInputs): BakeJob {
  const { params, canvas, seed, base, second, cover, s } = input;
  const count = Math.max(4, Math.round((40 - params.stoneSize * 26) * s));
  yield* eachTexel(canvas, (u, v, i) => {
    const c = cells(u, v, count, count, seed + 21, 0.95);
    // Round stones: distance from the cell's centre against its half-gap to the next one.
    const ratio = c.f1 / Math.max(1e-4, (c.f1 + c.f2) * 0.5);
    const filled = c.id < 0.4 + params.stones * 0.6;
    const radius = 0.78 + ((c.id * 5.17) % 1) * 0.2;
    const stone = filled ? Math.sqrt(Math.max(0, 1 - (ratio / radius) ** 2)) : 0;
    const fine = vnoise(u, v, canvas.size >> 1, canvas.size >> 1, seed + 9);
    const grit = fbm(u, v, 12 * s, 3, seed + 7);
    const h = stone > 0 ? 0.25 + stone * (0.55 + c.id * 0.3) + fine * 0.04 : grit * 0.22 + fine * 0.05;
    const pickK = (c.id * 7.31) % 1;
    const stoneColor: Rgb = pickK < 0.45 ? base : pickK < 0.8 ? cover : [base[0] * 0.7, base[1] * 0.7, base[2] * 0.72];
    const tone = stone > 0 ? (0.75 + ((c.id * 13.7) % 1) * 0.4) * (0.8 + 0.2 * stone) * (0.94 + fine * 0.12) : 0.7 + grit * 0.4;
    const color = stone > 0 ? stoneColor : second;
    const vary = variance(u, v, seed, params.colorVariance);
    canvas.set(
      i,
      h,
      color[0] * tone * vary,
      color[1] * tone * vary,
      color[2] * tone * vary,
      stone > 0 ? params.roughness * (0.82 + fine * 0.2) : Math.min(1, params.roughness + 0.08),
    );
  });
}

function* bakeBark(input: BakeInputs): BakeJob {
  const { params, canvas, seed, base, second, cover, s } = input;
  // v runs up the trunk: furrows are long along v and narrow across u.
  const furrowsU = Math.max(2, Math.round(12 * s));
  const platesU = Math.max(2, Math.round(6 * s));
  const platesV = Math.max(1, Math.round(3 * s));
  yield* eachTexel(canvas, (u, v, i) => {
    const warp = fbm(u, v, 3, 3, seed + 5);
    const furrow = ridged(u + warp * 0.04, v, furrowsU, 4, seed + 3, 0.25);
    const plate = cells(u + warp * 0.03, v, platesU, platesV, seed + 41, 0.8);
    const plateEdge = smoothstep(0, 0.18, plate.f2 - plate.f1);
    const fibre = vnoise(u, v, canvas.size >> 1, canvas.size >> 4, seed + 9);
    const plated = lerp(1, plateEdge, params.cracks);
    const h = clamp01((lerp(0.6, furrow, params.ripples) * 0.7 + fibre * 0.12 + (plate.id - 0.5) * 0.1 * params.cracks + 0.15) * lerp(1, plated, 0.85));
    const groove = 1 - smoothstep(0.15, 0.55, h);
    const mossMask = clamp01(smoothstep(1 - params.cover, 1.1 - params.cover * 0.6, fbm(u, v, 3, 3, seed + 73)) * (0.4 + groove * 0.6));
    const tone = variance(u, v, seed, params.colorVariance) * (0.86 + fibre * 0.18);
    canvas.set(
      i,
      h,
      lerp(lerp(base[0], second[0], groove) * tone, cover[0], mossMask),
      lerp(lerp(base[1], second[1], groove) * tone, cover[1], mossMask),
      lerp(lerp(base[2], second[2], groove) * tone, cover[2], mossMask),
      params.roughness + groove * 0.06,
    );
  });
}

function* bakeSnow(input: BakeInputs): BakeJob {
  const { params, canvas, seed, base, second, cover, s } = input;
  const waves = Math.max(1, Math.round(4 * s));
  yield* eachTexel(canvas, (u, v, i) => {
    const soft = fbm(u, v, 3 * s, 5, seed + 3);
    const drift = 0.5 + 0.5 * Math.sin(2 * Math.PI * (v * waves + u + fbm(u, v, 2, 3, seed + 5) * 1.4));
    const fine = vnoise(u, v, canvas.size >> 1, canvas.size >> 1, seed + 9);
    const h = soft * 0.65 + drift * drift * 0.25 * params.ripples + fine * 0.04;
    const bare = smoothstep(params.cover * 0.5 + 0.02, params.cover * 0.5 - 0.06, fbm(u, v, 4, 4, seed + 31)) * (params.cover > 0 ? 1 : 0);
    const hollow = 1 - smoothstep(0.25, 0.6, h);
    const sparkle = hash3(i, 3, seed) > 0.985 ? 1 : 0;
    const tone = variance(u, v, seed, params.colorVariance * 0.4) * (0.97 + fine * 0.05);
    canvas.set(
      i,
      lerp(h, h * 0.6, bare),
      lerp(lerp(base[0], second[0], hollow * 0.6) * tone, cover[0], bare),
      lerp(lerp(base[1], second[1], hollow * 0.6) * tone, cover[1], bare),
      lerp(lerp(base[2], second[2], hollow * 0.6) * tone, cover[2], bare),
      lerp(sparkle > 0 ? params.roughness * 0.35 : params.roughness, 0.95, bare),
    );
  });
}

const RECIPES: Record<SurfaceMaterialKind, (input: BakeInputs) => BakeJob> = {
  sand: bakeSand,
  grass: bakeGrass,
  soil: bakeSoil,
  mud: bakeMud,
  rock: bakeRock,
  gravel: bakeGravel,
  bark: bakeBark,
  snow: bakeSnow,
};

const KIND_SET: ReadonlySet<string> = new Set(SURFACE_MATERIAL_KINDS);

function isKind(value: string): value is SurfaceMaterialKind {
  return KIND_SET.has(value);
}

// ---------------------------------------------------------------------------------------------
// Encoding: height normalised into albedo alpha; normal, roughness and AO packed into `surface`.

/** Box blur with wrap, separable, in place on a scratch buffer. */
function* blurWrap(source: Float32Array, size: number, radius: number): Generator<void, Float32Array, void> {
  const tmp = new Float32Array(size * size);
  const out = new Float32Array(size * size);
  const span = radius * 2 + 1;
  for (let y = 0; y < size; y += 1) {
    const row = y * size;
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) sum += source[row + mod(k, size)] ?? 0;
    for (let x = 0; x < size; x += 1) {
      tmp[row + x] = sum / span;
      sum += (source[row + mod(x + radius + 1, size)] ?? 0) - (source[row + mod(x - radius, size)] ?? 0);
    }
    yield;
  }
  for (let x = 0; x < size; x += 1) {
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) sum += tmp[mod(k, size) * size + x] ?? 0;
    for (let y = 0; y < size; y += 1) {
      out[y * size + x] = sum / span;
      sum += (tmp[mod(y + radius + 1, size) * size + x] ?? 0) - (tmp[mod(y - radius, size) * size + x] ?? 0);
    }
    yield;
  }
  return out;
}

function toByte(value: number): number {
  return Math.round(clamp01(value) * 255);
}

function* encode(canvas: SurfaceCanvas, params: SurfaceMaterialParams, kind: SurfaceMaterialKind): Generator<void, SurfaceMaterialMaps, void> {
  const { size, height, color, rough } = canvas;
  const count = size * size;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < count; i += 1) {
    const h = height[i] ?? 0;
    if (h < min) min = h;
    if (h > max) max = h;
  }
  const range = max - min > 1e-6 ? max - min : 1;
  for (let i = 0; i < count; i += 1) height[i] = ((height[i] ?? 0) - min) / range;

  const near = yield* blurWrap(height, size, Math.max(1, Math.round(size / 96)));
  const far = yield* blurWrap(height, size, Math.max(2, Math.round(size / 20)));
  const albedo = new Uint8Array(count * 4);
  const surface = new Uint8Array(count * 4);
  // Normal slope per height unit across one texel, scaled so relief reads the same at any resolution.
  const slope = params.relief * 3.2 * (size / 256);
  const wet = params.wetness;
  const mean: [number, number, number] = [0, 0, 0];
  for (let y = 0; y < size; y += 1) {
    const up = mod(y - 1, size) * size;
    const down = mod(y + 1, size) * size;
    const row = y * size;
    for (let x = 0; x < size; x += 1) {
      const i = row + x;
      const h = height[i] ?? 0;
      const dhdu = ((height[row + mod(x + 1, size)] ?? 0) - (height[row + mod(x - 1, size)] ?? 0)) * 0.5;
      const dhdv = ((height[down + x] ?? 0) - (height[up + x] ?? 0)) * 0.5;
      const nx = -dhdu * slope;
      const ny = -dhdv * slope;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const cavity = Math.max(0, (near[i] ?? 0) - h) * 2.4 + Math.max(0, (far[i] ?? 0) - h) * 1.1;
      const ao = clamp01(1 - cavity * Math.min(1.4, params.relief + 0.3));
      // Water pools low first: wetness darkens and glosses the hollows before the crests.
      const wetHere = clamp01(wet * (1.4 - h));
      const darken = 1 - wetHere * 0.45;
      const r = clamp01((color[i * 3] ?? 0) * darken);
      const g = clamp01((color[i * 3 + 1] ?? 0) * darken);
      const b = clamp01((color[i * 3 + 2] ?? 0) * darken);
      const rb = toByte(r);
      const gb = toByte(g);
      const bb = toByte(b);
      albedo[i * 4] = rb;
      albedo[i * 4 + 1] = gb;
      albedo[i * 4 + 2] = bb;
      albedo[i * 4 + 3] = toByte(h);
      surface[i * 4] = toByte(nx * inv * 0.5 + 0.5);
      surface[i * 4 + 1] = toByte(ny * inv * 0.5 + 0.5);
      surface[i * 4 + 2] = toByte(lerp(rough[i] ?? params.roughness, 0.12, wetHere * 0.85));
      surface[i * 4 + 3] = toByte(0.25 + 0.75 * ao);
      mean[0] += SRGB_TO_LINEAR[rb] ?? 0;
      mean[1] += SRGB_TO_LINEAR[gb] ?? 0;
      mean[2] += SRGB_TO_LINEAR[bb] ?? 0;
    }
    yield;
  }
  return { kind, size, albedo, surface, meanLinear: [mean[0] / count, mean[1] / count, mean[2] / count] };
}

/** Texels a side for a `resolution` param value, clamped to the bounded set. */
function resolutionOf(value: string, detail: number): number {
  const parsed = Number.parseInt(value, 10);
  const size = parsed === 64 || parsed === 128 || parsed === 256 || parsed === 512 || parsed === 1024 ? parsed : 512;
  // A lower detail level bakes a smaller map: half per halving, never under 64.
  return Math.max(64, size >> Math.max(0, Math.round(Math.log2(1 / Math.max(detail, 1 / 16)))));
}

function* bakeJob(params: SurfaceMaterialParams, context: GeneratorContext): SlicedJob<SurfaceMaterialMaps> {
  const kind = isKind(params.kind) ? params.kind : "sand";
  const size = resolutionOf(params.resolution, context.detail);
  const canvas = new SurfaceCanvas(size);
  const input: BakeInputs = {
    params,
    canvas,
    seed: hashString(context.seed) | 0,
    random: context.random("splats"),
    base: hexRgb(params.color),
    second: hexRgb(params.color2),
    cover: hexRgb(params.coverColor),
    s: params.scale,
  };
  clearCaches();
  yield* RECIPES[kind](input);
  clearCaches();
  return yield* encode(canvas, params, kind);
}

function bake(params: SurfaceMaterialParams, context: GeneratorContext): SurfaceMaterialMaps {
  return runToEnd(bakeJob(params, context));
}

/**
 * The surface material generator: one schema for every kind, with presets for the common looks.
 * Bake one with {@link bakeSurfaceMaterial}, a variant grid with `generatorVariants`.
 * @capability surface-material-generator seeded tileable PBR ground and nature materials (sand, grass, soil, mud, rock, gravel, bark, snow)
 */
export const SURFACE_MATERIAL_GENERATOR = defineGenerator({
  id: "material.surface",
  label: "Surface material",
  output: SURFACE_MATERIAL_OUTPUT,
  schema: SURFACE_MATERIAL_SCHEMA,
  generate: bake,
});

/** A surface material by preset and overrides: `{ preset: "beach-sand", params: { stones: 0.4 } }`. */
export interface SurfaceMaterialSpec {
  /** A {@link SURFACE_MATERIAL_SCHEMA} preset id (`sand`, `grass`, `soil`, `rock`, `bark` …). */
  preset?: string;
  /** Param overrides on top of the preset (kind, colours, stones, cracks …). */
  params?: Readonly<Record<string, unknown>>;
  /** Seed; the same spec and seed always bake the same maps. Default the preset id. */
  seed?: string;
}

/**
 * The `meta` bag a {@link SurfaceMaterialSpec} resolves to: preset values, then overrides, then seed.
 * @capability surface-material-generator seeded tileable PBR ground and nature materials (sand, grass, soil, mud, rock, gravel, bark, snow)
 */
export function surfaceMaterialMeta(spec: SurfaceMaterialSpec): Record<string, unknown> {
  const preset = spec.preset === undefined ? undefined : SURFACE_MATERIAL_SCHEMA.presets?.find((entry) => entry.id === spec.preset);
  if (spec.preset !== undefined && preset === undefined) {
    const known = (SURFACE_MATERIAL_SCHEMA.presets ?? []).map((entry) => entry.id).join(", ");
    throw new Error(`Unknown surface material preset "${spec.preset}". Known presets: ${known}.`);
  }
  return { ...preset?.values, ...spec.params, seed: spec.seed ?? spec.params?.["seed"] ?? spec.preset ?? "surface" };
}

/**
 * Bake a surface material from a spec (or a raw `meta` bag). Pure and deterministic; cost grows with
 * the resolution squared, about 30–150 ms for a 512 map, so bake once at load and share the result.
 * @capability surface-material-generator seeded tileable PBR ground and nature materials (sand, grass, soil, mud, rock, gravel, bark, snow)
 */
export function bakeSurfaceMaterial(spec: SurfaceMaterialSpec, options: { detail?: number } = {}): SurfaceMaterialMaps {
  return runToEnd(bakeSurfaceMaterialJob(spec, options));
}

/**
 * {@link bakeSurfaceMaterial} as a sliced job that yields between rows, so `runSliced` can bake at
 * load without freezing the page. Same bytes as the direct bake.
 * @capability surface-material-generator seeded tileable PBR ground and nature materials (sand, grass, soil, mud, rock, gravel, bark, snow)
 */
export function bakeSurfaceMaterialJob(spec: SurfaceMaterialSpec, options: { detail?: number } = {}): SlicedJob<SurfaceMaterialMaps> {
  const meta = surfaceMaterialMeta(spec);
  const seed = generatorSeed(SURFACE_MATERIAL_SCHEMA, meta, "surface");
  return bakeJob(parseParams(SURFACE_MATERIAL_SCHEMA, meta), generatorContext(seed, options.detail ?? 1));
}

/** Register the surface material generator so the editor and agents can find it. @internal */
export function registerSurfaceMaterialGenerator(): void {
  registerGenerator(SURFACE_MATERIAL_GENERATOR);
}
