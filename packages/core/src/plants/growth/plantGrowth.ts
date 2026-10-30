// @skill jgengine-world
import { hashString, randomSeedFrom, stepRandomSeed, type RandomSeed } from "../../random/rng";
import type { PlantSpecies } from "../species/plantSpecies";
import { frondCount, frondLengthShare, frondPose, frondSpine, isFrondShape, type FrondPose } from "../structure/frondPose";
import { buildPlantStructure, type PlantStructure } from "../structure/plantStructure";
import { applySag, createSagScratch } from "./biomechanics";
import { createShootCandidates, solveShootScale } from "./carbonBalance";
import {
  BUD_FIELDS,
  NODE_AXIS_START,
  NODE_DEAD,
  NODE_FIELDS,
  NODE_NO_SPUR,
  NODE_SCAR,
  SCALAR_FIELDS,
  base64ToBytes,
  bytesToBase64,
  createGrowthState,
  fieldWidth,
  type GrowthState,
} from "./growthState";
import { createLightField } from "./lightField";
import { growingSeason, type GrowingSeason } from "./phenology";
import { OPEN_TEMPERATE_SITE, siteModifier, type PlantEnvironment } from "./plantEnvironment";
import { PLANT_PI, plantCos, plantPow, plantSin } from "./plantMath";
import { applyThickening, createPipeCost, hasCambium, pipeDemand } from "./pipeModel";
import { bendTowardsTropisms, lateralDirection, normalize3, type TropismWeights } from "./tropism";
import { individualGrowth } from "./individualVariation";

/** Bumped whenever a rule changes what a seed grows into; part of every structure cache key. */
export const PLANT_SIM_VERSION = 6;

/** Caps that bound one plant's memory and per-year work. */
export interface GrowthLimits {
  /** Most growing shoot tips (terminal buds) alive at once. */
  maxBuds: number;
  /** Most internodes alive at once. */
  maxNodes: number;
}

/** Most buds and nodes a plant may hold: 4000 and 60000. */
export const DEFAULT_GROWTH_LIMITS: GrowthLimits = { maxBuds: 4000, maxNodes: 60000 };

/** How {@link createPlantGrowth} grows a plant beyond its species, site and seed. */
export interface PlantGrowthOptions {
  /** Bud and node caps; {@link DEFAULT_GROWTH_LIMITS} when left out. */
  limits?: GrowthLimits;
  /**
   * `"seeded"` (the default) grows the seed's own individual: branch angle, apical control, vigour,
   * gravitropism and internode length drawn around the species record, so the seeds of one species
   * differ in crown shape as much as measured trees do. `"typical"` grows the record itself, the
   * species' central individual, as fits and calibration tests compare it against references.
   */
  individual?: "seeded" | "typical";
}

/** A grown plant's whole state as JSON-safe values: typed arrays travel as base64. */
export interface PlantGrowthSnapshot {
  simVersion: number;
  speciesId: string;
  speciesVersion: number;
  seed: string;
  limits: GrowthLimits;
  individual: "seeded" | "typical";
  env: PlantEnvironment;
  scalars: Readonly<Record<string, number>>;
  arrays: Readonly<Record<string, string>>;
}

/** One plant growing year by year. */
export interface PlantGrowth {
  /** Grow this many years (default 1). */
  step(years?: number): void;
  ageYears(): number;
  /** The plant's structure on a day of the current year (default midsummer, day 200). */
  structure(dayOfYear?: number): PlantStructure;
  /** Live counters: nodes and buds against their caps, health, carbon. */
  stats(): PlantGrowthStats;
  snapshot(): PlantGrowthSnapshot;
  restore(snapshot: PlantGrowthSnapshot): void;
  /** Back to a germinating seed with the same species, environment and seed. */
  reset(): void;
  /** Change the environment from the next year on (a gap opens, a drought starts). */
  retune(env: Partial<PlantEnvironment>): void;
  /** Kill the plant now (felled by fire, girdled, drowned): it stands as a snag and decays from the next year on. */
  kill(): void;
  environment(): PlantEnvironment;
}

/** Counters a {@link PlantGrowth} reports each year. */
export interface PlantGrowthStats {
  ageYears: number;
  alive: boolean;
  nodes: number;
  buds: number;
  maxNodesSeen: number;
  maxBudsSeen: number;
  health: number;
  /** Last year's gross photosynthesis, kg dry mass. */
  photosynthesisKg: number;
  /** Leaf area this year, m². */
  leafAreaM2: number;
  /** Sapwood cross-section of the stem at breast height (1.3 m), m²; 0 below that height. */
  sapwoodAtBreastHeightM2: number;
  shedKg: number;
  /**
   * 0 while alive; once dead, the snag decay class (Maser et al. 1979; Cline et al. 1980): 1 fine twigs
   * still on, 2 twigs gone, 3 only stout limbs left, 4 a bare trunk, often with its top broken off,
   * 5 fallen or a stump under breast height.
   */
  decayClass: number;
}

const CELL_M = 0.5;
const BREAST_HEIGHT_M = 1.3;
const SEEDLING_LENGTH_M = 0.04;
/** Fronds of a node read for light; its leaf area is spread over up to FROND_LIGHT_FRONDS fronds. */
const FROND_LIGHT_SAMPLES = 6;
const FROND_LIGHT_FRONDS = 48;
/** Points along each frond its leaf area is spread over. */
const FROND_SPINE_POINTS = 3;
/** Lean of each further basal stem of a multi-stemmed seedling from vertical, radians. */
const BASAL_STEM_LEAN = (20 * Math.PI) / 180;
/** A branch tip below this height, metres, lies on the ground. */
const GROUND_TIP_M = 0.05;
const MERGE_COS = 0.985;
const MERGE_MAX_LENGTH_M = 3;
/** Wood older than this may merge across a wider bend: its shape is set and only the node budget matters. */
const SETTLED_WOOD_YEARS = 8;
const SETTLED_MERGE_COS = 0.906;
const SETTLED_MERGE_MAX_LENGTH_M = 6;
/** Share of sapwood dry mass that can be held as non-structural carbohydrate reserve. */
const RESERVE_SHARE_OF_SAPWOOD = 0.1;
/** Share of photosynthesis lost at the species' height limit (Koch et al. 2004). */
const TOP_GAS_EXCHANGE_LOSS = 0.5;

/** The value that would sit at `nth` if `values[0..count)` were sorted ascending (Hoare quickselect; reorders them). */
function selectNth(values: Float64Array, count: number, nth: number): number {
  let low = 0;
  let high = count - 1;
  while (high > low) {
    const a = values[low] ?? 0;
    const b = values[(low + high) >> 1] ?? 0;
    const c = values[high] ?? 0;
    const pivot = a < b ? (b < c ? b : a < c ? c : a) : a < c ? a : b < c ? c : b;
    let i = low;
    let j = high;
    while (i <= j) {
      while ((values[i] ?? 0) < pivot) i += 1;
      while ((values[j] ?? 0) > pivot) j -= 1;
      if (i <= j) {
        const swap = values[i] ?? 0;
        values[i] = values[j] ?? 0;
        values[j] = swap;
        i += 1;
        j -= 1;
      }
    }
    if (nth <= j) high = j;
    else if (nth >= i) low = i;
    else break;
  }
  return values[nth] ?? 0;
}

/**
 * Grow one plant from seed with a biology simulation: Palubicki 2009 bud self-organisation on shadow
 * voxels with extended Borchert–Honda vigour, a LIGNUM carbon balance that pays for every shoot and
 * ring, pipe-model thickening, tropisms, gravitational sag and self-pruning of branches that cannot
 * pay for themselves. Same species, environment and seed give the same plant on every JS engine.
 *
 * Old trees decline the way veteran trees do: once height and crown stop gaining, the upkeep of a
 * growing woody frame outruns the leaves, outer limbs that cost more than they earn are shed and
 * the crown retrenches while the trunk lives on (Mäkelä 1997; Fay 2002; Lonsdale 2013).
 *
 * @capability plant-growth grow a tree from seed to any age with a real biology simulation; snapshot, restore, retune
 */
export function createPlantGrowth(species: PlantSpecies, env: PlantEnvironment, seed: string, options: PlantGrowthOptions = {}): PlantGrowth {
  const limits = options.limits ?? DEFAULT_GROWTH_LIMITS;
  const individual = options.individual ?? "seeded";
  const nodeCap = limits.maxNodes;
  const budCap = limits.maxBuds;
  let environment: PlantEnvironment = copyEnvironment(env);
  let season: GrowingSeason = growingSeason(species, environment);
  let site = siteModifier(environment);
  let state: GrowthState = createGrowthState(nodeCap, budCap);
  const seedHash = hashString(seed);
  const field = createLightField({
    cellM: CELL_M,
    halfWidthM: species.limits.maxCrownRadiusM + 3,
    heightM: species.limits.maxHeightM + 4,
    a: species.growth.shadow.a,
    b: species.growth.shadow.b,
    depth: species.growth.shadow.depth,
  });
  // Each seed grows its own individual: architecture drawn around the species record.
  const g = individual === "typical" ? species.growth : individualGrowth(species.growth, randomSeedFrom(Math.imul(seedHash ^ 0x51ed, 0x2c1b3c6d)));
  const c = species.carbon;
  const fullLeafArea = species.leaf.leavesPerNode * 0.55 * (species.leaf.sizeCm / 100) * (species.leaf.sizeCm / 100);
  // A palm's or fern's fronds lengthen through its establishment phase; every other leaf is full size.
  const leafAreaIn = (year: number): number => fullLeafArea * frondLengthShare(g, year) ** 2;
  let leafAreaPerNode = leafAreaIn(0);
  const frondShoots = isFrondShape(species.leaf.shape);
  // Laterals a year's shoot puts out, which share its yearly chance of a codominant stem.
  const lateralsPerShoot = Math.max(1, g.maxMetamersPerShoot * g.lateralBudsPerNode);
  const crownShedShare = species.habit === "tree" && !frondShoots ? crownShedLightShare(species.tolerance.shade) : 0;
  const cambium = hasCambium(species);
  // A frond spreads its leaf area along its whole length, so its shade and light are sampled there.
  const frondCells = new Int32Array(frondShoots ? nodeCap * FROND_LIGHT_SAMPLES : 0);
  const frondPoseScratch: FrondPose = { azimuth: 0, elevation: 0, sag: 0 };
  const frondSpineScratch = new Float64Array((FROND_SPINE_POINTS + 1) * 2);

  function depositFronds(i: number, x: number, y: number, z: number, foliage: number): void {
    const length = (species.leaf.sizeCm / 100) * frondLengthShare(g, state.year);
    const count = frondCount(foliage, length);
    const drawn = count < FROND_LIGHT_FRONDS ? count : FROND_LIGHT_FRONDS;
    const share = foliage / (drawn * FROND_SPINE_POINTS);
    const rowAge = state.year - (state.born[i] ?? 0);
    const every = Math.max(1, Math.floor(drawn / FROND_LIGHT_SAMPLES));
    let sampled = 0;
    for (let f = 0; f < drawn; f += 1) {
      const k = Math.floor(((f + 0.5) * count) / drawn);
      frondPose(i, k, count, rowAge, frondPoseScratch);
      frondSpine(frondPoseScratch, length, FROND_SPINE_POINTS, frondSpineScratch);
      const ca = plantCos(frondPoseScratch.azimuth);
      const sa = plantSin(frondPoseScratch.azimuth);
      for (let p = 1; p <= FROND_SPINE_POINTS; p += 1) {
        const h = frondSpineScratch[p * 2] ?? 0;
        const cell = field.deposit(x + ca * h, y + (frondSpineScratch[p * 2 + 1] ?? 0), z + sa * h, share);
        // Each sampled frond is read for light at its middle.
        if (p === 2 && f % every === 0 && sampled < FROND_LIGHT_SAMPLES) {
          frondCells[i * FROND_LIGHT_SAMPLES + sampled] = cell;
          sampled += 1;
        }
      }
    }
    if (sampled < FROND_LIGHT_SAMPLES) frondCells[i * FROND_LIGHT_SAMPLES + sampled] = -2;
  }

  function frondLight(i: number, sky: number, extinction: number): number {
    let sum = 0;
    let samples = 0;
    for (let s = 0; s < FROND_LIGHT_SAMPLES; s += 1) {
      const cell = frondCells[i * FROND_LIGHT_SAMPLES + s] ?? -2;
      if (cell === -2) break;
      sum += field.lightAtCell(cell, sky, extinction);
      samples += 1;
    }
    return samples > 0 ? sum / samples : 0;
  }
  const shootArea = PLANT_PI * species.wood.shootRadiusM * species.wood.shootRadiusM;
  const divergence = (species.architecture.divergence * PLANT_PI) / 180;
  const branchAngle = (g.branchAngle * PLANT_PI) / 180;
  const cosBranch = plantCos(branchAngle);
  const metamerCap = (upward: number, index: number, light: number): number => {
    const posture = g.horizontalVigour + (1 - g.horizontalVigour) * (upward > 0 ? upward : 0);
    const vigourShare = 1 - g.vigourIndexWeight + g.vigourIndexWeight * (index > 1 ? 1 : index);
    // Shoot length follows the light the bud sees (LIGNUM's f(Q)), so shaded shoots stay short.
    const lightShare = light > 1 ? 1 : light;
    const establishment = g.establishmentYears > state.year ? state.year / g.establishmentYears : 1;
    return Math.max(1, Math.floor(g.maxMetamersPerShoot * posture * vigourShare * lightShare * establishment + 0.5));
  };
  const hydraulicFactor = (path: number, maxPath: number): number => hydraulicFactorWith(path, maxPath, c.hydraulicExponent);
  // At the height limit leaves stop expanding, but gas exchange only falls to about half (Koch et al.
  // 2004), so photosynthesis keeps that floor while shoot extension takes the full limit.
  const hydraulicGas = (height: number, maxHeight: number): number => 1 - TOP_GAS_EXCHANGE_LOSS * (1 - hydraulicFactor(height, maxHeight));
  // Shade leaves are thinner (lower mass per area) and so cheaper to build and run (Niinemets 2007).
  const shadeAcclimation = 0.6 * species.tolerance.shade;
  const acclimation = (light: number): number => 1 - shadeAcclimation * (1 - (light > 1 ? 1 : light));
  // Leaf photosynthesis saturates with light: a rectangular hyperbola scaled to 1 in open sky.
  const halfSaturation = c.lightHalfSaturation;
  const lightResponse = (light: number): number => (light * (1 + halfSaturation)) / (light + halfSaturation);

  const pipeCost = createPipeCost(species, nodeCap);
  const tipLight = new Float64Array(nodeCap);
  const vigourIndex = new Float64Array(nodeCap);
  const subP = new Float64Array(nodeCap);
  const subR = new Float64Array(nodeCap);
  const subT = new Float64Array(nodeCap);
  const subStore = new Float64Array(nodeCap);
  const totals = { photosynthesis: 0, respiration: 0, turnover: 0, leafArea: 0, storeKg: 0 };
  const pressler = { pressler: 0 };
  const subQ = new Float64Array(nodeCap);
  const subFoliage = new Float64Array(nodeCap);
  const vigour = new Float64Array(nodeCap);
  const latentShare = new Float64Array(nodeCap);
  const movedArrays: GrowthState[(typeof NODE_FIELDS)[number]][] = [];
  const movedWidths: number[] = [];
  /** Light-field cell of each leafy node's shoot midpoint, from this year's flush. */
  const midCell = new Int32Array(nodeCap);
  const need = new Float64Array(nodeCap);
  const firstChild = new Int32Array(nodeCap);
  const nextSibling = new Int32Array(nodeCap);
  const lastChild = new Int32Array(nodeCap);
  const childCount = new Int32Array(nodeCap);
  const budAt = new Int32Array(nodeCap);
  const budShare = new Float64Array(budCap);
  const remap = new Int32Array(nodeCap);
  const removed = new Uint8Array(nodeCap);
  const keptParent = new Int32Array(nodeCap);
  const sag = createSagScratch(nodeCap);
  // A terminal per bud, a lateral per node, and a short shoot per node for laterals the bud cap refused.
  const candidates = createShootCandidates(budCap + 2 * nodeCap);
  const candidateRef = new Int32Array(budCap + 2 * nodeCap);
  const shareScratch = new Float64Array(budCap + nodeCap * Math.max(1, g.lateralBudsPerNode));
  const optimal = new Float64Array(3);
  const heading = new Float64Array(3);
  const axisDir = new Float64Array(3);
  let lastPhotosynthesis = 0;
  let lastLeafArea = 0;
  let maxNodesSeen = 0;
  let maxBudsSeen = 0;
  /** This year more lateral buds wanted to break than the bud cap had room for. */
  let budSlotsShort = false;

  const streamFor = (a: number, b: number): RandomSeed => {
    let h = Math.imul(seedHash ^ Math.imul(a + 1, 0x9e3779b1), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h ^ Math.imul(b + 1, 0xc2b2ae35), 0x27d4eb2f);
    h ^= h >>> 16;
    return randomSeedFrom(h);
  };

  function addNode(parent: number, order: number, flags: number, dir: Float64Array, length: number, phase: number, metamers: number): number {
    const i = state.nodeCount;
    state.nodeCount += 1;
    state.nodeId[i] = state.nextNodeId;
    state.nextNodeId += 1;
    state.parent[i] = parent;
    state.born[i] = state.year;
    state.leafBorn[i] = state.year;
    state.order[i] = order;
    state.flags[i] = flags;
    state.length[i] = length;
    const sx = parent >= 0 ? (state.end[parent * 3] ?? 0) : 0;
    const sy = parent >= 0 ? (state.end[parent * 3 + 1] ?? 0) : 0;
    const sz = parent >= 0 ? (state.end[parent * 3 + 2] ?? 0) : 0;
    for (let k = 0; k < 3; k += 1) state.dir[i * 3 + k] = dir[k] ?? 0;
    state.end[i * 3] = sx + (dir[0] ?? 0) * length;
    state.end[i * 3 + 1] = sy + (dir[1] ?? 0) * length;
    state.end[i * 3 + 2] = sz + (dir[2] ?? 0) * length;
    state.phase[i] = phase;
    state.sapArea[i] = shootArea;
    state.heartArea[i] = 0;
    state.foliage[i] = leafAreaPerNode * metamers;
    state.metamers[i] = metamers;
    state.latent[i] = g.lateralBudsPerNode;
    state.latentAge[i] = 0;
    // A new shoot is lit as the bud it grew from until next year's flush reads its own light.
    const budLight = parent >= 0 ? (tipLight[parent] ?? 0) : 0;
    state.light[i] = budLight > 0 ? budLight : parent >= 0 ? (state.light[parent] ?? 0) : 0;
    state.vigour[i] = 0;
    state.moment[i] = 0;
    state.deficit[i] = 0;
    state.deadAge[i] = 0;
    state.flowers[i] = 0;
    return i;
  }

  function addBud(node: number): void {
    const b = state.budCount;
    state.budCount += 1;
    state.budId[b] = state.nextBudId;
    state.nextBudId += 1;
    state.budNode[b] = node;
    state.budIdle[b] = 0;
  }

  function germinate(): void {
    state = createGrowthState(nodeCap, budCap);
    syncLeafArea();
    let cursor = streamFor(0x7fffffff, 0);
    const [spin, next] = stepRandomSeed(cursor);
    cursor = next;
    heading[0] = 0;
    heading[1] = 1;
    heading[2] = 0;
    const root = addNode(-1, 0, 0, heading, SEEDLING_LENGTH_M, spin * 2 * PLANT_PI, 1);
    // Cotyledons: half a node's leaf area from seed reserves.
    state.foliage[root] = leafAreaPerNode * 0.5;
    // A shrub's root is only its collar: every stem rises from it, so each can die and be replaced.
    const shrub = g.stemLifespanYears !== undefined;
    if (!shrub) addBud(root);
    // Further basal stems lean out from the collar, evenly around it, each its own trunk.
    const extra = Math.round(g.basalStems) - (shrub ? 0 : 1);
    for (let s = 0; s < extra; s += 1) {
      const azimuth = spin * 2 * PLANT_PI + (s * 2 * PLANT_PI) / extra;
      lateralDirection(heading, BASAL_STEM_LEAN, azimuth, axisDir);
      const stem = addNode(root, 0, NODE_AXIS_START, axisDir, SEEDLING_LENGTH_M, azimuth, 1);
      state.foliage[stem] = leafAreaPerNode * 0.5;
      addBud(stem);
    }
    lastPhotosynthesis = 0;
    lastLeafArea = state.foliage[root] ?? 0;
    maxNodesSeen = state.nodeCount;
    maxBudsSeen = state.budCount;
  }

  /** Child lists in index order: firstChild, nextSibling, lastChild and childCount per node. */
  function buildChildren(): void {
    const n = state.nodeCount;
    firstChild.fill(-1, 0, n);
    lastChild.fill(-1, 0, n);
    childCount.fill(0, 0, n);
    for (let i = n - 1; i >= 1; i -= 1) {
      const p = state.parent[i] ?? -1;
      if (p < 0) continue;
      const first = firstChild[p] ?? -1;
      nextSibling[i] = first;
      if (first < 0) lastChild[p] = i;
      firstChild[p] = i;
      childCount[p] = (childCount[p] ?? 0) + 1;
    }
    if (n > 0) nextSibling[0] = -1;
  }

  /** Append nodes `from..nodeCount` (all newer than every other node) to their parents' child lists. */
  function appendChildren(from: number): void {
    for (let i = from; i < state.nodeCount; i += 1) {
      firstChild[i] = -1;
      lastChild[i] = -1;
      childCount[i] = 0;
      nextSibling[i] = -1;
      const p = state.parent[i] ?? -1;
      if (p < 0) continue;
      const last = lastChild[p] ?? -1;
      if (last < 0) firstChild[p] = i;
      else nextSibling[last] = i;
      lastChild[p] = i;
      childCount[p] = (childCount[p] ?? 0) + 1;
    }
  }

  function indexBuds(): void {
    budAt.fill(-1, 0, state.nodeCount);
    for (let b = 0; b < state.budCount; b += 1) budAt[state.budNode[b] ?? 0] = b;
  }

  function die(): void {
    state.alive = 0;
    for (let i = 0; i < state.nodeCount; i += 1) {
      state.flags[i] = (state.flags[i] ?? 0) | NODE_DEAD;
      state.foliage[i] = 0;
      state.latent[i] = 0;
      state.flowers[i] = 0;
    }
    state.budCount = 0;
    state.health = 0;
  }

  /**
   * Years a piece of dead wood of this radius stays on: twigs drop in a few years, limbs in a decade, a
   * trunk rots through at its base in a few decades. Denser wood lasts longer, and decay doubles every
   * 10 °C warmer (Q10 of 2; Harmon et al. 1986).
   */
  function deadwoodYears(radiusCm: number, standing: boolean): number {
    if (!standing) return 2 + 2 * radiusCm;
    const size = 2 + 2 * Math.min(radiusCm, 5) + 0.5 * Math.max(0, radiusCm - 5);
    const warmth = plantPow(2, (environment.temperatureC - OPEN_TEMPERATE_SITE.temperatureC) / 10);
    return (size * (species.wood.densityKgM3 / 500)) / warmth;
  }

  function radiusCmOf(i: number): number {
    return Math.sqrt(((state.sapArea[i] ?? 0) + (state.heartArea[i] ?? 0)) / PLANT_PI) * 100;
  }

  function decayClass(): number {
    if (state.alive === 1) return 0;
    let top = 0;
    let finest = Infinity;
    for (let i = 0; i < state.nodeCount; i += 1) {
      top = Math.max(top, state.end[i * 3 + 1] ?? 0);
      if ((state.order[i] ?? 0) > 0) finest = Math.min(finest, radiusCmOf(i));
    }
    if (top < BREAST_HEIGHT_M) return 5;
    if (finest === Infinity) return 4;
    if (finest >= 2.5) return 3;
    return finest >= 0.5 ? 2 : 1;
  }

  function isDead(i: number): boolean {
    return ((state.flags[i] ?? 0) & NODE_DEAD) !== 0;
  }

  /**
   * Per-node carbon balance, gathered basipetally into each branch. A branch (axis start) that has run
   * a deficit for `pruneDeficitYears` dies here, as soon as its subtree is summed, and leaves the
   * totals; `removed` marks it for {@link markDeadBranches}. Returns true when any branch died.
   */
  function gatherCarbon(): boolean {
    const n = state.nodeCount;
    const lue = (c.lueGPerMJ / 1000) * season.parMJ * site * g.extinction;
    const maxHeight = species.limits.maxHeightM * c.hydraulicHeightShare;
    const efficiency = c.growthEfficiency;
    const threshold = g.budLightThreshold;
    const { parent, flags, foliage: leaves, light: nodeLight, sapArea, length, leafBorn, latent, end } = state;
    let photosynthesis = 0;
    let respiration = 0;
    let turnover = 0;
    let leafArea = 0;
    let storeKg = 0;
    let killed = false;
    subP.fill(0, 0, n);
    subR.fill(0, 0, n);
    subT.fill(0, 0, n);
    subStore.fill(0, 0, n);
    subQ.fill(0, 0, n);
    subFoliage.fill(0, 0, n);
    removed.fill(0, 0, n);
    for (let i = n - 1; i >= 0; i -= 1) {
      const nodeFlags = flags[i] ?? 0;
      const pi = parent[i] ?? -1;
      if ((nodeFlags & NODE_DEAD) === 0) {
        let foliage = leaves[i] ?? 0;
        let p = 0;
        const sapwoodKg = (sapArea[i] ?? 0) * (length[i] ?? 0) * species.wood.densityKgM3;
        let r = sapwoodKg * c.sapwoodRespiration;
        let t = 0;
        let store = RESERVE_SHARE_OF_SAPWOOD * sapwoodKg;
        if (foliage > 0) {
          const light = nodeLight[i] ?? 0;
          const midY = 0.5 * ((pi >= 0 ? (end[pi * 3 + 1] ?? 0) : 0) + (end[i * 3 + 1] ?? 0));
          p = lue * lightResponse(light) * foliage * hydraulicGas(midY, maxHeight);
          const leafMass = (foliage / species.leaf.sla) * acclimation(light);
          const upkeep = leafMass * (c.respiration + c.rootPerFoliage * c.rootRespiration);
          const regrown = state.year - (leafBorn[i] ?? 0) > species.leaf.lifespanYears ? c.foliageTurnover : 0;
          const renewal = leafMass * (regrown + c.rootPerFoliage * c.rootTurnover);
          // Short-shoot leaves below their compensation point are shed for good (leaf-level carbon balance).
          if (state.year - (leafBorn[i] ?? 0) > 1 && efficiency * (p - upkeep) < renewal) {
            flags[i] = nodeFlags | NODE_NO_SPUR;
            leaves[i] = 0;
            foliage = 0;
            p = 0;
          } else {
            r += upkeep;
            t = renewal;
            store += leafMass * (1 + c.rootPerFoliage);
          }
        }
        const sp = (subP[i] ?? 0) + p;
        const sr = (subR[i] ?? 0) + r;
        const st = (subT[i] ?? 0) + t;
        subP[i] = sp;
        subR[i] = sr;
        subT[i] = st;
        subStore[i] = (subStore[i] ?? 0) + store;
        subFoliage[i] = (subFoliage[i] ?? 0) + foliage;
        const tip = tipLight[i] ?? 0;
        if (tip >= threshold) subQ[i] = (subQ[i] ?? 0) + ((budAt[i] ?? -1) >= 0 ? tip : 0) + (latent[i] ?? 0) * tip;
        if (i > 0 && (nodeFlags & NODE_AXIS_START) !== 0) {
          if (efficiency * (sp - sr) - st < 0) {
            const deficit = (state.deficit[i] ?? 0) + 1;
            state.deficit[i] = deficit > 255 ? 255 : deficit;
            if (deficit >= c.pruneDeficitYears) {
              removed[i] = 1;
              killed = true;
              continue;
            }
          } else {
            state.deficit[i] = 0;
          }
        }
      }
      if (pi < 0) {
        photosynthesis = subP[i] ?? 0;
        respiration = subR[i] ?? 0;
        turnover = subT[i] ?? 0;
        leafArea = subFoliage[i] ?? 0;
        storeKg = subStore[i] ?? 0;
        continue;
      }
      subP[pi] = (subP[pi] ?? 0) + (subP[i] ?? 0);
      subR[pi] = (subR[pi] ?? 0) + (subR[i] ?? 0);
      subT[pi] = (subT[pi] ?? 0) + (subT[i] ?? 0);
      subStore[pi] = (subStore[pi] ?? 0) + (subStore[i] ?? 0);
      subQ[pi] = (subQ[pi] ?? 0) + (subQ[i] ?? 0);
      subFoliage[pi] = (subFoliage[pi] ?? 0) + (subFoliage[i] ?? 0);
    }
    totals.photosynthesis = photosynthesis;
    totals.respiration = respiration;
    totals.turnover = turnover;
    totals.leafArea = leafArea;
    totals.storeKg = storeKg;
    return killed;
  }

  /** Flag every node under a branch {@link gatherCarbon} killed as dead wood and drop its buds. */
  function markDeadBranches(): void {
    const n = state.nodeCount;
    for (let i = 1; i < n; i += 1) {
      const p = state.parent[i] ?? -1;
      if (removed[i] === 0 && p >= 0 && removed[p] === 1) removed[i] = 1;
      if (removed[i] === 1) {
        state.flags[i] = (state.flags[i] ?? 0) | NODE_DEAD;
        state.foliage[i] = 0;
        state.latent[i] = 0;
        state.deadAge[i] = 0;
        subFoliage[i] = 0;
        subQ[i] = 0;
      }
    }
    dropBuds((node) => isDead(node));
  }

  /**
   * Kill every basal stem past its lifespan and raise a sucker from the collar in its place, keeping
   * the clump's stem count.
   */
  function renewStems(lifespanYears: number): void {
    const n = state.nodeCount;
    removed.fill(0, 0, n);
    let dying = 0;
    let lostHeight = 0;
    for (let i = 1; i < n; i += 1) {
      if ((state.parent[i] ?? -1) !== 0 || ((state.flags[i] ?? 0) & NODE_AXIS_START) === 0 || isDead(i)) continue;
      const [roll] = stepRandomSeed(streamFor(state.nodeId[i] ?? 0, 0x5eed));
      if (state.year - (state.born[i] ?? 0) > lifespanYears * (0.6 + 0.8 * roll)) {
        removed[i] = 1;
        dying += 1;
      }
    }
    if (dying === 0) return;
    for (let i = 1; i < n; i += 1) {
      const p = state.parent[i] ?? -1;
      if (removed[i] === 0 && p >= 0 && removed[p] === 1) removed[i] = 1;
      if (removed[i] === 1) lostHeight = Math.max(lostHeight, state.end[i * 3 + 1] ?? 0);
    }
    markDeadBranches();
    // The sucker shoots up on root reserves in its first season, to half the height of the stem it
    // replaces (Bond & Midgley 2001), as a leafy cane of full-length internodes.
    const internodes = Math.max(1, Math.min(40, Math.round((0.5 * lostHeight) / g.internodeMax)));
    for (let s = 0; s < dying; s += 1) {
      if (state.nodeCount + internodes > nodeCap || state.budCount >= budCap) break;
      const [spin] = stepRandomSeed(streamFor(state.year, 0x5ec0 + s));
      const azimuth = spin * 2 * PLANT_PI;
      heading[0] = 0;
      heading[1] = 1;
      heading[2] = 0;
      lateralDirection(heading, BASAL_STEM_LEAN, azimuth, axisDir);
      let node = addNode(0, 0, NODE_AXIS_START, axisDir, g.internodeMax, azimuth, 1);
      for (let k = 1; k < internodes; k += 1) node = addNode(node, 0, 0, axisDir, g.internodeMax, azimuth + k * 2.4, 1);
      addBud(node);
    }
  }

  function dropBuds(drop: (node: number) => boolean): void {
    let kept = 0;
    for (let b = 0; b < state.budCount; b += 1) {
      const node = state.budNode[b] ?? 0;
      if (drop(node)) continue;
      state.budId[kept] = state.budId[b] ?? 0;
      state.budNode[kept] = node;
      state.budIdle[kept] = state.budIdle[b] ?? 0;
      kept += 1;
    }
    state.budCount = kept;
  }

  /**
   * The year's leaf flush and light. Each live node re-leafs by its short-shoot age and its dormant
   * buds age, then leaves are deposited (lit at the shoot midpoint) and the shadow is propagated; buds
   * read light at the shoot tip. Dead wood just ages.
   */
  function flushAndLight(): void {
    const n = state.nodeCount;
    const { parent, flags, foliage: leaves, end, born, leafBorn, latent, latentAge, metamers, deadAge, flowers } = state;
    const year = state.year;
    field.clear();
    let lowest = Number.POSITIVE_INFINITY;
    let top = 0;
    for (let i = 0; i < n; i += 1) {
      flowers[i] = 0;
      const nodeFlags = flags[i] ?? 0;
      if ((nodeFlags & NODE_DEAD) !== 0) {
        leaves[i] = 0;
        const aged = (deadAge[i] ?? 0) + 1;
        deadAge[i] = aged > 255 ? 255 : aged;
        continue;
      }
      const leafAge = year - (leafBorn[i] ?? 0);
      const foliage = leafAge <= g.spurYears && (nodeFlags & NODE_NO_SPUR) === 0
        ? leafAreaPerNode * (metamers[i] ?? 1) * (i === 0 && year - (born[i] ?? 0) <= 1 ? 0.5 : 1)
        : 0;
      leaves[i] = foliage;
      let buds = latent[i] ?? 0;
      if (buds > 0) {
        const budAge = (latentAge[i] ?? 0) + 1;
        latentAge[i] = budAge > 255 ? 255 : budAge;
        if (budAge > g.dormantBudYears) {
          latent[i] = 0;
          buds = 0;
        }
      }
      const pi = parent[i] ?? -1;
      if (foliage > 0) {
        const my = 0.5 * ((pi >= 0 ? (end[pi * 3 + 1] ?? 0) : 0) + (end[i * 3 + 1] ?? 0));
        const mx = 0.5 * ((pi >= 0 ? (end[pi * 3] ?? 0) : 0) + (end[i * 3] ?? 0));
        const mz = 0.5 * ((pi >= 0 ? (end[pi * 3 + 2] ?? 0) : 0) + (end[i * 3 + 2] ?? 0));
        if (frondShoots) depositFronds(i, mx, my, mz, foliage);
        else midCell[i] = field.deposit(mx, my, mz, foliage);
        if (my < lowest) lowest = my;
      }
      const y = end[i * 3 + 1] ?? 0;
      if (y > top) top = y;
      if (((budAt[i] ?? -1) >= 0 || buds > 0) && y < lowest) lowest = y;
    }
    field.propagate(lowest === Number.POSITIVE_INFINITY ? 0 : lowest);
    const extinction = g.extinction;
    // In an even-aged stand every neighbour is a copy of this plant spacingIndex × its height away.
    field.setPeriod(environment.stand ? Math.max(1, environment.stand.spacingIndex * top) : 0);
    const sky = environment.light;
    let brightest = 0;
    for (let i = 0; i < n; i += 1) {
      state.light[i] = 0;
      tipLight[i] = 0;
      if (((flags[i] ?? 0) & NODE_DEAD) !== 0) continue;
      if ((leaves[i] ?? 0) > 0) {
        const light = frondShoots ? frondLight(i, sky, extinction) : field.lightAtCell(midCell[i] ?? -1, sky, extinction);
        state.light[i] = light;
        if (light > brightest) brightest = light;
      }
      if ((budAt[i] ?? -1) >= 0 || (latent[i] ?? 0) > 0) {
        tipLight[i] = field.lightAt(end[i * 3] ?? 0, end[i * 3 + 1] ?? 0, end[i * 3 + 2] ?? 0, sky, extinction);
      }
    }
    // A shoot starves in deep shade, and one shaded far below the plant's best-lit shoots is shed even
    // in light a lone sapling would live on: the tree feeds its best-paying shoots first, so the
    // interior of an open crown goes leafless and its limbs show.
    const shedBelow = Math.max(g.budLightThreshold, crownShedShare * brightest);
    for (let i = 0; i < n; i += 1) {
      if ((leaves[i] ?? 0) > 0 && (state.light[i] ?? 0) < shedBelow) {
        flags[i] = (flags[i] ?? 0) | NODE_NO_SPUR;
        leaves[i] = 0;
      }
    }
  }

  /** Extended Borchert–Honda: split the root's vigour down the tree by light, with apical control λ. */
  function distributeVigour(): void {
    const n = state.nodeCount;
    const lambda = apicalControlAt(g, state.year);
    vigour.fill(0, 0, n);
    latentShare.fill(0, 0, n);
    budShare.fill(0, 0, state.budCount);
    vigour[0] = 1;
    vigourIndex[0] = 1;
    for (let i = 0; i < n; i += 1) {
      // LIGNUM vigour index: children keep the parent's index scaled by their area over the thickest child's.
      let thickest = 0;
      let main = -1;
      let lateralQ = 0;
      for (let child = firstChild[i] ?? -1; child >= 0; child = nextSibling[child] ?? -1) {
        const childFlags = state.flags[child] ?? 0;
        if ((childFlags & NODE_DEAD) !== 0) continue;
        const area = (state.sapArea[child] ?? 0) + (state.heartArea[child] ?? 0);
        if (area > thickest) thickest = area;
        if ((childFlags & NODE_AXIS_START) === 0 && main < 0) main = child;
        else lateralQ += subQ[child] ?? 0;
      }
      for (let child = firstChild[i] ?? -1; child >= 0; child = nextSibling[child] ?? -1) {
        const area = (state.sapArea[child] ?? 0) + (state.heartArea[child] ?? 0);
        vigourIndex[child] = thickest > 0 ? ((vigourIndex[i] ?? 0) * area) / thickest : 0;
      }
      const v = vigour[i] ?? 0;
      state.vigour[i] = v;
      if (v <= 0 || isDead(i)) continue;
      const tip = tipLight[i] ?? 0;
      const lit = tip >= g.budLightThreshold ? tip : 0;
      const latent = state.latent[i] ?? 0;
      lateralQ += latent * lit;
      const bud = budAt[i] ?? -1;
      const mainQ = main >= 0 ? (subQ[main] ?? 0) : bud >= 0 ? lit : 0;
      const denominator = lambda * mainQ + (1 - lambda) * lateralQ;
      if (denominator <= 0) continue;
      const mainShare = (v * lambda * mainQ) / denominator;
      const lateralShare = v - mainShare;
      if (main >= 0) vigour[main] = mainShare;
      else if (bud >= 0) budShare[bud] = mainShare;
      if (lateralQ <= 0) continue;
      for (let child = firstChild[i] ?? -1; child >= 0; child = nextSibling[child] ?? -1) {
        if (child === main || isDead(child)) continue;
        vigour[child] = (lateralShare * (subQ[child] ?? 0)) / lateralQ;
      }
      if (latent > 0 && lit > 0) latentShare[i] = (lateralShare * lit) / lateralQ;
    }
  }

  /** Carbon of one new metamer itself: its leaves, their fine roots and its wood with coarse roots. */
  const metamerWoodKg = shootArea * g.internodeMax * species.wood.densityKgM3 * (1 + c.coarseRootShare);
  let metamerCostKg = (leafAreaPerNode / species.leaf.sla) * (1 + c.rootPerFoliage) + metamerWoodKg;

  /** Leaf area and metamer cost of the fronds grown this year. */
  function syncLeafArea(): void {
    if (g.frondEstablishmentYears === undefined) return;
    leafAreaPerNode = leafAreaIn(state.year);
    metamerCostKg = (leafAreaPerNode / species.leaf.sla) * (1 + c.rootPerFoliage) + metamerWoodKg;
  }

  function collectCandidates(): void {
    let count = 0;
    for (let b = 0; b < state.budCount; b += 1) {
      const share = budShare[b] ?? 0;
      if (share <= 0) continue;
      candidates.share[count] = share;
      candidates.costKg[count] = metamerCostKg;
      const node = state.budNode[b] ?? 0;
      candidates.node[count] = node;
      candidates.maxMetamers[count] = metamerCap(state.dir[node * 3 + 1] ?? 1, vigourIndex[node] ?? 0, tipLight[node] ?? 0);
      candidates.copies[count] = 1;
      candidates.opensAxis[count] = 0;
      candidateRef[count] = b;
      count += 1;
    }
    const lateralStart = count;
    for (let i = 0; i < state.nodeCount; i += 1) {
      const share = latentShare[i] ?? 0;
      if (share <= 0) continue;
      const latent = state.latent[i] ?? 1;
      // Each dormant bud on the node takes its own slice of the node's lateral vigour.
      candidates.share[count] = share / latent;
      candidates.costKg[count] = metamerCostKg;
      candidates.node[count] = i;
      const parentArea = (state.sapArea[i] ?? 0) + (state.heartArea[i] ?? 0);
      const lateralIndex = parentArea > 0 ? ((vigourIndex[i] ?? 0) * shootArea) / parentArea : 0;
      candidates.maxMetamers[count] = metamerCap((state.dir[i * 3 + 1] ?? 1) * cosBranch, lateralIndex, tipLight[i] ?? 0);
      candidates.copies[count] = latent;
      candidates.opensAxis[count] = 1;
      candidateRef[count] = -1 - i;
      count += 1;
    }
    candidates.count = count;
    // The bud cap keeps only the strongest lateral buds in play, so it never throttles existing tips.
    // A lateral it refuses still grows, as a leafy short shoot on its node: the cap bounds how much
    // skeleton is drawn, not how much leaf area the tree's carbon buys.
    const lateralEnd = count;
    const freeBuds = budCap - state.budCount;
    let copies = 0;
    for (let k = lateralStart; k < lateralEnd; k += 1) copies += candidates.copies[k] ?? 0;
    budSlotsShort = copies > freeBuds;
    if (!budSlotsShort) return;
    if (freeBuds <= 0) {
      for (let k = lateralStart; k < lateralEnd; k += 1) toShortShoot(k);
      return;
    }
    // Threshold share t: every bud above t fits, buds at t fill the rest in candidate order. With each
    // node's share listed once per bud, t is the free-th largest entry.
    let listed = 0;
    for (let k = lateralStart; k < lateralEnd; k += 1) {
      const share = candidates.share[k] ?? 0;
      for (let copy = candidates.copies[k] ?? 0; copy > 0; copy -= 1) {
        shareScratch[listed] = share;
        listed += 1;
      }
    }
    const threshold = selectNth(shareScratch, listed, listed - freeBuds);
    let room = freeBuds;
    for (let k = lateralStart; k < lateralEnd; k += 1) if ((candidates.share[k] ?? 0) > threshold) room -= candidates.copies[k] ?? 0;
    for (let k = lateralStart; k < lateralEnd; k += 1) {
      const share = candidates.share[k] ?? 0;
      if (share > threshold) continue;
      if (share < threshold || room <= 0) {
        toShortShoot(k);
        continue;
      }
      const have = candidates.copies[k] ?? 0;
      const take = have < room ? have : room;
      room -= take;
      if (take === have) continue;
      // The buds past the room grow as short shoots beside the ones that took a slot.
      const extra = candidates.count;
      candidates.share[extra] = share;
      candidates.costKg[extra] = candidates.costKg[k] ?? metamerCostKg;
      candidates.node[extra] = candidates.node[k] ?? 0;
      candidates.maxMetamers[extra] = candidates.maxMetamers[k] ?? 1;
      candidates.copies[extra] = have - take;
      candidates.opensAxis[extra] = 2;
      candidateRef[extra] = shortShootRef(candidates.node[k] ?? 0);
      candidates.count = extra + 1;
      candidates.copies[k] = take;
    }
  }

  function shortShootRef(node: number): number {
    return -1 - nodeCap - node;
  }

  function toShortShoot(k: number): void {
    candidates.opensAxis[k] = 2;
    candidateRef[k] = shortShootRef(candidates.node[k] ?? 0);
  }

  /** Add `metamers` leafy short-shoot metamers to a node's leaf pool; returns how many fit. */
  function addShortShoots(node: number, metamers: number): number {
    const leafy = (state.foliage[node] ?? 0) > 0 ? leafMetamers(node) : 0;
    const room = 255 - leafy;
    const add = metamers < room ? metamers : room;
    if (add <= 0) return 0;
    state.leafBorn[node] = Math.floor(((state.leafBorn[node] ?? 0) * leafy + state.year * add) / (leafy + add) + 0.5);
    setLeafMetamers(node, leafy + add, leafAreaPerNode * (leafy + add));
    return add;
  }

  /** Tropism weights per branch order for the current environment and year; cleared when either changes. */
  const weightsByOrder: (TropismWeights | undefined)[] = [];
  let weightsYear = -1;

  function weightsFor(order: number): TropismWeights {
    if (weightsYear !== state.year) {
      weightsByOrder.length = 0;
      weightsYear = state.year;
    }
    const cached = weightsByOrder[order];
    if (cached) return cached;
    const weights = computeWeights(order);
    weightsByOrder[order] = weights;
    return weights;
  }

  function computeWeights(order: number): TropismWeights {
    let gravity = g.tropism.gravity;
    for (let k = 0; k < order; k += 1) gravity *= g.tropism.gravityOrderDecay;
    const windAngle = (environment.wind.dir * PLANT_PI) / 180;
    const strength = environment.wind.strength * g.tropism.wind;
    // Apical control holds laterals out at their set point; as it fades they turn up into codominant
    // stems, so a decurrent crown divides into upright limbs while an excurrent one keeps level branches
    // (Wilson 2000, apical control of branch angle).
    const release = apicalControlAt(g, state.year) / Math.max(1e-6, g.apicalControl);
    const setpointDeg = order === 0 ? 0 : Math.min(g.tropism.setpointMax, g.tropism.setpointAngle * release + (order - 1) * g.tropism.setpointPerOrder);
    const setpoint = (setpointDeg * PLANT_PI) / 180;
    return {
      optimal: g.tropism.optimal,
      gravity,
      setpointCos: plantCos(setpoint),
      setpointSin: plantSin(setpoint),
      wind: strength,
      windX: strength === 0 ? 0 : plantSin(windAngle),
      windZ: strength === 0 ? 0 : plantCos(windAngle),
      jitter: g.jitter,
    };
  }

  function growShoot(fromNode: number, order: number, firstFlags: number, metamers: number, startDir: Float64Array, startPhase: number, stream: RandomSeed): number {
    let cursor = stream;
    const weights = weightsFor(order);
    field.optimalDirection(state.end[fromNode * 3] ?? 0, state.end[fromNode * 3 + 1] ?? 0, state.end[fromNode * 3 + 2] ?? 0, optimal);
    heading[0] = startDir[0] ?? 0;
    heading[1] = startDir[1] ?? 1;
    heading[2] = startDir[2] ?? 0;
    // The annual shoot is one node along the chord of its metamers, each bent by the tropisms.
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let m = 0; m < metamers; m += 1) {
      const [ra, c1] = stepRandomSeed(cursor);
      const [rb, c2] = stepRandomSeed(c1);
      const [rc, c3] = stepRandomSeed(c2);
      cursor = c3;
      bendTowardsTropisms(heading, optimal, weights, ra, rb, rc);
      cx += heading[0] ?? 0;
      cy += heading[1] ?? 0;
      cz += heading[2] ?? 0;
    }
    axisDir[0] = cx;
    axisDir[1] = cy;
    axisDir[2] = cz;
    normalize3(axisDir);
    const height = (state.end[fromNode * 3 + 1] ?? 0) + 0.5 * metamers * g.internodeMax * (axisDir[1] ?? 0);
    const length = metamers * g.internodeMax * hydraulicFactor(height, species.limits.maxHeightM * c.hydraulicHeightShare);
    return addNode(fromNode, order, firstFlags, axisDir, length, startPhase + (metamers - 1) * divergence, metamers);
  }

  /** Grow every candidate at vigour scale α; returns the metamers added as short shoots. */
  function grow(scale: number): number {
    if (scale <= 0) return 0;
    const year = state.year;
    const lambda = apicalControlAt(g, year);
    const budsBefore = state.budCount;
    let shortMetamers = 0;
    for (let k = 0; k < candidates.count; k += 1) {
      const raw = Math.floor(scale * (candidates.share[k] ?? 0));
      if (raw < 1) continue;
      const cap = candidates.maxMetamers[k] ?? 1;
      const metamers = raw > cap ? cap : raw;
      const ref = candidateRef[k] ?? 0;
      if (ref < -nodeCap) {
        const node = -1 - nodeCap - ref;
        const available = state.latent[node] ?? 0;
        const want = candidates.copies[k] ?? 1;
        const used = want < available ? want : available;
        if (used === 0) continue;
        state.latent[node] = available - used;
        shortMetamers += addShortShoots(node, metamers * used);
      } else if (ref >= 0) {
        if (ref >= budsBefore) continue;
        const node = state.budNode[ref] ?? 0;
        axisDir[0] = state.dir[node * 3] ?? 0;
        axisDir[1] = state.dir[node * 3 + 1] ?? 1;
        axisDir[2] = state.dir[node * 3 + 2] ?? 0;
        const tip = growShoot(node, state.order[node] ?? 0, 0, metamers, axisDir, (state.phase[node] ?? 0) + divergence, streamFor(state.budId[ref] ?? 0, year));
        state.budNode[ref] = tip;
        state.budIdle[ref] = 0;
      } else {
        const node = -1 - ref;
        const copies = candidates.copies[k] ?? 1;
        for (let copy = 0; copy < copies; copy += 1) {
          const available = state.latent[node] ?? 0;
          if (available === 0 || state.budCount >= budCap || state.nodeCount + metamers > nodeCap) break;
          const slot = g.lateralBudsPerNode - available;
          state.latent[node] = available - 1;
          const stream = streamFor(((state.nodeId[node] ?? 0) * 8 + slot) | 0x40000000, year);
          const [tilt, next] = stepRandomSeed(stream);
          axisDir[0] = state.dir[node * 3] ?? 0;
          axisDir[1] = state.dir[node * 3 + 1] ?? 1;
          axisDir[2] = state.dir[node * 3 + 2] ?? 0;
          const azimuth = (state.phase[node] ?? 0) + (slot * 2 * PLANT_PI) / Math.max(1, g.lateralBudsPerNode);
          lateralDirection(axisDir, branchAngle + g.jitter * (tilt - 0.5), azimuth, heading);
          axisDir[0] = heading[0] ?? 0;
          axisDir[1] = heading[1] ?? 1;
          axisDir[2] = heading[2] ?? 0;
          // As apical control λ falls below about 0.5 a lateral draws more vigour per unit light than the
          // stem it leaves, so one breaking near a stem's tip may overtop the leader: it keeps the stem's
          // order and grows upright beside it as a codominant stem, and a decurrent crown divides into
          // several (Brown, McAlpine & Kormanik 1967; Zimmermann & Brown 1971). The chance rises smoothly
          // as λ falls, so a small change of λ makes a small change of crown, and falls with the bud's
          // light: neighbours' shade strengthens apical dominance (Franklin 2008), so a stand-grown tree
          // keeps a single bole where the same tree in the open divides.
          const parentOrder = state.order[node] ?? 0;
          const [roll, after] = stepRandomSeed(next);
          const codominant = parentOrder === 0 && year - (state.born[node] ?? 0) <= 1 && roll < codominantChance(lambda, tipLight[node] ?? 0) / lateralsPerShoot;
          const order = codominant ? 0 : Math.min(255, parentOrder + 1);
          const tip = growShoot(node, order, NODE_AXIS_START, metamers, axisDir, azimuth + PLANT_PI / 2, after);
          addBud(tip);
        }
      }
    }
    return shortMetamers;
  }

  /**
   * A tip that stays shaded dies after `budDeathYears`. So does a lateral tip that keeps losing the
   * vigour contest in years more laterals wanted to break than the bud cap had room for: correlative
   * inhibition (Sachs & Novoplansky 1995) hands its slot to a new lateral, so the cap never freezes an
   * old crown on idle tips. Below the cap, idle tips wait, as suppressed buds do.
   */
  function ageBuds(competed: boolean): void {
    let kept = 0;
    for (let b = 0; b < state.budCount; b += 1) {
      const node = state.budNode[b] ?? 0;
      let idle = state.budIdle[b] ?? 0;
      if ((state.born[node] ?? 0) !== state.year) {
        if ((tipLight[node] ?? 0) < g.budLightThreshold || (competed && (state.order[node] ?? 0) > 0)) idle += 1;
        if (idle > g.budDeathYears) continue;
      }
      state.budId[kept] = state.budId[b] ?? 0;
      state.budNode[kept] = node;
      state.budIdle[kept] = Math.min(255, idle);
      kept += 1;
    }
    state.budCount = kept;
  }

  function placeFlowers(budgetKg: number): void {
    const flowerKg = 3 * species.reproduction.seedMassMg * 1e-6;
    const count = Math.floor(budgetKg / flowerKg);
    if (count <= 0) return;
    let weight = 0;
    for (let i = 0; i < state.nodeCount; i += 1) {
      if ((state.foliage[i] ?? 0) > 0 && state.year - (state.born[i] ?? 0) <= 2 && (state.light[i] ?? 0) > 0.5) weight += state.light[i] ?? 0;
    }
    if (weight <= 0) return;
    for (let i = 0; i < state.nodeCount; i += 1) {
      if ((state.foliage[i] ?? 0) > 0 && state.year - (state.born[i] ?? 0) <= 2 && (state.light[i] ?? 0) > 0.5) {
        state.flowers[i] = Math.min(65535, Math.floor((count * (state.light[i] ?? 0)) / weight));
      }
    }
  }

  function leafMetamers(i: number): number {
    return ((state.flags[i] ?? 0) & NODE_NO_SPUR) !== 0 ? 0 : (state.metamers[i] ?? 0);
  }

  /** Pool node `from`'s leaf cohort into node `into`'s, keeping the leaf-weighted mean flush year. */
  function poolLeaves(into: number, from: number): void {
    const a = leafMetamers(into);
    const b = leafMetamers(from);
    if (a + b > 0) {
      const year = ((state.leafBorn[into] ?? 0) * a + (state.leafBorn[from] ?? 0) * b) / (a + b);
      state.leafBorn[into] = Math.floor(year + 0.5);
    }
    setLeafMetamers(into, a + b, (state.foliage[into] ?? 0) + (state.foliage[from] ?? 0));
  }

  function setLeafMetamers(i: number, metamers: number, foliage: number): void {
    state.metamers[i] = metamers;
    state.foliage[i] = foliage;
    if (metamers > 0) state.flags[i] = (state.flags[i] ?? 0) & ~NODE_NO_SPUR;
    else state.flags[i] = (state.flags[i] ?? 0) | NODE_NO_SPUR;
  }

  /**
   * A tip twig that stopped growing (no bud, no live lateral buds, older than the bud lifetime) folds its
   * leaves into its parent's leaf pool and leaves the arrays.
   */
  function foldTwig(i: number): void {
    if (i === 0 || (budAt[i] ?? -1) >= 0 || (state.latent[i] ?? 0) > 0 || (state.flowers[i] ?? 0) > 0) return;
    if (state.year - (state.born[i] ?? 0) <= g.dormantBudYears) return;
    let target = state.parent[i] ?? -1;
    if (target < 0) return;
    if (removed[target] === 2) target = remap[target] ?? target;
    if (removed[target] !== 0 || isDead(target)) return;
    const leafy = leafMetamers(target) + leafMetamers(i);
    if (leafy > 255) return;
    poolLeaves(target, i);
    removed[i] = 3;
  }

  /**
   * Drop long-dead branches (leaving a scar), fold finished twigs into their parent's leaf pool and merge
   * straight internodes, keeping creation order.
   */
  function compact(): void {
    const n = state.nodeCount;
    // Child lists are current: growth appends to them and nothing else changes the topology.
    indexBuds();
    removed.fill(0, 0, n);
    for (let i = 0; i < n; i += 1) remap[i] = i;
    for (let i = 1; i < n; i += 1) {
      if (removed[i] === 1) continue;
      const p = state.parent[i] ?? -1;
      if (p >= 0 && removed[p] === 1) {
        removed[i] = 1;
        continue;
      }
      // A living tree sheds its dead limbs; a dead one falls apart from the twigs in.
      const standing = state.alive === 0;
      if (isDead(i) && p >= 0 && (standing || !isDead(p))) {
        if ((state.deadAge[i] ?? 0) > deadwoodYears(radiusCmOf(i), standing)) {
          removed[i] = 1;
          state.flags[p] = (state.flags[p] ?? 0) | NODE_SCAR;
        }
      }
    }
    for (let i = 0; i < n; i += 1) {
      if (removed[i] === 2 || removed[i] === 3) continue;
      if (removed[i] === 1) {
        state.shedKg += ((state.sapArea[i] ?? 0) + (state.heartArea[i] ?? 0)) * (state.length[i] ?? 0) * species.wood.densityKgM3;
        continue;
      }
      if (isDead(i)) continue;
      // Each year's palm or fern shoot keeps its own fronds, so they age and fall as one cohort.
      if (frondShoots) continue;
      if ((childCount[i] ?? 0) === 0) {
        foldTwig(i);
        continue;
      }
      if ((childCount[i] ?? 0) !== 1) continue;
      const child = firstChild[i] ?? -1;
      if (child < 0 || removed[child] !== 0 || isDead(child)) continue;
      if (((state.flags[child] ?? 0) & NODE_AXIS_START) !== 0) continue;
      if ((budAt[i] ?? -1) >= 0 || (state.latent[i] ?? 0) > 0) continue;
      if ((state.flowers[i] ?? 0) > 0 || (state.flowers[child] ?? 0) > 0) continue;
      if (((state.flags[i] ?? 0) & NODE_SCAR) !== 0) continue;
      const length = (state.length[i] ?? 0) + (state.length[child] ?? 0);
      const settled = state.year - (state.born[child] ?? 0) > SETTLED_WOOD_YEARS;
      if (length > (settled ? SETTLED_MERGE_MAX_LENGTH_M : MERGE_MAX_LENGTH_M)) continue;
      const dot = (state.dir[i * 3] ?? 0) * (state.dir[child * 3] ?? 0) + (state.dir[i * 3 + 1] ?? 0) * (state.dir[child * 3 + 1] ?? 0) + (state.dir[i * 3 + 2] ?? 0) * (state.dir[child * 3 + 2] ?? 0);
      if (dot < (settled ? SETTLED_MERGE_COS : MERGE_COS)) continue;
      const leafy = leafMetamers(i) + leafMetamers(child);
      if (leafy > 255) continue;
      const p = state.parent[i] ?? -1;
      const sx = p >= 0 ? (state.end[p * 3] ?? 0) : 0;
      const sy = p >= 0 ? (state.end[p * 3 + 1] ?? 0) : 0;
      const sz = p >= 0 ? (state.end[p * 3 + 2] ?? 0) : 0;
      heading[0] = (state.end[child * 3] ?? 0) - sx;
      heading[1] = (state.end[child * 3 + 1] ?? 0) - sy;
      heading[2] = (state.end[child * 3 + 2] ?? 0) - sz;
      normalize3(heading);
      for (let k = 0; k < 3; k += 1) {
        state.dir[i * 3 + k] = heading[k] ?? 0;
        state.end[i * 3 + k] = state.end[child * 3 + k] ?? 0;
      }
      state.length[i] = length;
      poolLeaves(i, child);
      state.latent[i] = state.latent[child] ?? 0;
      state.latentAge[i] = state.latentAge[child] ?? 0;
      state.flags[i] = (state.flags[i] ?? 0) | ((state.flags[child] ?? 0) & NODE_SCAR);
      removed[child] = 2;
      remap[child] = i;
    }
    // One forward pass gives every node its new index: survivors come before the nodes merged into
    // them, so a merged node reads its survivor's final index.
    let kept = 0;
    for (let i = 0; i < n; i += 1) {
      const fate = removed[i] ?? 0;
      if (fate === 2) {
        remap[i] = remap[remap[i] ?? 0] ?? -1;
        continue;
      }
      if (fate !== 0) {
        remap[i] = -1;
        continue;
      }
      const target = state.parent[i] ?? -1;
      keptParent[kept] = target >= 0 ? (remap[target] ?? -1) : -1;
      remap[i] = kept;
      kept += 1;
    }
    // Survivors move down in runs, one block copy per field per run; parents are rewritten after.
    movedArrays.length = 0;
    movedWidths.length = 0;
    for (const name of NODE_FIELDS) {
      if (name === "parent") continue;
      movedArrays.push(state[name]);
      movedWidths.push(fieldWidth(name));
    }
    let to = 0;
    for (let i = 0; i < n; ) {
      if (removed[i] !== 0) {
        i += 1;
        continue;
      }
      let end = i + 1;
      while (end < n && removed[end] === 0) end += 1;
      if (to !== i) moveNodes(i, end, to);
      to += end - i;
      i = end;
    }
    state.parent.set(keptParent.subarray(0, kept));
    state.nodeCount = kept;
    let budsKept = 0;
    for (let b = 0; b < state.budCount; b += 1) {
      const node = remap[state.budNode[b] ?? 0] ?? -1;
      if (node < 0) continue;
      state.budId[budsKept] = state.budId[b] ?? 0;
      state.budNode[budsKept] = node;
      state.budIdle[budsKept] = state.budIdle[b] ?? 0;
      budsKept += 1;
    }
    state.budCount = budsKept;
  }

  function moveNodes(from: number, end: number, to: number): void {
    for (let k = 0; k < movedArrays.length; k += 1) {
      const width = movedWidths[k] ?? 1;
      movedArrays[k]?.copyWithin(to * width, from * width, end * width);
    }
  }

  function stepYear(): void {
    state.year += 1;
    syncLeafArea();
    const n = state.nodeCount;
    if (state.alive === 0) {
      for (let i = 0; i < n; i += 1) state.deadAge[i] = Math.min(255, (state.deadAge[i] ?? 0) + 1);
      compact();
      return;
    }
    if (g.stemLifespanYears !== undefined) renewStems(g.stemLifespanYears);
    buildChildren();
    indexBuds();
    flushAndLight();
    if (gatherCarbon()) {
      markDeadBranches();
      indexBuds();
    }
    lastPhotosynthesis = totals.photosynthesis;
    lastLeafArea = totals.leafArea;
    let budget = c.growthEfficiency * (totals.photosynthesis - totals.respiration) - totals.turnover + state.reserveKg;
    state.reserveKg = 0;
    const upkeep = totals.turnover + totals.respiration;
    state.health = upkeep > 0 ? Math.max(0, Math.min(1, (c.growthEfficiency * totals.photosynthesis) / upkeep / 1.5)) : 1;
    if (budget <= 0 || (state.budCount === 0 && totals.leafArea <= 0)) {
      state.stressYears += 1;
      if (state.stressYears >= 5) die();
      ageBuds(false);
      compact();
      return;
    }
    state.stressYears = 0;
    if (state.year >= species.reproduction.firstFlowerYears) {
      const reproduction = budget * c.reproductiveShare;
      budget -= reproduction;
      placeFlowers(reproduction);
    }
    distributeVigour();
    collectCandidates();
    pipeCost.prepare(state, subFoliage, candidates.node, candidates.count);
    // The pipe cost of no new shoots (da Vinci joins aside) bounds whether any carbon is left to grow.
    pipeCost.begin();
    if (budget <= pipeCost.total()) {
      // Every gram goes to the pipe the leaves already need; nothing is left to store.
      const thickening = pipeDemand(state, species, subFoliage, firstChild, nextSibling, need);
      applyThickening(state, species, subFoliage, need, thickening > 0 ? Math.min(1, budget / thickening) : 0);
      ageBuds(false);
      compact();
      return;
    }
    const scale = solveShootScale(candidates, {
      carbonKg: budget,
      freeNodes: nodeCap - state.nodeCount,
      freeBuds: budCap - state.budCount,
      leafAreaPerMetamer: leafAreaPerNode,
    }, pipeCost);
    const before = state.nodeCount;
    let grown = grow(scale);
    for (let i = before; i < state.nodeCount; i += 1) grown += state.metamers[i] ?? 0;
    const spent = grown * metamerCostKg;
    appendChildren(before);
    const finalThickening = pipeDemand(state, species, subFoliage, firstChild, nextSibling, need, pressler);
    const left = budget - spent;
    const share = finalThickening <= 0 ? 1 : Math.max(0, Math.min(1, left / finalThickening));
    let unspent = left - finalThickening * share;
    // Unspent carbon is stored as reserve up to what living tissue can hold; beyond that it goes into
    // wider rings, laid down in proportion to the leaf area each internode carries (Pressler's rule).
    // A palm or fern has no cambium to lay rings with, so its surplus is respired.
    let surplusPerFoliage = 0;
    if (unspent > totals.storeKg) {
      if (cambium && pressler.pressler > 0) surplusPerFoliage = (unspent - totals.storeKg) / pressler.pressler;
      unspent = totals.storeKg;
    }
    state.reserveKg = Math.max(0, unspent);
    ageBuds(scale > 0 && budSlotsShort);
    applySag(state, species, sag, { foliageAbove: subFoliage, need, share, surplusPerFoliage });
    // A branch tip pressed to the ground loses its bud: dark, scraped and browsed, it grows no further.
    dropBuds((node) => (state.order[node] ?? 0) > 0 && (state.end[node * 3 + 1] ?? 1) < GROUND_TIP_M);
    compact();
    if (state.nodeCount > maxNodesSeen) maxNodesSeen = state.nodeCount;
    if (state.budCount > maxBudsSeen) maxBudsSeen = state.budCount;
  }

  function sapwoodAtBreastHeight(): number {
    let area = 0;
    for (let i = 0; i < state.nodeCount; i += 1) {
      if ((state.order[i] ?? 0) !== 0) continue;
      const p = state.parent[i] ?? -1;
      const startY = p >= 0 ? (state.end[p * 3 + 1] ?? 0) : 0;
      if (startY <= BREAST_HEIGHT_M && (state.end[i * 3 + 1] ?? 0) > BREAST_HEIGHT_M) area += state.sapArea[i] ?? 0;
    }
    return area;
  }

  function snapshotArrays(): Record<string, string> {
    const arrays: Record<string, string> = {};
    for (const name of NODE_FIELDS) {
      const array = state[name];
      const used = array.subarray(0, state.nodeCount * fieldWidth(name));
      arrays[name] = bytesToBase64(new Uint8Array(used.buffer, used.byteOffset, used.byteLength));
    }
    for (const name of BUD_FIELDS) {
      const array = state[name];
      const used = array.subarray(0, state.budCount);
      arrays[name] = bytesToBase64(new Uint8Array(used.buffer, used.byteOffset, used.byteLength));
    }
    return arrays;
  }

  germinate();

  const growth: PlantGrowth = {
    step(years = 1) {
      for (let y = 0; y < years; y += 1) stepYear();
    },
    ageYears: () => state.year,
    structure(dayOfYear = 200) {
      return buildPlantStructure({
        species,
        seed,
        dayOfYear,
        season,
        state,
      });
    },
    stats: () => ({
      ageYears: state.year,
      alive: state.alive === 1,
      nodes: state.nodeCount,
      buds: state.budCount,
      maxNodesSeen,
      maxBudsSeen,
      health: state.health,
      photosynthesisKg: lastPhotosynthesis,
      leafAreaM2: lastLeafArea,
      sapwoodAtBreastHeightM2: sapwoodAtBreastHeight(),
      shedKg: state.shedKg,
      decayClass: decayClass(),
    }),
    snapshot() {
      const scalars: Record<string, number> = {};
      for (const name of SCALAR_FIELDS) scalars[name] = state[name];
      scalars["lastPhotosynthesis"] = lastPhotosynthesis;
      scalars["lastLeafArea"] = lastLeafArea;
      scalars["maxNodesSeen"] = maxNodesSeen;
      scalars["maxBudsSeen"] = maxBudsSeen;
      return {
        simVersion: PLANT_SIM_VERSION,
        speciesId: species.id,
        speciesVersion: species.version,
        seed,
        limits: { maxBuds: budCap, maxNodes: nodeCap },
        individual,
        env: copyEnvironment(environment),
        scalars,
        arrays: snapshotArrays(),
      };
    },
    restore(snapshot) {
      if (snapshot.simVersion !== PLANT_SIM_VERSION) throw new Error(`plant snapshot: sim version ${snapshot.simVersion}, expected ${PLANT_SIM_VERSION}`);
      if (snapshot.speciesId !== species.id || snapshot.speciesVersion !== species.version) {
        throw new Error(`plant snapshot: species ${snapshot.speciesId}@${snapshot.speciesVersion}, expected ${species.id}@${species.version}`);
      }
      if (snapshot.seed !== seed) throw new Error(`plant snapshot: seed ${snapshot.seed}, expected ${seed}`);
      if (snapshot.individual !== individual) throw new Error(`plant snapshot: ${snapshot.individual} individual, expected ${individual}`);
      const next = createGrowthState(nodeCap, budCap);
      for (const name of SCALAR_FIELDS) next[name] = snapshot.scalars[name] ?? 0;
      if (next.nodeCount > nodeCap || next.budCount > budCap) throw new Error("plant snapshot: larger than this plant's caps");
      const fields: readonly (typeof NODE_FIELDS[number] | typeof BUD_FIELDS[number])[] = [...NODE_FIELDS, ...BUD_FIELDS];
      for (const name of fields) {
        const encoded = snapshot.arrays[name];
        if (encoded === undefined) throw new Error(`plant snapshot: missing ${name}`);
        const bytes = base64ToBytes(encoded);
        new Uint8Array(next[name].buffer).set(bytes);
      }
      state = next;
      syncLeafArea();
      environment = copyEnvironment(snapshot.env);
      weightsByOrder.length = 0;
      season = growingSeason(species, environment);
      site = siteModifier(environment);
      lastPhotosynthesis = snapshot.scalars["lastPhotosynthesis"] ?? 0;
      lastLeafArea = snapshot.scalars["lastLeafArea"] ?? 0;
      maxNodesSeen = snapshot.scalars["maxNodesSeen"] ?? state.nodeCount;
      maxBudsSeen = snapshot.scalars["maxBudsSeen"] ?? state.budCount;
    },
    reset() {
      germinate();
    },
    retune(change) {
      environment = copyEnvironment({ ...environment, ...change });
      weightsByOrder.length = 0;
      season = growingSeason(species, environment);
      site = siteModifier(environment);
    },
    environment: () => copyEnvironment(environment),
    kill() {
      if (state.alive === 1) die();
    },
  };
  return growth;
}


function copyEnvironment(env: PlantEnvironment): PlantEnvironment {
  const { stand, ...rest } = env;
  return { ...rest, wind: { ...env.wind }, slope: { ...env.slope }, ...(stand ? { stand: { ...stand } } : {}) };
}

/**
 * Codominant stems a stem tip puts out per year: none at λ 0.6, rising to one every two years at λ 0.3
 * in full light, so a decurrent crown divides every few years rather than all at once; none below
 * half light.
 */
function codominantChance(lambda: number, light: number): number {
  const lit = Math.min(1, Math.max(0, (light - 0.5) / 0.4));
  return 0.5 * lit * Math.min(1, Math.max(0, (0.6 - lambda) / 0.3));
}

/**
 * Share of a tree's best-lit shoot's light below which a shoot sheds its leaves, from shade tolerance
 * 0..1: 0.05 for the most tolerant, 0.25 for the least. A shoot pays its way only above its effective
 * compensation point, which counts the wood that feeds it (Givnish 1988), and a tree sends water and
 * nutrients to its best-paying shoots first, so tolerant trees prune at lower light (Kothari et al.
 * 2025). The ends are set so tolerant broadleaves hold their leaves in an outer shell (Horn 1971).
 */
function crownShedLightShare(shadeTolerance: number): number {
  const t = Math.min(1, Math.max(0, shadeTolerance));
  return 0.25 - 0.2 * t;
}

/** λ at an age: from the young value towards the mature one, halfway at `apicalControlHalfYears`. */
function apicalControlAt(g: PlantSpecies["growth"], ageYears: number): number {
  const half = g.apicalControlHalfYears;
  return g.apicalControlMature + ((g.apicalControl - g.apicalControlMature) * half) / (half + ageYears);
}

/** Ryan & Yoder hydraulic limitation along a water path: 1 − (path / maxPath)^p, floored at 0. */
function hydraulicFactorWith(path: number, maxPath: number, exponent: number): number {
  const ratio = path > 0 ? path / maxPath : 0;
  let power = 1;
  for (let k = 0; k < exponent; k += 1) power *= ratio;
  return power >= 1 ? 0 : 1 - power;
}
