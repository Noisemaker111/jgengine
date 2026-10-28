// @skill jgengine-world
import type { LeafShapeParams } from "../species/plantSpecies";

/** Cells of a {@link PlantLeafAtlas}, left to right: one leaf, a leafy shoot, a crown cluster. */
export const PLANT_LEAF_ATLAS_CELLS = { leaf: 0, shoot: 1, cluster: 2 } as const;

/** Cell count across a {@link PlantLeafAtlas}. */
export const PLANT_LEAF_ATLAS_CELL_COUNT = 3;

/**
 * A leaf texture baked from a species' leaf shape: RGBA texels, rows bottom to top, cells side by
 * side. Colour is brightness only (veins and per-leaf variation) so vertex colour keeps the season,
 * health and style tint; alpha is the leaf silhouette.
 */
export interface PlantLeafAtlas {
  width: number;
  height: number;
  data: Uint8Array;
}

const TWO_PI = Math.PI * 2;

/** 0..1 from two integers, the same on every engine. */
function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/**
 * Brightness of a leaf at local (u across, v along: 0 base .. 1 tip) for its outline, or -1 outside.
 * The petiole runs below v = 0.
 */
function leafShade(shape: LeafShapeParams, u: number, v: number): number {
  const petiole = Math.max(0.02, shape.petioleFraction * 0.5);
  if (v < 0) return v > -petiole && Math.abs(u) < 0.018 ? 0.55 : -1;
  if (v > 1) return -1;
  const vein = Math.abs(u) < 0.012 ? 0.82 : 1;
  switch (shape.kind) {
    case "needle":
    case "blade": {
      const half = Math.max(0.03, shape.aspect * 0.5) * (1 - v * v) * (v < 0.08 ? v / 0.08 : 1);
      return Math.abs(u) <= Math.max(0.02, half) ? vein : -1;
    }
    case "scale": {
      const dv = (v - 0.5) / 0.5;
      const du = u / Math.max(0.15, shape.aspect * 0.5);
      return du * du + dv * dv <= 1 ? 0.95 : -1;
    }
    case "frond": {
      if (Math.abs(u) < 0.02) return 0.7;
      const envelope = 0.5 * Math.sin(Math.PI * Math.min(1, v * 1.05));
      const pinna = Math.abs(Math.sin(v * Math.PI * 9));
      return Math.abs(u) <= envelope * (0.35 + 0.65 * pinna) ? 0.95 : -1;
    }
    case "lobed": {
      if (shape.lobes > 5) {
        // Pinnately lobed (oak): an obovate outline cut by sinuses along the midrib.
        const envelope = 0.5 * Math.max(0.25, shape.aspect) * Math.sin(Math.PI * Math.min(1, v ** 0.8));
        const lobe = Math.abs(Math.sin((v * shape.lobes * Math.PI) / 2));
        return Math.abs(u) <= envelope * (1 - shape.lobeDepth * (1 - lobe)) ? vein : -1;
      }
      // Palmately lobed (maple): pointed, toothed lobes fan from the petiole tip, the middle one longest.
      const cy = 0.36;
      const r = Math.sqrt(u * u + (v - cy) * (v - cy));
      const angle = Math.atan2(u, v - cy);
      const spread = Math.PI * 0.78;
      const stalk = Math.abs(u) < 0.018 && v < cy ? 0.55 : -1;
      if (Math.abs(angle) > spread) return r < 0.07 ? 0.9 : stalk;
      const lobes = Math.max(1, shape.lobes);
      const t = ((angle + spread) / (2 * spread)) * lobes;
      const offCentre = Math.abs(t - Math.floor(t) - 0.5) * 2;
      const teeth = 1 - 0.05 * Math.abs(Math.sin(angle * 34));
      const reach = 0.62 * (1 - 0.38 * (Math.abs(angle) / spread)) * (1 - shape.lobeDepth * offCentre) * teeth;
      if (r > reach) return stalk;
      return offCentre < 0.05 && r > 0.03 ? 0.84 : 1;
    }
    case "ovate":
    case "lanceolate": {
      const point = shape.kind === "lanceolate" ? 1.4 : 0.7;
      const envelope = 0.5 * Math.max(0.15, Math.min(1, shape.aspect)) * Math.sin(Math.PI * Math.min(1, v ** point)) ** 0.8;
      return Math.abs(u) <= envelope ? vein : -1;
    }
  }
}

interface Stamp {
  /** Base of the leaf, cell 0..1. */
  x: number;
  y: number;
  /** Direction base → tip, radians from +y. */
  angle: number;
  /** Length, cell units. */
  length: number;
  brightness: number;
  /** Fascicle: needles in one bundle (1 for a broad leaf). */
  bundle: number;
}

function stampsFor(cell: number, shape: LeafShapeParams): Stamp[] {
  const needles = shape.kind === "needle";
  const bundle = needles ? 5 : 1;
  const stamps: Stamp[] = [];
  if (cell === PLANT_LEAF_ATLAS_CELLS.leaf) {
    stamps.push({ x: 0.5, y: needles ? 0.08 : 0.1, angle: 0, length: needles ? 0.86 : 0.8, brightness: 1, bundle });
    return stamps;
  }
  if (cell === PLANT_LEAF_ATLAS_CELLS.shoot) {
    // A shoot rising up the cell with leaves to alternate sides, smaller towards the tip.
    const count = needles ? 14 : 7;
    for (let k = 0; k < count; k += 1) {
      const t = (k + 0.5) / count;
      const side = k % 2 === 0 ? 1 : -1;
      const along = 0.08 + 0.78 * t;
      stamps.push({
        x: 0.5 + side * 0.02,
        y: along,
        angle: side * (needles ? 0.5 : 0.75) * (1 - 0.4 * t) + (hash01(cell, k) - 0.5) * 0.3,
        length: (needles ? 0.32 : 0.36) * (1 - 0.35 * t),
        brightness: 0.85 + 0.15 * hash01(k, 7),
        bundle,
      });
    }
    stamps.push({ x: 0.5, y: 0.88, angle: 0, length: needles ? 0.12 : 0.18, brightness: 1, bundle });
    return stamps;
  }
  // A crown cluster: leaves spread evenly over a disc, pointing outwards, outer ones lit, inner ones in shade.
  const count = needles ? 40 : 38;
  for (let k = 0; k < count; k += 1) {
    const a = hash01(k, 11) * TWO_PI;
    const d = Math.sqrt(hash01(k, 13)) * 0.24;
    const angle = a + (hash01(k, 17) - 0.5) * 1.4;
    const length = (needles ? 0.19 : 0.17) * (0.8 + 0.4 * hash01(k, 19));
    // Each leaf is centred on its spot, so the middle of the disc is covered too.
    const x = 0.5 + Math.sin(a) * d - Math.sin(angle) * length * 0.5;
    const y = 0.5 + Math.cos(a) * d - Math.cos(angle) * length * 0.5;
    stamps.push({
      x,
      y,
      angle,
      length,
      brightness: 0.55 + 0.4 * (d / 0.24) * (0.6 + 0.4 * Math.min(1, Math.max(0, (y - 0.21) / 0.52))) + 0.2 * (hash01(k, 23) - 0.3),
      bundle,
    });
  }
  return stamps;
}

const SUPERSAMPLE = 2;
/** Darkening under the edge of a leaf lying over others. */
const CONTACT_SHADOW = 0.45;
/** How far below a leaf its contact shadow falls, cell units. */
const CONTACT_OFFSET = 0.016;
/** Mean brightness of the leaves in every cell. */
const CELL_MEAN_BRIGHTNESS = 0.82;

/** Rasterise one leaf (or needle) of a stamp into its cell, handing each covered texel to `write`. */
function stampLeaf(
  shape: LeafShapeParams,
  stamp: Stamp,
  angle: number,
  cell: number,
  cellPx: number,
  width: number,
  write: (at: number, cover: number, lum: number) => void,
  drop: number,
): void {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const ox = stamp.x + drop * 0.6;
  const oy = stamp.y - drop;
  const reach = stamp.length * 1.1;
  const minX = Math.max(0, Math.floor((ox - reach) * cellPx));
  const maxX = Math.min(cellPx - 1, Math.ceil((ox + reach) * cellPx));
  const minY = Math.max(0, Math.floor((oy - reach) * cellPx));
  const maxY = Math.min(cellPx - 1, Math.ceil((oy + reach) * cellPx));
  const samples = SUPERSAMPLE * SUPERSAMPLE;
  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      let hits = 0;
      let lum = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const x = (px + (sx + 0.5) / SUPERSAMPLE) / cellPx - ox;
          const y = (py + (sy + 0.5) / SUPERSAMPLE) / cellPx - oy;
          // Into the leaf's own frame: v along base → tip, u across, both over its length.
          const v = (x * sa + y * ca) / stamp.length;
          const u = (x * ca - y * sa) / stamp.length;
          const value = leafShade(shape, u, v);
          if (value < 0) continue;
          hits += 1;
          lum += value * (0.8 + 0.25 * Math.min(1, Math.max(0, v)));
        }
      }
      if (hits > 0) write(py * width + cell * cellPx + px, hits / samples, lum / hits);
    }
  }
}

/**
 * Bake the leaf atlas of a leaf shape: `cellPx` texels per cell side, three cells across. Pure and
 * deterministic, so the same shape always bakes the same texels.
 * @capability plant-mesh turn a grown plant into a styled mesh at four detail levels within fixed triangle budgets
 */
export function bakePlantLeafAtlas(shape: LeafShapeParams, cellPx = 128): PlantLeafAtlas {
  const width = cellPx * PLANT_LEAF_ATLAS_CELL_COUNT;
  const height = cellPx;
  const coverage = new Float32Array(width * height);
  const shade = new Float32Array(width * height);
  for (let cell = 0; cell < PLANT_LEAF_ATLAS_CELL_COUNT; cell += 1) {
    const stamps = stampsFor(cell, shape);
    for (let s = 0; s < stamps.length; s += 1) {
      const stamp = stamps[s];
      if (stamp === undefined) continue;
      for (let b = 0; b < stamp.bundle; b += 1) {
        const angle = stamp.angle + (stamp.bundle > 1 ? (b - (stamp.bundle - 1) / 2) * 0.16 : 0);
        // A leaf over others shades them just below it, so overlapping leaves read apart.
        if (cell !== PLANT_LEAF_ATLAS_CELLS.leaf) {
          stampLeaf(shape, stamp, angle, cell, cellPx, width, (at, cover) => {
            shade[at] = (shade[at] ?? 0) * (1 - CONTACT_SHADOW * cover);
          }, CONTACT_OFFSET);
        }
        stampLeaf(shape, stamp, angle, cell, cellPx, width, (at, cover, lum) => {
          // Later stamps lie on top ("over" with premultiplied shade).
          const before = coverage[at] ?? 0;
          shade[at] = (shade[at] ?? 0) * (1 - cover) + lum * stamp.brightness * cover;
          coverage[at] = cover + before * (1 - cover);
        }, 0);
      }
    }
  }
  // Every cell averages the same brightness, so a crown keeps its tone as it changes detail level.
  const gain = new Float64Array(PLANT_LEAF_ATLAS_CELL_COUNT);
  for (let cell = 0; cell < PLANT_LEAF_ATLAS_CELL_COUNT; cell += 1) {
    let covered = 0;
    let lit = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = cell * cellPx; x < (cell + 1) * cellPx; x += 1) {
        covered += coverage[y * width + x] ?? 0;
        lit += shade[y * width + x] ?? 0;
      }
    }
    gain[cell] = lit > 0 ? (CELL_MEAN_BRIGHTNESS * covered) / lit : 1;
  }
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const cover = coverage[i] ?? 0;
    // Uncovered texels keep a mid brightness so mipmaps never bleed black into the silhouette.
    const lum = cover > 0 ? ((shade[i] ?? 0) / cover) * (gain[Math.floor((i % width) / cellPx)] ?? 1) : CELL_MEAN_BRIGHTNESS;
    const value = Math.max(0, Math.min(255, Math.round(lum * 255)));
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = Math.round(Math.min(1, cover) * 255);
  }
  return { width, height, data };
}

/**
 * A key that is equal for two leaf shapes exactly when they bake the same atlas.
 * @capability plant-mesh turn a grown plant into a styled mesh at four detail levels within fixed triangle budgets
 */
export function plantLeafAtlasKey(shape: LeafShapeParams): string {
  return `${shape.kind}/${shape.lobes}/${shape.lobeDepth}/${shape.aspect}/${shape.petioleFraction}`;
}

const bakedAtlases = new Map<string, PlantLeafAtlas>();

/**
 * The leaf atlas of a shape at the default size, baked once per shape and kept; an atlas a worker
 * baked ({@link keepPlantLeafAtlas}) is used as is.
 * @capability plant-mesh turn a grown plant into a styled mesh at four detail levels within fixed triangle budgets
 */
export function plantLeafAtlas(shape: LeafShapeParams): PlantLeafAtlas {
  const key = plantLeafAtlasKey(shape);
  const known = bakedAtlases.get(key);
  if (known !== undefined) return known;
  const atlas = bakePlantLeafAtlas(shape);
  bakedAtlases.set(key, atlas);
  return atlas;
}

/** True once a shape's atlas is baked or kept here. */
export function hasPlantLeafAtlas(shape: LeafShapeParams): boolean {
  return bakedAtlases.has(plantLeafAtlasKey(shape));
}

/** Keep an atlas baked elsewhere (a worker) so {@link plantLeafAtlas} does not bake it again. */
export function keepPlantLeafAtlas(shape: LeafShapeParams, atlas: PlantLeafAtlas): void {
  bakedAtlases.set(plantLeafAtlasKey(shape), atlas);
}
