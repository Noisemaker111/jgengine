// @skill jgengine-world
import { hashString, randomSeedFrom, stepRandomSeed, type RandomSeed } from "../../random/rng";
import type { PlantSpecies } from "../species/plantSpecies";
import { buildPlantStructure, type PlantStructure } from "../structure/plantStructure";
import { applySag, createSagScratch, placeNodes } from "./biomechanics";
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
import { siteModifier, type PlantEnvironment } from "./plantEnvironment";
import { PLANT_PI, plantCos, plantSin } from "./plantMath";
import { applyThickening, createPipeCost, pipeDemand } from "./pipeModel";
import { bendTowardsTropisms, lateralDirection, normalize3, type TropismWeights } from "./tropism";

/** Bumped whenever a rule changes what a seed grows into; part of every structure cache key. */
export const PLANT_SIM_VERSION = 1;

/** Caps that bound one plant's memory and per-year work. */
export interface GrowthLimits {
  /** Most growing shoot tips (terminal buds) alive at once. */
  maxBuds: number;
  /** Most internodes alive at once. */
  maxNodes: number;
}

/** Most buds and nodes a plant may hold: 4000 and 60000. */
export const DEFAULT_GROWTH_LIMITS: GrowthLimits = { maxBuds: 4000, maxNodes: 60000 };

/** A grown plant's whole state as JSON-safe values: typed arrays travel as base64. */
export interface PlantGrowthSnapshot {
  simVersion: number;
  speciesId: string;
  speciesVersion: number;
  seed: string;
  limits: GrowthLimits;
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
  shedKg: number;
}

const CELL_M = 0.5;
const SEEDLING_LENGTH_M = 0.04;
const MERGE_COS = 0.985;
const MERGE_MAX_LENGTH_M = 3;
/** Wood older than this may merge across a wider bend: its shape is set and only the node budget matters. */
const SETTLED_WOOD_YEARS = 8;
const SETTLED_MERGE_COS = 0.906;
const SETTLED_MERGE_MAX_LENGTH_M = 6;
/** Share of sapwood dry mass that can be held as non-structural carbohydrate reserve. */
const RESERVE_SHARE_OF_SAPWOOD = 0.1;

/**
 * Grow one plant from seed with a biology simulation: Palubicki 2009 bud self-organisation on shadow
 * voxels with extended Borchert–Honda vigour, a LIGNUM carbon balance that pays for every shoot and
 * ring, pipe-model thickening, tropisms, gravitational sag and self-pruning of branches that cannot
 * pay for themselves. Same species, environment and seed give the same plant on every JS engine.
 *
 * @capability plant-growth grow a tree from seed to any age with a real biology simulation; snapshot, restore, retune
 */
export function createPlantGrowth(species: PlantSpecies, env: PlantEnvironment, seed: string, limits: GrowthLimits = DEFAULT_GROWTH_LIMITS): PlantGrowth {
  const nodeCap = limits.maxNodes;
  const budCap = limits.maxBuds;
  let environment: PlantEnvironment = { ...env, wind: { ...env.wind }, slope: { ...env.slope } };
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
  const g = species.growth;
  const c = species.carbon;
  const leafAreaPerNode = g.lateralBudsPerNode > 0
    ? species.leaf.leavesPerNode * 0.55 * (species.leaf.sizeCm / 100) * (species.leaf.sizeCm / 100)
    : 0;
  const shootArea = PLANT_PI * species.wood.shootRadiusM * species.wood.shootRadiusM;
  const divergence = (species.architecture.divergence * PLANT_PI) / 180;
  const branchAngle = (g.branchAngle * PLANT_PI) / 180;
  const cosBranch = plantCos(branchAngle);
  const metamerCap = (upward: number, index: number, light: number): number => {
    const posture = g.horizontalVigour + (1 - g.horizontalVigour) * (upward > 0 ? upward : 0);
    const vigourShare = 1 - g.vigourIndexWeight + g.vigourIndexWeight * (index > 1 ? 1 : index);
    // Shoot length follows the light the bud sees (LIGNUM's f(Q)), so shaded shoots stay short.
    const lightShare = light > 1 ? 1 : light;
    return Math.max(1, Math.floor(g.maxMetamersPerShoot * posture * vigourShare * lightShare + 0.5));
  };
  const hydraulicFactor = (path: number, maxPath: number): number => hydraulicFactorWith(path, maxPath, c.hydraulicExponent);
  // Shade leaves are thinner (lower mass per area) and so cheaper to build and run (Niinemets 2007).
  const shadeAcclimation = 0.6 * species.tolerance.shade;
  const acclimation = (light: number): number => 1 - shadeAcclimation * (1 - (light > 1 ? 1 : light));

  const pipeCost = createPipeCost(species, nodeCap);
  const dist = new Float64Array(nodeCap);
  const tipLight = new Float64Array(nodeCap);
  const vigourIndex = new Float64Array(nodeCap);
  const subNet = new Float64Array(nodeCap);
  const subQ = new Float64Array(nodeCap);
  const subFoliage = new Float64Array(nodeCap);
  const vigour = new Float64Array(nodeCap);
  const latentShare = new Float64Array(nodeCap);
  const need = new Float64Array(nodeCap);
  const firstChild = new Int32Array(nodeCap);
  const nextSibling = new Int32Array(nodeCap);
  const childCount = new Int32Array(nodeCap);
  const budAt = new Int32Array(nodeCap);
  const budShare = new Float64Array(budCap);
  const remap = new Int32Array(nodeCap);
  const removed = new Uint8Array(nodeCap);
  const keptParent = new Int32Array(nodeCap);
  const sag = createSagScratch(nodeCap);
  const candidates = createShootCandidates(budCap + nodeCap);
  const candidateRef = new Int32Array(budCap + nodeCap);
  const shareScratch = new Float64Array(budCap + nodeCap);
  const optimal = new Float64Array(3);
  const heading = new Float64Array(3);
  const axisDir = new Float64Array(3);
  let lastPhotosynthesis = 0;
  let lastLeafArea = 0;
  let maxNodesSeen = 0;
  let maxBudsSeen = 0;

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
    state.light[i] = 0;
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
    let cursor = streamFor(0x7fffffff, 0);
    const [spin, next] = stepRandomSeed(cursor);
    cursor = next;
    heading[0] = 0;
    heading[1] = 1;
    heading[2] = 0;
    const root = addNode(-1, 0, 0, heading, SEEDLING_LENGTH_M, spin * 2 * PLANT_PI, 1);
    // Cotyledons: half a node's leaf area from seed reserves.
    state.foliage[root] = leafAreaPerNode * 0.5;
    addBud(root);
    lastPhotosynthesis = 0;
    lastLeafArea = state.foliage[root] ?? 0;
    maxNodesSeen = state.nodeCount;
    maxBudsSeen = state.budCount;
  }

  function buildChildren(): void {
    const n = state.nodeCount;
    firstChild.fill(-1, 0, n);
    childCount.fill(0, 0, n);
    for (let i = n - 1; i >= 1; i -= 1) {
      const p = state.parent[i] ?? -1;
      if (p < 0) continue;
      nextSibling[i] = firstChild[p] ?? -1;
      firstChild[p] = i;
      childCount[p] = (childCount[p] ?? 0) + 1;
    }
    if (n > 0) nextSibling[0] = -1;
  }

  function indexBuds(): void {
    budAt.fill(-1, 0, state.nodeCount);
    for (let b = 0; b < state.budCount; b += 1) budAt[state.budNode[b] ?? 0] = b;
  }

  function isDead(i: number): boolean {
    return ((state.flags[i] ?? 0) & NODE_DEAD) !== 0;
  }

  /** Per-node carbon balance, gathered basipetally into each branch. */
  function gatherCarbon(): { photosynthesis: number; respiration: number; turnover: number; leafArea: number; storeKg: number } {
    const n = state.nodeCount;
    const lue = (c.lueGPerMJ / 1000) * season.parMJ * site * g.extinction;
    let photosynthesis = 0;
    let respiration = 0;
    let turnover = 0;
    let leafArea = 0;
    let storeKg = 0;
    const maxHeight = species.limits.maxHeightM;
    for (let i = 0; i < n; i += 1) {
      subNet[i] = 0;
      subQ[i] = 0;
      subFoliage[i] = 0;
      const p = state.parent[i] ?? -1;
      dist[i] = (p >= 0 ? (dist[p] ?? 0) : 0) + (state.length[i] ?? 0);
    }
    for (let i = n - 1; i >= 0; i -= 1) {
      if (!isDead(i)) {
        let foliage = state.foliage[i] ?? 0;
        const light = state.light[i] ?? 0;
        let p = 0;
        const sapwoodKg = (state.sapArea[i] ?? 0) * (state.length[i] ?? 0) * species.wood.densityKgM3;
        let r = sapwoodKg * c.sapwoodRespiration;
        let t = 0;
        storeKg += RESERVE_SHARE_OF_SAPWOOD * sapwoodKg;
        if (foliage > 0) {
          p = lue * light * foliage * hydraulicFactor(midpoint(i, 1), maxHeight);
          const leafMass = (foliage / species.leaf.sla) * acclimation(light);
          const upkeep = leafMass * (c.respiration + c.rootPerFoliage * c.rootRespiration);
          const renewal = leafMass * (c.foliageTurnover + c.rootPerFoliage * c.rootTurnover);
          // Short-shoot leaves below their compensation point are shed for good (leaf-level carbon balance).
          if (state.year - (state.born[i] ?? 0) > 1 && c.growthEfficiency * (p - upkeep) < renewal) {
            state.flags[i] = (state.flags[i] ?? 0) | NODE_NO_SPUR;
            state.foliage[i] = 0;
            foliage = 0;
            p = 0;
          } else {
            r += upkeep;
            t = renewal;
            leafArea += foliage;
            storeKg += leafMass * (1 + c.rootPerFoliage);
          }
        }
        photosynthesis += p;
        respiration += r;
        turnover += t;
        subNet[i] = (subNet[i] ?? 0) + c.growthEfficiency * (p - r) - t;
        subFoliage[i] = (subFoliage[i] ?? 0) + foliage;
        let q = 0;
        const bud = budAt[i] ?? -1;
        const tip = tipLight[i] ?? 0;
        if (bud >= 0 && tip >= g.budLightThreshold) q += tip;
        if ((state.latent[i] ?? 0) > 0 && tip >= g.budLightThreshold) q += (state.latent[i] ?? 0) * tip;
        subQ[i] = (subQ[i] ?? 0) + q;
      }
      const parent = state.parent[i] ?? -1;
      if (parent >= 0) {
        subNet[parent] = (subNet[parent] ?? 0) + (subNet[i] ?? 0);
        subQ[parent] = (subQ[parent] ?? 0) + (subQ[i] ?? 0);
        subFoliage[parent] = (subFoliage[parent] ?? 0) + (subFoliage[i] ?? 0);
      }
    }
    return { photosynthesis, respiration, turnover, leafArea, storeKg };
  }

  function gatherFoliage(): void {
    const n = state.nodeCount;
    for (let i = 0; i < n; i += 1) subFoliage[i] = isDead(i) ? 0 : (state.foliage[i] ?? 0);
    for (let i = n - 1; i >= 1; i -= 1) {
      const p = state.parent[i] ?? -1;
      if (p >= 0) subFoliage[p] = (subFoliage[p] ?? 0) + (subFoliage[i] ?? 0);
    }
  }

  function killBranches(): boolean {
    const n = state.nodeCount;
    let any = false;
    removed.fill(0, 0, n);
    for (let i = 1; i < n; i += 1) {
      if (isDead(i) || ((state.flags[i] ?? 0) & NODE_AXIS_START) === 0) continue;
      if ((subNet[i] ?? 0) < 0) {
        state.deficit[i] = Math.min(255, (state.deficit[i] ?? 0) + 1);
        if ((state.deficit[i] ?? 0) >= c.pruneDeficitYears) {
          removed[i] = 1;
          any = true;
        }
      } else {
        state.deficit[i] = 0;
      }
    }
    if (!any) return false;
    for (let i = 1; i < n; i += 1) {
      const p = state.parent[i] ?? -1;
      if (removed[i] === 0 && p >= 0 && removed[p] === 1) removed[i] = 1;
      if (removed[i] === 1) {
        state.flags[i] = (state.flags[i] ?? 0) | NODE_DEAD;
        state.foliage[i] = 0;
        state.latent[i] = 0;
        state.deadAge[i] = 0;
      }
    }
    dropBuds((node) => isDead(node));
    return true;
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

  function midpoint(i: number, axisIndex: number): number {
    const p = state.parent[i] ?? -1;
    const from = p >= 0 ? (state.end[p * 3 + axisIndex] ?? 0) : 0;
    return 0.5 * (from + (state.end[i * 3 + axisIndex] ?? 0));
  }

  /** Leaves sit along the shoot (lit at its midpoint); buds sit at its tip. */
  function computeLight(): void {
    const n = state.nodeCount;
    field.clear();
    let lowest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < n; i += 1) {
      if (isDead(i)) continue;
      const foliage = state.foliage[i] ?? 0;
      if (foliage > 0) {
        const my = midpoint(i, 1);
        field.deposit(midpoint(i, 0), my, midpoint(i, 2), foliage);
        if (my < lowest) lowest = my;
      }
      const y = state.end[i * 3 + 1] ?? 0;
      if (((budAt[i] ?? -1) >= 0 || (state.latent[i] ?? 0) > 0) && y < lowest) lowest = y;
    }
    field.propagate(lowest === Number.POSITIVE_INFINITY ? 0 : lowest);
    for (let i = 0; i < n; i += 1) {
      state.light[i] = 0;
      tipLight[i] = 0;
      if (isDead(i)) continue;
      const foliage = state.foliage[i] ?? 0;
      if (foliage > 0) {
        const light = field.lightAt(midpoint(i, 0), midpoint(i, 1), midpoint(i, 2), environment.light, g.extinction);
        state.light[i] = light;
        if (light < g.budLightThreshold) {
          // Short shoots starve in deep shade and never leaf again.
          state.flags[i] = (state.flags[i] ?? 0) | NODE_NO_SPUR;
          state.foliage[i] = 0;
        }
      }
      if ((budAt[i] ?? -1) >= 0 || (state.latent[i] ?? 0) > 0) {
        tipLight[i] = field.lightAt(state.end[i * 3] ?? 0, state.end[i * 3 + 1] ?? 0, state.end[i * 3 + 2] ?? 0, environment.light, g.extinction);
      }
    }
  }

  /** Extended Borchert–Honda: split the root's vigour down the tree by light, with apical control λ. */
  function distributeVigour(): void {
    const n = state.nodeCount;
    const lambda = g.apicalControl;
    vigour.fill(0, 0, n);
    latentShare.fill(0, 0, n);
    budShare.fill(0, 0, state.budCount);
    vigour[0] = 1;
    vigourIndex[0] = 1;
    for (let i = 0; i < n; i += 1) {
      // LIGNUM vigour index: children keep the parent's index scaled by their area over the thickest child's.
      let thickest = 0;
      for (let child = firstChild[i] ?? -1; child >= 0; child = nextSibling[child] ?? -1) {
        const area = (state.sapArea[child] ?? 0) + (state.heartArea[child] ?? 0);
        if (!isDead(child) && area > thickest) thickest = area;
      }
      for (let child = firstChild[i] ?? -1; child >= 0; child = nextSibling[child] ?? -1) {
        const area = (state.sapArea[child] ?? 0) + (state.heartArea[child] ?? 0);
        vigourIndex[child] = thickest > 0 ? ((vigourIndex[i] ?? 0) * area) / thickest : 0;
      }
      const v = vigour[i] ?? 0;
      state.vigour[i] = v;
      if (v <= 0 || isDead(i)) continue;
      let main = -1;
      let lateralQ = 0;
      for (let child = firstChild[i] ?? -1; child >= 0; child = nextSibling[child] ?? -1) {
        if (isDead(child)) continue;
        if (((state.flags[child] ?? 0) & NODE_AXIS_START) === 0 && main < 0) main = child;
        else lateralQ += subQ[child] ?? 0;
      }
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
  const metamerCostKg = (leafAreaPerNode / species.leaf.sla) * (1 + c.rootPerFoliage) +
    shootArea * g.internodeMax * species.wood.densityKgM3 * (1 + c.coarseRootShare);

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
    const freeBuds = budCap - state.budCount;
    let copies = 0;
    for (let k = lateralStart; k < count; k += 1) copies += candidates.copies[k] ?? 0;
    if (copies <= freeBuds) return;
    if (freeBuds <= 0) {
      for (let k = lateralStart; k < count; k += 1) candidates.share[k] = 0;
      return;
    }
    // Threshold share t: every bud above t fits, buds at t fill the rest in candidate order.
    const laterals = count - lateralStart;
    const sorted = shareScratch.subarray(0, laterals);
    sorted.set(candidates.share.subarray(lateralStart, count));
    sorted.sort();
    let low = 0;
    let high = laterals - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      const t = sorted[middle] ?? 0;
      let atOrAbove = 0;
      for (let k = lateralStart; k < count; k += 1) if ((candidates.share[k] ?? 0) >= t) atOrAbove += candidates.copies[k] ?? 0;
      if (atOrAbove >= freeBuds) low = middle;
      else high = middle - 1;
    }
    const threshold = sorted[low] ?? 0;
    let room = freeBuds;
    for (let k = lateralStart; k < count; k += 1) if ((candidates.share[k] ?? 0) > threshold) room -= candidates.copies[k] ?? 0;
    for (let k = lateralStart; k < count; k += 1) {
      const share = candidates.share[k] ?? 0;
      if (share > threshold) continue;
      if (share < threshold || room <= 0) {
        candidates.share[k] = 0;
        continue;
      }
      const have = candidates.copies[k] ?? 0;
      const take = have < room ? have : room;
      room -= take;
      candidates.copies[k] = take;
    }
  }

  function weightsFor(order: number): TropismWeights {
    let gravity = g.tropism.gravity;
    for (let k = 0; k < order; k += 1) gravity *= g.tropism.gravityOrderDecay;
    const windAngle = (environment.wind.dir * PLANT_PI) / 180;
    const strength = environment.wind.strength * g.tropism.wind;
    const setpointDeg = order === 0 ? 0 : Math.min(90, g.tropism.setpointAngle + (order - 1) * g.tropism.setpointPerOrder);
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
    const length = metamers * g.internodeMax * hydraulicFactor(height, species.limits.maxHeightM);
    return addNode(fromNode, order, firstFlags, axisDir, length, startPhase + (metamers - 1) * divergence, metamers);
  }

  function grow(scale: number): void {
    if (scale <= 0) return;
    const year = state.year;
    const budsBefore = state.budCount;
    for (let k = 0; k < candidates.count; k += 1) {
      const raw = Math.floor(scale * (candidates.share[k] ?? 0));
      if (raw < 1) continue;
      const cap = candidates.maxMetamers[k] ?? 1;
      const metamers = raw > cap ? cap : raw;
      const ref = candidateRef[k] ?? 0;
      if (ref >= 0) {
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
          const order = Math.min(255, (state.order[node] ?? 0) + 1);
          const tip = growShoot(node, order, NODE_AXIS_START, metamers, axisDir, azimuth + PLANT_PI / 2, next);
          addBud(tip);
        }
      }
    }
  }

  function ageBuds(): void {
    let kept = 0;
    for (let b = 0; b < state.budCount; b += 1) {
      const node = state.budNode[b] ?? 0;
      let idle = state.budIdle[b] ?? 0;
      if ((state.born[node] ?? 0) !== state.year) {
        if ((tipLight[node] ?? 0) < g.budLightThreshold) idle += 1;
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
    setLeafMetamers(target, leafy, (state.foliage[target] ?? 0) + (state.foliage[i] ?? 0));
    removed[i] = 3;
  }

  /**
   * Drop long-dead branches (leaving a scar), fold finished twigs into their parent's leaf pool and merge
   * straight internodes, keeping creation order.
   */
  function compact(): void {
    const n = state.nodeCount;
    buildChildren();
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
      if (isDead(i) && p >= 0 && !isDead(p)) {
        const radiusCm = Math.sqrt(((state.sapArea[i] ?? 0) + (state.heartArea[i] ?? 0)) / PLANT_PI) * 100;
        if ((state.deadAge[i] ?? 0) > 2 + 2 * radiusCm) {
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
      setLeafMetamers(i, leafy, (state.foliage[i] ?? 0) + (state.foliage[child] ?? 0));
      state.latent[i] = state.latent[child] ?? 0;
      state.latentAge[i] = state.latentAge[child] ?? 0;
      state.flags[i] = (state.flags[i] ?? 0) | ((state.flags[child] ?? 0) & NODE_SCAR);
      removed[child] = 2;
      remap[child] = i;
    }
    let kept = 0;
    for (let i = 0; i < n; i += 1) {
      if (removed[i] !== 0) continue;
      let target = state.parent[i] ?? -1;
      if (target >= 0 && removed[target] === 2) target = remap[target] ?? target;
      keptParent[kept] = target >= 0 ? (remap[target] ?? -1) : -1;
      remap[i] = kept;
      kept += 1;
    }
    // Survivors move down in runs, one block copy per field per run.
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
    // Merged nodes point at their survivor's new index.
    for (let i = 0; i < n; i += 1) {
      if (removed[i] === 2) remap[i] = remap[remap[i] ?? 0] ?? -1;
      else if (removed[i] !== 0) remap[i] = -1;
    }
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

  function laySurplusWood(kg: number): void {
    const woodKgPerM3 = species.wood.densityKgM3 * (1 + c.coarseRootShare);
    let weight = 0;
    for (let i = 0; i < state.nodeCount; i += 1) if (!isDead(i)) weight += (subFoliage[i] ?? 0) * (state.length[i] ?? 0) * woodKgPerM3;
    if (weight <= 0) return;
    const areaPerFoliage = kg / weight;
    for (let i = 0; i < state.nodeCount; i += 1) {
      if (!isDead(i)) state.sapArea[i] = (state.sapArea[i] ?? 0) + areaPerFoliage * (subFoliage[i] ?? 0);
    }
  }

  function moveNodes(from: number, end: number, to: number): void {
    for (const name of NODE_FIELDS) {
      const width = fieldWidth(name);
      state[name].copyWithin(to * width, from * width, end * width);
    }
  }

  function stepYear(): void {
    state.year += 1;
    const n = state.nodeCount;
    if (state.alive === 0) {
      for (let i = 0; i < n; i += 1) state.deadAge[i] = Math.min(255, (state.deadAge[i] ?? 0) + 1);
      return;
    }
    for (let i = 0; i < n; i += 1) {
      state.flowers[i] = 0;
      if (isDead(i)) {
        state.foliage[i] = 0;
        state.deadAge[i] = Math.min(255, (state.deadAge[i] ?? 0) + 1);
        continue;
      }
      const age = state.year - (state.born[i] ?? 0);
      state.foliage[i] = age <= g.spurYears && ((state.flags[i] ?? 0) & NODE_NO_SPUR) === 0
        ? leafAreaPerNode * (state.metamers[i] ?? 1) * (i === 0 && age <= 1 ? 0.5 : 1)
        : 0;
      const latent = state.latent[i] ?? 0;
      if (latent > 0) {
        const latentAge = (state.latentAge[i] ?? 0) + 1;
        state.latentAge[i] = Math.min(255, latentAge);
        if (latentAge > g.dormantBudYears) state.latent[i] = 0;
      }
    }
    buildChildren();
    indexBuds();
    computeLight();
    let totals = gatherCarbon();
    if (killBranches()) {
      indexBuds();
      totals = gatherCarbon();
    }
    lastPhotosynthesis = totals.photosynthesis;
    lastLeafArea = totals.leafArea;
    let budget = c.growthEfficiency * (totals.photosynthesis - totals.respiration) - totals.turnover + state.reserveKg;
    state.reserveKg = 0;
    const upkeep = totals.turnover + totals.respiration;
    state.health = upkeep > 0 ? Math.max(0, Math.min(1, (c.growthEfficiency * totals.photosynthesis) / upkeep / 1.5)) : 1;
    if (budget <= 0 || (state.budCount === 0 && totals.leafArea <= 0)) {
      state.stressYears += 1;
      if (state.stressYears >= 5) {
        state.alive = 0;
        for (let i = 0; i < state.nodeCount; i += 1) {
          state.flags[i] = (state.flags[i] ?? 0) | NODE_DEAD;
          state.foliage[i] = 0;
          state.latent[i] = 0;
        }
        state.budCount = 0;
        state.health = 0;
      }
      ageBuds();
      compact();
      return;
    }
    state.stressYears = 0;
    if (state.year >= species.reproduction.firstFlowerYears) {
      const reproduction = budget * c.reproductiveShare;
      budget -= reproduction;
      placeFlowers(reproduction);
    }
    const thickening = pipeDemand(state, species, subFoliage, firstChild, nextSibling, need);
    if (budget <= thickening) {
      // Every gram goes to the pipe the leaves already need; nothing is left to store.
      applyThickening(state, species, subFoliage, need, thickening > 0 ? budget / thickening : 0);
      ageBuds();
      compact();
      return;
    }
    distributeVigour();
    collectCandidates();
    pipeCost.prepare(state, subFoliage, candidates.node, candidates.count);
    const scale = solveShootScale(candidates, {
      carbonKg: budget,
      freeNodes: nodeCap - state.nodeCount,
      freeBuds: budCap - state.budCount,
      leafAreaPerMetamer: leafAreaPerNode,
    }, pipeCost);
    const before = state.nodeCount;
    grow(scale);
    const spent = (state.nodeCount - before) * metamerCostKg;
    buildChildren();
    gatherFoliage();
    const finalThickening = pipeDemand(state, species, subFoliage, firstChild, nextSibling, need);
    const left = budget - spent;
    const share = finalThickening <= 0 ? 1 : Math.max(0, Math.min(1, left / finalThickening));
    applyThickening(state, species, subFoliage, need, share);
    let unspent = left - finalThickening * share;
    // Unspent carbon is stored as reserve up to what living tissue can hold; beyond that it goes into
    // wider rings, laid down in proportion to the leaf area each internode carries (Pressler's rule).
    if (unspent > totals.storeKg) {
      laySurplusWood(unspent - totals.storeKg);
      unspent = totals.storeKg;
    }
    state.reserveKg = Math.max(0, unspent);
    ageBuds();
    if (applySag(state, species, sag)) placeNodes(state);
    compact();
    if (state.nodeCount > maxNodesSeen) maxNodesSeen = state.nodeCount;
    if (state.budCount > maxBudsSeen) maxBudsSeen = state.budCount;
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
      shedKg: state.shedKg,
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
        env: { ...environment, wind: { ...environment.wind }, slope: { ...environment.slope } },
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
      environment = { ...snapshot.env, wind: { ...snapshot.env.wind }, slope: { ...snapshot.env.slope } };
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
      environment = {
        ...environment,
        ...change,
        wind: { ...(change.wind ?? environment.wind) },
        slope: { ...(change.slope ?? environment.slope) },
      };
      season = growingSeason(species, environment);
      site = siteModifier(environment);
    },
    environment: () => ({ ...environment, wind: { ...environment.wind }, slope: { ...environment.slope } }),
  };
  return growth;
}


/** Ryan & Yoder hydraulic limitation along a water path: 1 − (path / maxPath)^p, floored at 0. */
function hydraulicFactorWith(path: number, maxPath: number, exponent: number): number {
  const ratio = path > 0 ? path / maxPath : 0;
  let power = 1;
  for (let k = 0; k < exponent; k += 1) power *= ratio;
  return power >= 1 ? 0 : 1 - power;
}
