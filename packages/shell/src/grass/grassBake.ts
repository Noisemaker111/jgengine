import * as THREE from "three";

import { grassBladeDensity, type GrassLook } from "@jgengine/core/world/grassKind";

import { createSeededRandom, hashNoise2, seedToUint32, type TerrainSeed } from "../terrain/random";
import { resolveTerrainSize, type TerrainArea, type TerrainHeightSampler } from "../terrain/terrainMath";

/** Side of one base grass cell in metres: the unit of seeded tuft generation. Coarser stream nodes cover power-of-two blocks of cells. */
export const GRASS_CELL_SIZE = 8;

/** A rectangle (patch-local XZ) the grass keeps clear — soil patches, water, plazas. */
export interface GrassExclusion {
  /** Rect center in patch-local coordinates. */
  center: readonly [x: number, z: number];
  /** Rect half extents. */
  half: readonly [x: number, z: number];
  /** Ramp width (m) outside the rect over which blades regrow to full height. Default 1.5. */
  feather?: number;
}

/** Inputs for {@link resolveGrassBake}: one patch's look, footprint and ground samplers. */
export interface GrassBakeOptions {
  look: GrassLook;
  /** Footprint size in metres, centred on the patch origin. */
  area: TerrainArea;
  /** Seed used when `look.seed` is empty. */
  seed?: TerrainSeed;
  /** Blade segments at full detail. Default 4. */
  segments?: number;
  /** Metres of soft fringe at the patch border. Default scales with the patch, 1.5–4 m. */
  edgeFeather?: number;
  exclude?: readonly GrassExclusion[];
  /** Patch-local ground height. */
  heightAt?: TerrainHeightSampler;
  /** Patch-local coverage, 0..1, composed with `exclude`. */
  coverageAt?: TerrainHeightSampler;
}

/** A patch ready to bake: the look plus every derived number the bake and stream share. */
export interface ResolvedGrassBake {
  look: GrassLook;
  width: number;
  depth: number;
  seed: string;
  segments: number;
  edgeFeather: number;
  exclude: readonly GrassExclusion[];
  heightAt: TerrainHeightSampler;
  coverageAt: TerrainHeightSampler;
  /** Blades per m² at full detail. */
  bladesPerM2: number;
  /** Tuft roots per m² at full detail. */
  tuftsPerM2: number;
  /** Base cells per axis and the quadtree root level covering them. */
  columns: number;
  rows: number;
  rootLevel: number;
  /** Tallest blade any tuft can grow, metres. */
  maxHeight: number;
}

/** Resolve a patch's bake inputs once; the stream and every node bake read the result. */
export function resolveGrassBake(options: GrassBakeOptions): ResolvedGrassBake {
  const size = resolveTerrainSize(options.area);
  const look = options.look;
  const columns = Math.max(1, Math.ceil(size.width / GRASS_CELL_SIZE));
  const rows = Math.max(1, Math.ceil(size.depth / GRASS_CELL_SIZE));
  const bladesPerM2 = grassBladeDensity(look);
  const seed = look.seed.length > 0 ? look.seed : String(options.seed ?? "grass");
  const tallest = Math.max(1, look.mixShare > 0 ? look.mixHeight : 1);
  return {
    look,
    width: size.width,
    depth: size.depth,
    seed,
    segments: Math.max(1, Math.floor(options.segments ?? 4)),
    edgeFeather: Math.max(0, options.edgeFeather ?? Math.min(4, Math.max(1.5, Math.min(size.width, size.depth) * 0.12))),
    exclude: options.exclude ?? [],
    heightAt: options.heightAt ?? (() => 0),
    coverageAt: options.coverageAt ?? (() => 1),
    bladesPerM2,
    tuftsPerM2: bladesPerM2 / look.tuftBlades,
    columns,
    rows,
    rootLevel: Math.ceil(Math.log2(Math.max(columns, rows))),
    maxHeight: look.bladeHeight * tallest * 1.15 + look.flowerSize,
  };
}

/** One draw-detail level of the tuft template: an index range drawing every blade at `segments`. */
export interface GrassTemplateLod {
  segments: number;
  start: number;
  count: number;
}

/**
 * The shared tuft mesh every instance places: `tuftBlades` blades splayed around a root, each a
 * strip of `segments` rows, plus one flower quad that only flowering tufts open. The index buffer
 * holds the strips at full, half and single-segment detail back to back, so a far draw picks a
 * cheaper range of the same vertices.
 */
export interface GrassTuftTemplate {
  position: Float32Array;
  uv: Float32Array;
  bladeOffset: Float32Array;
  bladeVary: Float32Array;
  bladeBendScale: Float32Array;
  index: Uint16Array;
  lods: readonly GrassTemplateLod[];
  /** Largest per-blade height and width scale and splay radius, for conservative bounds. */
  heightScale: number;
  widthScale: number;
  radius: number;
}

/** Build the shared tuft template for a resolved patch. */
export function createGrassTuftTemplate(bake: ResolvedGrassBake): GrassTuftTemplate {
  const { segments, look } = bake;
  const blades = look.tuftBlades;
  const random = createSeededRandom(`${bake.seed}/tuft`);
  const position: number[] = [];
  const uv: number[] = [];
  const bladeOffset: number[] = [];
  const bladeVary: number[] = [];
  const bladeBendScale: number[] = [];
  let heightScale = 0, widthScale = 0, radius = 0;
  for (let blade = 0; blade < blades; blade += 1) {
    const angle = blade === 0 ? 0 : ((blade - 1) / Math.max(1, blades - 1)) * Math.PI * 2 + random() * 1.4;
    const reach = blade === 0 ? 0 : look.tuftSpread * (0.35 + 0.65 * random());
    const ox = Math.cos(angle) * reach;
    const oz = Math.sin(angle) * reach;
    // Each blade bends away from the tuft centre (plus jitter), so the clump splays open.
    const yaw = angle + Math.PI / 2 + (random() - 0.5) * 1.6;
    const h = blade === 0 ? 1 : 0.7 + random() * 0.45;
    const w = 0.8 + random() * 0.4;
    const phase = random();
    const bend = 0.7 + random() * 0.7;
    heightScale = Math.max(heightScale, h);
    widthScale = Math.max(widthScale, w);
    radius = Math.max(radius, reach);
    for (let row = 0; row <= segments; row += 1) {
      const t = row / segments;
      for (const side of [-0.5, 0.5]) {
        position.push(side, t, 0);
        uv.push(side + 0.5, t);
        bladeOffset.push(ox, oz);
        bladeVary.push(yaw, h, w, phase);
        bladeBendScale.push(bend);
      }
    }
  }
  // Flower quad on the first blade's tip; uv.y above 1 marks its corners for the shader.
  const flowerBase = position.length / 3;
  for (const [cx, cy] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] as const) {
    position.push(cx, cy, 0);
    uv.push(cx + 0.5, cy + 2.5);
    bladeOffset.push(0, 0);
    bladeVary.push(Math.PI / 2, 1, 1, 0);
    bladeBendScale.push(1);
  }
  const levels = [...new Set([segments, Math.ceil(segments / 2), 1])].sort((a, b) => b - a);
  const index: number[] = [];
  const lods: GrassTemplateLod[] = [];
  const vertsPerBlade = (segments + 1) * 2;
  for (const level of levels) {
    const start = index.length;
    for (let blade = 0; blade < blades; blade += 1) {
      const base = blade * vertsPerBlade;
      for (let k = 0; k < level; k += 1) {
        const a = base + Math.round((k * segments) / level) * 2;
        const b = base + Math.round(((k + 1) * segments) / level) * 2;
        index.push(a, a + 1, b + 1, a, b + 1, b);
      }
    }
    if (look.flowerShare > 0) index.push(flowerBase, flowerBase + 1, flowerBase + 3, flowerBase, flowerBase + 3, flowerBase + 2);
    lods.push({ segments: level, start, count: index.length - start });
  }
  return {
    position: Float32Array.from(position),
    uv: Float32Array.from(uv),
    bladeOffset: Float32Array.from(bladeOffset),
    bladeVary: Float32Array.from(bladeVary),
    bladeBendScale: Float32Array.from(bladeBendScale),
    index: Uint16Array.from(index),
    lods,
    heightScale,
    widthScale,
    radius,
  };
}

/**
 * The tufts one stream node draws, sorted by rank. A tuft's rank is its place in its cell's seeded
 * order, so the first `n` tufts are an even thinning of the node: drawing fewer for a far camera
 * just shortens the instance count, and a finer node re-baked nearer the camera regrows the same
 * tufts in the same places.
 */
export interface GrassTufts {
  count: number;
  /** xyz root per tuft. */
  offsets: Float32Array;
  /** yaw, height, width, bend per tuft. */
  shape: Float32Array;
  /** phase, colour roll, kind (1 second species, +2 flower), rank per tuft. */
  vary: Float32Array;
  /** 0..1 large-scale field tone per tuft (season and dryness patches). */
  tone: Float32Array;
  /** Ascending ranks, mirroring `vary[i * 4 + 3]`. */
  ranks: Float32Array;
  /** Box around every tuft root, patch-local. */
  roots: THREE.Box3;
  /** Furthest a blade reaches from its root, metres. */
  extent: number;
}

/** Patch-local XZ rectangle a node covers, clipped to the patch: `[x0, z0, x1, z1]`. */
export function grassNodeRect(bake: ResolvedGrassBake, level: number, ix: number, iz: number): [number, number, number, number] {
  const span = GRASS_CELL_SIZE * 2 ** level;
  const x0 = -bake.width / 2 + ix * span;
  const z0 = -bake.depth / 2 + iz * span;
  return [x0, z0, Math.min(bake.width / 2, x0 + span), Math.min(bake.depth / 2, z0 + span)];
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Two-octave value noise in 0..1, deterministic per seed. */
function fieldNoise(x: number, z: number, seed: number): number {
  let total = 0;
  let weight = 0;
  for (let octave = 0, scale = 1, amp = 1; octave < 2; octave += 1, scale *= 2.3, amp *= 0.45) {
    const px = x * scale, pz = z * scale;
    const xi = Math.floor(px), zi = Math.floor(pz);
    const tx = smooth(px - xi), tz = smooth(pz - zi);
    const s = seed + octave * 977;
    const a = hashNoise2(xi, zi, s), b = hashNoise2(xi + 1, zi, s), c = hashNoise2(xi, zi + 1, s), d = hashNoise2(xi + 1, zi + 1, s);
    total += ((a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz) * amp;
    weight += amp;
  }
  return total / weight;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Tufts a cell keeps at `share`, given its full count and its rank offset `u`. */
function cellCount(full: number, u: number, share: number): number {
  if (full <= 0) return 0;
  return Math.max(0, Math.min(Math.ceil(full - u), Math.ceil(Math.min(1, share) * full - u)));
}

/**
 * Seeded tufts for one stream node at `share` of full detail (0..1]. Each base cell inside the node
 * grows its own seeded sequence, so the result never depends on which node asked or how big it is.
 */
export function bakeGrassNode(bake: ResolvedGrassBake, level: number, ix: number, iz: number, share: number): GrassTufts {
  const { look } = bake;
  const span = 2 ** level;
  const cx0 = ix * span, cz0 = iz * span;
  const cx1 = Math.min(bake.columns, cx0 + span), cz1 = Math.min(bake.rows, cz0 + span);
  const halfW = bake.width / 2, halfD = bake.depth / 2;
  type Cell = { cx: number; cz: number; x0: number; z0: number; w: number; d: number; full: number };
  const cells: Cell[] = [];
  let total = 0;
  for (let cz = cz0; cz < cz1; cz += 1) {
    for (let cx = cx0; cx < cx1; cx += 1) {
      const x0 = -halfW + cx * GRASS_CELL_SIZE, z0 = -halfD + cz * GRASS_CELL_SIZE;
      const w = Math.min(halfW, x0 + GRASS_CELL_SIZE) - x0, d = Math.min(halfD, z0 + GRASS_CELL_SIZE) - z0;
      const full = bake.tuftsPerM2 * Math.max(0, w) * Math.max(0, d);
      const u = createSeededRandom(`${bake.seed}|${cx}|${cz}`)();
      total += cellCount(full, u, share);
      cells.push({ cx, cz, x0, z0, w, d, full });
    }
  }
  const offsets = new Float32Array(total * 3);
  const shape = new Float32Array(total * 4);
  const vary = new Float32Array(total * 4);
  const tone = new Float32Array(total);
  const roots = new THREE.Box3();
  const seedNumber = seedToUint32(bake.seed);
  const clumpSeed = seedNumber + 104729;
  const cs2 = look.clumpSize * 2;
  const point = new THREE.Vector3();
  const flutterStiff = 1 - look.stiffness;
  let maxReach = 0;
  let n = 0;
  for (const cell of cells) {
    const random = createSeededRandom(`${bake.seed}|${cell.cx}|${cell.cz}`);
    const u = random();
    const count = cellCount(cell.full, u, share);
    for (let j = 0; j < count; j += 1) {
      let x = cell.x0 + random() * cell.w;
      let z = cell.z0 + random() * cell.d;
      const clumpRoll = random(), clumpAngle = random() * Math.PI * 2, clumpReach = Math.sqrt(random()) * look.clumpSize;
      const speciesRoll = random(), flowerRoll = random(), yaw = random() * Math.PI * 2;
      const heightRoll = random(), widthRoll = random(), bendRoll = random(), gate = random(), settle = random();
      const phase = random() * Math.PI * 2, colorRoll = random();
      if (clumpRoll < look.clumping * 0.6) {
        const column = Math.floor((x + halfW) / cs2), row = Math.floor((z + halfD) / cs2);
        const ccx = (column + 0.5 + (hashNoise2(column, row, clumpSeed) - 0.5) * 0.8) * cs2 - halfW;
        const ccz = (row + 0.5 + (hashNoise2(row, column, clumpSeed) - 0.5) * 0.8) * cs2 - halfD;
        x = Math.max(-halfW, Math.min(halfW, ccx + Math.cos(clumpAngle) * clumpReach));
        z = Math.max(-halfD, Math.min(halfD, ccz + Math.sin(clumpAngle) * clumpReach));
      }
      const species = speciesRoll < look.mixShare ? 1 : 0;
      let height = look.bladeHeight * (1 - look.heightVariation * 0.6 * (1 - heightRoll)) * (species === 1 ? look.mixHeight : 1);
      if (look.clumping > 0) {
        // Clumped ground grows taller tussocks; the open ground between clumps stays shorter turf.
        const tussock = hashNoise2(Math.floor(x / look.clumpSize), Math.floor(z / look.clumpSize), clumpSeed);
        height *= 1 + look.clumping * (tussock - 0.5) * 0.6;
      }
      const nx = x / look.noiseScale, nz = z / look.noiseScale;
      // Mown patches drop to low turf and never flower; at patchiness 0 the mask never bites.
      const grown = smoothstep(look.patchiness * 0.85 - 0.1, look.patchiness * 0.85 + 0.04, fieldNoise(nx, nz, seedNumber + 31));
      height *= 0.55 + 0.45 * grown;
      const y = bake.heightAt(x, z);
      if (look.slopeThin > 0) {
        const slope = Math.hypot(bake.heightAt(x + 0.5, z) - bake.heightAt(x - 0.5, z), bake.heightAt(x, z + 0.5) - bake.heightAt(x, z - 0.5));
        height *= 1 - look.slopeThin * 0.75 * smoothstep(0.35, 1.3, slope);
      }
      if (bake.edgeFeather > 0) {
        // Tufts drop out across the feather band, so the border reads as grass growing sparser.
        const edge = Math.min(halfW - Math.abs(x), halfD - Math.abs(z));
        const inside = Math.min(1, Math.max(0, edge / bake.edgeFeather));
        height *= gate < inside * inside ? 0.7 + 0.3 * settle : 0;
      }
      for (const zone of bake.exclude) {
        const dist = Math.max(Math.abs(x - zone.center[0]) - zone.half[0], Math.abs(z - zone.center[1]) - zone.half[1]);
        height *= Math.min(1, Math.max(0, dist / Math.max(0.001, zone.feather ?? 1.5)));
      }
      height *= Math.max(0, Math.min(1, bake.coverageAt(x, z)));
      const width = look.bladeWidth * (1 - look.widthVariation * 0.6 * (1 - widthRoll)) * (species === 1 ? look.mixWidth : 1);
      const bend = look.curvature * (0.6 + 0.8 * bendRoll) * (1 + flutterStiff * 0.4);
      const flower = flowerRoll < look.flowerShare && grown > 0.5 ? 2 : 0;
      offsets[n * 3] = x;
      offsets[n * 3 + 1] = y;
      offsets[n * 3 + 2] = z;
      shape[n * 4] = yaw;
      shape[n * 4 + 1] = height;
      shape[n * 4 + 2] = width;
      shape[n * 4 + 3] = bend;
      vary[n * 4] = phase;
      vary[n * 4 + 1] = colorRoll;
      vary[n * 4 + 2] = species + flower;
      vary[n * 4 + 3] = cell.full > 0 ? (j + u) / cell.full : 1;
      tone[n] = fieldNoise(nx * 0.7 + 17.3, nz * 0.7 - 9.1, seedNumber + 53);
      roots.expandByPoint(point.set(x, y, z));
      maxReach = Math.max(maxReach, height * 1.15 + width * 2 + (flower > 0 ? look.flowerSize : 0));
      n += 1;
    }
  }
  return sortByRank({ count: total, offsets, shape, vary, tone, ranks: new Float32Array(total), roots, extent: maxReach + look.tuftSpread });
}

function sortByRank(tufts: GrassTufts): GrassTufts {
  const order = Array.from({ length: tufts.count }, (_, i) => i).sort((a, b) => tufts.vary[a * 4 + 3]! - tufts.vary[b * 4 + 3]!);
  const offsets = new Float32Array(tufts.offsets.length);
  const shape = new Float32Array(tufts.shape.length);
  const vary = new Float32Array(tufts.vary.length);
  const tone = new Float32Array(tufts.tone.length);
  order.forEach((from, to) => {
    offsets.set(tufts.offsets.subarray(from * 3, from * 3 + 3), to * 3);
    shape.set(tufts.shape.subarray(from * 4, from * 4 + 4), to * 4);
    vary.set(tufts.vary.subarray(from * 4, from * 4 + 4), to * 4);
    tone[to] = tufts.tone[from]!;
    tufts.ranks[to] = tufts.vary[from * 4 + 3]!;
  });
  return { ...tufts, offsets, shape, vary, tone };
}

/** Number of sorted tufts whose rank is below `share`. */
export function grassTuftsBelow(ranks: Float32Array, share: number): number {
  let lo = 0, hi = ranks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ranks[mid]! < share) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const STRAW = new THREE.Color("#c9b27a");
const GOLD = new THREE.Color("#c8a640");
const RUST = new THREE.Color("#a5552c");

/**
 * The look's colours after season and dryness, as the turf mat and far field show them. Mirrors the
 * blade shader's colour path at the field's average tone.
 */
export function grassFieldColors(look: GrassLook): { base: THREE.Color; tip: THREE.Color } {
  const shift = (hex: string, tipWeight: number) => {
    const color = new THREE.Color(hex);
    const lum = color.r * 0.3 + color.g * 0.55 + color.b * 0.15;
    if (look.season > 0) {
      const gold = GOLD.clone().multiplyScalar(lum * 1.6);
      const rust = RUST.clone().multiplyScalar(lum * 1.7);
      color.lerp(gold, Math.min(1, look.season * 2) * 0.75);
      if (look.season > 0.5) color.lerp(rust, (look.season - 0.5) * 2 * 0.8);
    }
    if (look.dryness > 0) color.lerp(STRAW.clone().multiplyScalar(0.6 + lum), look.dryness * (0.55 + 0.45 * tipWeight));
    return color;
  };
  const base = shift(look.baseColor, 0);
  // The mat is the shaded understory: it stops halfway to the tip colour, so pale-tipped blades
  // always stand out against it instead of vanishing into a mat of their own colour.
  return { base, tip: shift(look.tipColor, 1).lerp(base, 0.5) };
}
