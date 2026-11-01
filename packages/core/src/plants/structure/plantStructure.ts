// @skill jgengine-world
import { hashWords } from "../../random/rng";
import type { GrowthState } from "../growth/growthState";
import { NODE_AXIS_START, NODE_DEAD, NODE_SCAR } from "../growth/growthState";
import type { GrowingSeason } from "../growth/phenology";
import { PLANT_PI, plantCos, plantSin } from "../growth/plantMath";
import type { BarkKind, LeafShapeParams, PlantSpecies, SeasonalColor } from "../species/plantSpecies";
import { FROND_STATS_SEGMENTS, frondCount, frondLengthShare, frondPose, frondSpine, isFrondShape, type FrondPose } from "./frondPose";

/** Region code per skeleton segment; a style picks material and detail by it. */
export const PLANT_REGION = { trunk: 0, branch: 1, twig: 2, deadwood: 3, scar: 4, rootFlare: 5 } as const;
/** Region code of a skeleton segment (a value of {@link PLANT_REGION}). */
export type PlantRegion = (typeof PLANT_REGION)[keyof typeof PLANT_REGION];

/** Reproductive organ kind per row of {@link PlantStructure.reproductive}. */
export const PLANT_ORGAN = { flower: 0, fruit: 1 } as const;

/** Cluster levels per leaf: own shoot axis, its order-2 limb, its order-1 limb. */
export const PLANT_CLUSTER_LEVELS = 3;
/** Height bins and azimuth sectors of {@link PlantStructure.crownHull}. */
export const CROWN_HULL_BINS = 16;
/** Compass sectors per height bin of the crown envelope. */
export const CROWN_HULL_SECTORS = 8;

const TWIG_RADIUS_M = 0.01;
const ROOT_FLARE_HEIGHT_M = 0.5;

/** One cluster level: centre (3 per row), radius, parent row in the next level, leaf rows inside. */
export interface PlantClusterLevel {
  center: Float32Array;
  radius: Float32Array;
  parent: Int32Array;
  leafCount: Uint32Array;
}

/**
 * A grown plant's structure: the growth output and the input of every style. Struct-of-arrays, one
 * row per skeleton segment, leaf cohort, cluster or reproductive organ. Positions are metres with y up
 * and the stem base at the origin.
 */
export interface PlantStructure {
  speciesId: string;
  ageYears: number;
  dayOfYear: number;
  seed: string;
  /** 0..1 vigour of the whole plant this year. */
  health: number;
  stats: { heightM: number; dbhCm: number; crownRadiusM: number; crownBaseM: number };
  /**
   * Crown envelope: [bottomY, topY] then CROWN_HULL_BINS × CROWN_HULL_SECTORS horizontal radii, bins
   * bottom to top, sectors counter-clockwise from +x.
   */
  crownHull: Float32Array;
  segments: {
    start: Float32Array;
    end: Float32Array;
    radiusStart: Float32Array;
    radiusEnd: Float32Array;
    parent: Int32Array;
    /** Branch order, 0 for the trunk. */
    order: Uint8Array;
    bornYear: Uint16Array;
    /** Metres along the skeleton from the stem base to the segment start: continuous bark V. */
    distFromRoot: Float32Array;
    /** Turn from the parent segment, radians per metre. */
    curvature: Float32Array;
    region: Uint8Array;
    health: Float32Array;
    light: Float32Array;
    /** Base of the segment's axis, 3 per segment: where wind bends this limb from. */
    windPivot: Float32Array;
    windLevel: Uint8Array;
  };
  leaves: {
    position: Float32Array;
    normal: Float32Array;
    up: Float32Array;
    size: Float32Array;
    /** Leaves in the cohort (one row stands for a node's leaves). */
    count: Uint16Array;
    segment: Int32Array;
    /** PLANT_CLUSTER_LEVELS cluster rows per leaf, finest first. */
    cluster: Int32Array;
    /** 0 outer shell .. 1 deep inside, from intercepted light. */
    crownDepth: Float32Array;
    /** Chlorophyll, carotenoid, anthocyanin, senescence per leaf, 0..1 each. */
    colorState: Float32Array;
    health: Float32Array;
  };
  clusters: { levels: readonly PlantClusterLevel[] };
  reproductive: { kind: Uint8Array; position: Float32Array; size: Float32Array; stage: Float32Array; count: Uint16Array };
  leafShape: LeafShapeParams;
  /** The species' leaf colours across the season; {@link PlantStructure.leaves} `colorState` mixes them. */
  leafColor: SeasonalColor;
  /** Colours of the species' flowers and ripe fruit, hex. */
  organColor: { flower: string; fruit: string };
  bark: { kind: BarkKind; furrow: number; color: string };
}

/** What the structure builder reads from a growth run. */
export interface PlantStructureSource {
  species: PlantSpecies;
  seed: string;
  dayOfYear: number;
  season: GrowingSeason;
  state: GrowthState;
}

function radiusOf(state: GrowthState, i: number): number {
  return Math.sqrt(((state.nodes.sapArea[i] ?? 0) + (state.nodes.heartArea[i] ?? 0)) / PLANT_PI);
}

function leafColor(day: number, season: GrowingSeason, out: Float32Array, at: number): void {
  // Evergreen foliage (out all year) never turns.
  const evergreen = season.leafOnDay <= 1 && season.leafOffDay >= 365;
  const fall = season.leafOffDay - day;
  const flush = evergreen ? 365 : day - season.leafOnDay;
  let senescence = !evergreen && fall < 25 ? (25 - fall) / 25 : 0;
  if (senescence > 1) senescence = 1;
  const young = flush < 14 ? 1 - flush / 14 : 0;
  out[at] = (1 - senescence) * (1 - 0.3 * young);
  out[at + 1] = 0.35 + 0.4 * senescence;
  out[at + 2] = 0.6 * senescence;
  out[at + 3] = senescence;
}

/**
 * Build the style-facing structure from a growth state.
 * @capability plant-structure a grown plant as a skeleton with regions, leaves, clusters and a crown envelope
 */
export function buildPlantStructure(source: PlantStructureSource): PlantStructure {
  const { species, state, season, dayOfYear } = source;
  const n = state.slots.nodeCount;
  const start = new Float32Array(n * 3);
  const end = new Float32Array(n * 3);
  const radiusStart = new Float32Array(n);
  const radiusEnd = new Float32Array(n);
  const parent = new Int32Array(n);
  const order = new Uint8Array(n);
  const bornYear = new Uint16Array(n);
  const distFromRoot = new Float32Array(n);
  const curvature = new Float32Array(n);
  const region = new Uint8Array(n);
  const health = new Float32Array(n);
  const light = new Float32Array(n);
  const windPivot = new Float32Array(n * 3);
  const windLevel = new Uint8Array(n);
  const axis = new Int32Array(n);
  const mainChild = new Int32Array(n).fill(-1);
  const subFoliage = new Float64Array(n);
  const dist = new Float64Array(n);
  let heightM = 0;
  let totalFoliage = 0;
  for (let i = 0; i < n; i += 1) {
    const p = state.nodes.parent[i] ?? -1;
    const flags = state.nodes.flags[i] ?? 0;
    if (p >= 0 && (flags & NODE_AXIS_START) === 0 && (mainChild[p] ?? -1) < 0) mainChild[p] = i;
    axis[i] = p < 0 || (flags & NODE_AXIS_START) !== 0 ? i : (axis[p] ?? i);
    for (let k = 0; k < 3; k += 1) {
      start[i * 3 + k] = p >= 0 ? (state.nodes.end[p * 3 + k] ?? 0) : 0;
      end[i * 3 + k] = state.nodes.end[i * 3 + k] ?? 0;
    }
    const y = state.nodes.end[i * 3 + 1] ?? 0;
    if (y > heightM) heightM = y;
    totalFoliage += state.nodes.foliage[i] ?? 0;
    subFoliage[i] = state.nodes.foliage[i] ?? 0;
  }
  for (let i = n - 1; i >= 1; i -= 1) {
    const p = state.nodes.parent[i] ?? -1;
    if (p >= 0) subFoliage[p] = (subFoliage[p] ?? 0) + (subFoliage[i] ?? 0);
  }
  // Several stems at breast height read as one, by the quadratic sum forest inventories use.
  let dbhSquared = 0;
  let crownBaseM = heightM;
  for (let i = 0; i < n; i += 1) {
    const p = state.nodes.parent[i] ?? -1;
    const flags = state.nodes.flags[i] ?? 0;
    const length = state.nodes.length[i] ?? 0;
    const r = radiusOf(state, i);
    const main = mainChild[i] ?? -1;
    radiusStart[i] = r;
    radiusEnd[i] = main >= 0 ? radiusOf(state, main) : r;
    parent[i] = p;
    order[i] = state.nodes.order[i] ?? 0;
    bornYear[i] = state.nodes.born[i] ?? 0;
    const startDist = p >= 0 ? (dist[p] ?? 0) : 0;
    dist[i] = startDist + length;
    distFromRoot[i] = startDist;
    if (p >= 0 && length > 0) {
      const dot = (state.nodes.dir[i * 3] ?? 0) * (state.nodes.dir[p * 3] ?? 0) + (state.nodes.dir[i * 3 + 1] ?? 0) * (state.nodes.dir[p * 3 + 1] ?? 0) + (state.nodes.dir[i * 3 + 2] ?? 0) * (state.nodes.dir[p * 3 + 2] ?? 0);
      curvature[i] = Math.sqrt(Math.max(0, 2 - 2 * Math.min(1, dot))) / length;
    }
    const dead = (flags & NODE_DEAD) !== 0;
    const sy = start[i * 3 + 1] ?? 0;
    let code: PlantRegion = PLANT_REGION.branch;
    if (dead) code = PLANT_REGION.deadwood;
    else if ((flags & NODE_SCAR) !== 0) code = PLANT_REGION.scar;
    else if ((state.nodes.order[i] ?? 0) === 0) code = sy < ROOT_FLARE_HEIGHT_M && r > 0.02 ? PLANT_REGION.rootFlare : PLANT_REGION.trunk;
    else if (r < TWIG_RADIUS_M) code = PLANT_REGION.twig;
    region[i] = code;
    health[i] = dead ? 0 : state.vitals.health;
    light[i] = state.nodes.light[i] ?? 0;
    const a = axis[i] ?? i;
    const ap = state.nodes.parent[a] ?? -1;
    for (let k = 0; k < 3; k += 1) windPivot[i * 3 + k] = ap >= 0 ? (state.nodes.end[ap * 3 + k] ?? 0) : 0;
    windLevel[i] = Math.min(3, state.nodes.order[i] ?? 0);
    const ey = state.nodes.end[i * 3 + 1] ?? 0;
    if ((state.nodes.order[i] ?? 0) === 0 && sy <= 1.3 && ey > 1.3) dbhSquared += (2 * r * 100) ** 2;
    if (!dead && (state.nodes.order[i] ?? 0) === 1 && (flags & NODE_AXIS_START) !== 0 && (subFoliage[i] ?? 0) >= 0.01 * totalFoliage && sy < crownBaseM) crownBaseM = sy;
  }

  // Fronds reach well past the node that bears them, so they set the plant's height and crown.
  const fronds = isFrondShape(species.leaf.shape);
  const frondLength = (species.leaf.sizeCm / 100) * frondLengthShare(species.growth, state.vitals.year);
  const frondPoints: number[] = [];
  if (fronds) {
    const pose: FrondPose = { azimuth: 0, elevation: 0, sag: 0 };
    const spine = new Float64Array((FROND_STATS_SEGMENTS + 1) * 2);
    for (let i = 0; i < n; i += 1) {
      const foliage = state.nodes.foliage[i] ?? 0;
      if (foliage <= 0) continue;
      const count = frondCount(foliage, frondLength);
      const rowAge = state.vitals.year - (state.nodes.born[i] ?? 0);
      for (let k = 0; k < count; k += 1) {
        frondPose(i, k, count, rowAge, pose);
        frondSpine(pose, frondLength, FROND_STATS_SEGMENTS, spine);
        const t = (k + 0.5) / count;
        const bx = (start[i * 3] ?? 0) + ((end[i * 3] ?? 0) - (start[i * 3] ?? 0)) * t;
        const by = (start[i * 3 + 1] ?? 0) + ((end[i * 3 + 1] ?? 0) - (start[i * 3 + 1] ?? 0)) * t;
        const bz = (start[i * 3 + 2] ?? 0) + ((end[i * 3 + 2] ?? 0) - (start[i * 3 + 2] ?? 0)) * t;
        if (by < crownBaseM) crownBaseM = by;
        const ca = plantCos(pose.azimuth);
        const sa = plantSin(pose.azimuth);
        for (let s = 1; s <= FROND_STATS_SEGMENTS; s += 1) {
          const h = spine[s * 2] ?? 0;
          const y = by + (spine[s * 2 + 1] ?? 0);
          if (y > heightM) heightM = y;
          frondPoints.push(bx + ca * h, y, bz + sa * h);
        }
      }
    }
  }

  const leafOn = dayOfYear >= season.leafOnDay && dayOfYear < season.leafOffDay;
  let leafRows = 0;
  if (leafOn) for (let i = 0; i < n; i += 1) if ((state.nodes.foliage[i] ?? 0) > 0) leafRows += 1;
  if (leafRows === 0) {
    for (let i = 0; i < n; i += 1) if ((state.nodes.foliage[i] ?? 0) > 0 && (state.nodes.end[i * 3 + 1] ?? 0) < crownBaseM) crownBaseM = state.nodes.end[i * 3 + 1] ?? 0;
  }
  const position = new Float32Array(leafRows * 3);
  const normal = new Float32Array(leafRows * 3);
  const up = new Float32Array(leafRows * 3);
  const size = new Float32Array(leafRows);
  const count = new Uint16Array(leafRows);
  const segment = new Int32Array(leafRows);
  const cluster = new Int32Array(leafRows * PLANT_CLUSTER_LEVELS);
  const crownDepth = new Float32Array(leafRows);
  const colorState = new Float32Array(leafRows * 4);
  const leafHealth = new Float32Array(leafRows);

  // Cluster keys: own axis, then the nearest ancestor axis of order ≤ 2, then of order ≤ 1.
  const limb2 = new Int32Array(n);
  const limb1 = new Int32Array(n);
  for (let i = 0; i < n; i += 1) {
    const a = axis[i] ?? i;
    const ap = state.nodes.parent[a] ?? -1;
    const o = state.nodes.order[a] ?? 0;
    limb2[i] = o <= 2 || ap < 0 ? a : (limb2[ap] ?? a);
    limb1[i] = o <= 1 || ap < 0 ? a : (limb1[ap] ?? a);
  }
  const keyMaps = [new Map<number, number>(), new Map<number, number>(), new Map<number, number>()];
  const keyOf = [axis, limb2, limb1];
  const openSky = Math.max(1e-6, maxLight(state));
  let row = 0;
  for (let i = 0; i < n && leafOn; i += 1) {
    if ((state.nodes.foliage[i] ?? 0) <= 0) continue;
    const dx = state.nodes.dir[i * 3] ?? 0;
    const dy = state.nodes.dir[i * 3 + 1] ?? 1;
    const dz = state.nodes.dir[i * 3 + 2] ?? 0;
    for (let k = 0; k < 3; k += 1) position[row * 3 + k] = state.nodes.end[i * 3 + k] ?? 0;
    const nx = 0.3 * dx;
    const ny = 0.3 * dy + 1;
    const nz = 0.3 * dz;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    normal[row * 3] = nx / nl;
    normal[row * 3 + 1] = ny / nl;
    normal[row * 3 + 2] = nz / nl;
    up[row * 3] = dx;
    up[row * 3 + 1] = dy;
    up[row * 3 + 2] = dz;
    size[row] = fronds ? frondLength : species.leaf.sizeCm / 100;
    count[row] = fronds ? frondCount(state.nodes.foliage[i] ?? 0, frondLength) : species.leaf.leavesPerNode;
    segment[row] = i;
    for (let level = 0; level < PLANT_CLUSTER_LEVELS; level += 1) {
      const key = keyOf[level]?.[i] ?? i;
      const map = keyMaps[level];
      if (map === undefined) continue;
      let id = map.get(key);
      if (id === undefined) {
        id = map.size;
        map.set(key, id);
      }
      cluster[row * PLANT_CLUSTER_LEVELS + level] = id;
    }
    const depth = 1 - (state.nodes.light[i] ?? 0) / openSky;
    crownDepth[row] = depth < 0 ? 0 : depth > 1 ? 1 : depth;
    leafColor(dayOfYear, season, colorState, row * 4);
    leafHealth[row] = state.vitals.health;
    row += 1;
  }

  const levels: PlantClusterLevel[] = [];
  for (let level = 0; level < PLANT_CLUSTER_LEVELS; level += 1) {
    const rows = keyMaps[level]?.size ?? 0;
    const center = new Float32Array(rows * 3);
    const radius = new Float32Array(rows);
    const clusterParent = new Int32Array(rows).fill(-1);
    const leafCount = new Uint32Array(rows);
    const sums = new Float64Array(rows * 3);
    for (let leaf = 0; leaf < leafRows; leaf += 1) {
      const id = cluster[leaf * PLANT_CLUSTER_LEVELS + level] ?? 0;
      leafCount[id] = (leafCount[id] ?? 0) + 1;
      for (let k = 0; k < 3; k += 1) sums[id * 3 + k] = (sums[id * 3 + k] ?? 0) + (position[leaf * 3 + k] ?? 0);
      if (level + 1 < PLANT_CLUSTER_LEVELS) clusterParent[id] = cluster[leaf * PLANT_CLUSTER_LEVELS + level + 1] ?? -1;
    }
    for (let id = 0; id < rows; id += 1) {
      const leaves = Math.max(1, leafCount[id] ?? 1);
      for (let k = 0; k < 3; k += 1) center[id * 3 + k] = (sums[id * 3 + k] ?? 0) / leaves;
    }
    for (let leaf = 0; leaf < leafRows; leaf += 1) {
      const id = cluster[leaf * PLANT_CLUSTER_LEVELS + level] ?? 0;
      const ex = (position[leaf * 3] ?? 0) - (center[id * 3] ?? 0);
      const ey = (position[leaf * 3 + 1] ?? 0) - (center[id * 3 + 1] ?? 0);
      const ez = (position[leaf * 3 + 2] ?? 0) - (center[id * 3 + 2] ?? 0);
      const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (d > (radius[id] ?? 0)) radius[id] = d;
    }
    levels.push({ center, radius, parent: clusterParent, leafCount });
  }

  const crownHull = new Float32Array(2 + CROWN_HULL_BINS * CROWN_HULL_SECTORS);
  const hullBottom = crownBaseM;
  const hullTop = heightM;
  crownHull[0] = hullBottom;
  crownHull[1] = hullTop;
  let crownRadiusM = 0;
  const sectorMax = new Float64Array(CROWN_HULL_SECTORS);
  const span = Math.max(1e-6, hullTop - hullBottom);
  for (let i = 0; i < n; i += 1) {
    if ((state.nodes.foliage[i] ?? 0) <= 0) continue;
    const x = state.nodes.end[i * 3] ?? 0;
    const y = state.nodes.end[i * 3 + 1] ?? 0;
    const z = state.nodes.end[i * 3 + 2] ?? 0;
    const r = Math.sqrt(x * x + z * z);
    const sector = sectorOf(x, z);
    if (r > (sectorMax[sector] ?? 0)) sectorMax[sector] = r;
    let bin = Math.floor(((y - hullBottom) / span) * CROWN_HULL_BINS);
    if (bin < 0) bin = 0;
    if (bin >= CROWN_HULL_BINS) bin = CROWN_HULL_BINS - 1;
    const at = 2 + bin * CROWN_HULL_SECTORS + sector;
    if (r > (crownHull[at] ?? 0)) crownHull[at] = r;
  }
  for (let f = 0; f < frondPoints.length; f += 3) {
    const x = frondPoints[f] ?? 0;
    const y = frondPoints[f + 1] ?? 0;
    const z = frondPoints[f + 2] ?? 0;
    const r = Math.sqrt(x * x + z * z);
    const sector = sectorOf(x, z);
    if (r > (sectorMax[sector] ?? 0)) sectorMax[sector] = r;
    const bin = Math.max(0, Math.min(CROWN_HULL_BINS - 1, Math.floor(((y - hullBottom) / span) * CROWN_HULL_BINS)));
    const at = 2 + bin * CROWN_HULL_SECTORS + sector;
    if (r > (crownHull[at] ?? 0)) crownHull[at] = r;
  }
  for (let s = 0; s < CROWN_HULL_SECTORS; s += 1) crownRadiusM += (sectorMax[s] ?? 0) / CROWN_HULL_SECTORS;

  let organs = 0;
  if (leafOn) for (let i = 0; i < n; i += 1) if ((state.nodes.flowers[i] ?? 0) > 0) organs += 1;
  const organKind = new Uint8Array(organs);
  const organPosition = new Float32Array(organs * 3);
  const organSize = new Float32Array(organs);
  const organStage = new Float32Array(organs);
  const organCount = new Uint16Array(organs);
  const seasonLength = Math.max(1, season.leafOffDay - season.leafOnDay);
  const stage = Math.max(0, Math.min(1, (dayOfYear - season.leafOnDay) / seasonLength));
  let organ = 0;
  for (let i = 0; i < n && leafOn; i += 1) {
    const flowers = state.nodes.flowers[i] ?? 0;
    if (flowers <= 0) continue;
    organKind[organ] = stage < 0.15 ? PLANT_ORGAN.flower : PLANT_ORGAN.fruit;
    for (let k = 0; k < 3; k += 1) organPosition[organ * 3 + k] = state.nodes.end[i * 3 + k] ?? 0;
    organSize[organ] = 0.01 + 0.02 * stage;
    organStage[organ] = stage;
    organCount[organ] = flowers;
    organ += 1;
  }

  const barkAge = state.vitals.year - species.bark.smoothUntilYears;
  const furrow = barkAge <= 0 ? 0 : species.bark.furrowDepth * Math.min(1, barkAge / 60);
  return {
    speciesId: species.id,
    ageYears: state.vitals.year,
    dayOfYear,
    seed: source.seed,
    health: state.vitals.health,
    stats: { heightM, dbhCm: Math.sqrt(dbhSquared), crownRadiusM, crownBaseM: Math.min(crownBaseM, heightM) },
    crownHull,
    segments: { start, end, radiusStart, radiusEnd, parent, order, bornYear, distFromRoot, curvature, region, health, light, windPivot, windLevel },
    leaves: { position, normal, up, size, count, segment, cluster, crownDepth, colorState, health: leafHealth },
    clusters: { levels },
    reproductive: { kind: organKind, position: organPosition, size: organSize, stage: organStage, count: organCount },
    leafShape: species.leaf.shape,
    leafColor: species.leaf.color,
    organColor: { flower: species.reproduction.flowerColor ?? "#efeadb", fruit: species.reproduction.fruitColor ?? "#6b3a24" },
    bark: { kind: species.bark.kind, furrow, color: species.bark.color },
  };
}

function maxLight(state: GrowthState): number {
  let best = 0;
  for (let i = 0; i < state.slots.nodeCount; i += 1) if ((state.nodes.light[i] ?? 0) > best) best = state.nodes.light[i] ?? 0;
  return best;
}

function sectorOf(x: number, z: number): number {
  // Octant from the signs and the larger axis, so no trigonometry is needed.
  const ax = x < 0 ? -x : x;
  const az = z < 0 ? -z : z;
  if (x >= 0 && z >= 0) return ax >= az ? 0 : 1;
  if (x < 0 && z >= 0) return az >= ax ? 2 : 3;
  if (x < 0) return ax >= az ? 4 : 5;
  return az >= ax ? 6 : 7;
}

/**
 * Crown ratio: live crown length over total height.
 * @capability plant-structure a grown plant as a skeleton with regions, leaves, clusters and a crown envelope
 */
export function crownRatio(structure: PlantStructure): number {
  const { heightM, crownBaseM } = structure.stats;
  return heightM > 0 ? (heightM - crownBaseM) / heightM : 0;
}

/**
 * FNV-1a over every number and typed-array byte of a structure, as 8 hex digits per lane.
 * @capability plant-structure a grown plant as a skeleton with regions, leaves, clusters and a crown envelope
 */
export function hashPlantStructure(structure: PlantStructure): string {
  let a = hashWords([]);
  let b = hashWords([0x5bd1e995]);
  const feedBytes = (view: ArrayBufferView): void => {
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    a = hashWords(bytes, a);
    b = hashWords(bytes, b);
  };
  const scratch = new Float64Array(1);
  const feedNumber = (value: number): void => {
    scratch[0] = value;
    feedBytes(scratch);
  };
  const feedText = (text: string): void => {
    feedBytes(new TextEncoder().encode(text));
  };
  feedText(structure.speciesId);
  feedText(structure.seed);
  feedNumber(structure.ageYears);
  feedNumber(structure.dayOfYear);
  feedNumber(structure.health);
  feedNumber(structure.stats.heightM);
  feedNumber(structure.stats.dbhCm);
  feedNumber(structure.stats.crownRadiusM);
  feedNumber(structure.stats.crownBaseM);
  feedBytes(structure.crownHull);
  for (const array of Object.values(structure.segments)) feedBytes(array);
  for (const array of Object.values(structure.leaves)) feedBytes(array);
  for (const level of structure.clusters.levels) for (const array of Object.values(level)) feedBytes(array);
  for (const array of Object.values(structure.reproductive)) feedBytes(array);
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}
