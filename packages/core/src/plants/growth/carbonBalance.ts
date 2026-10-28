/**
 * Growth candidates for one year: every bud that could extend, with its Borchert–Honda share of the
 * tree's vigour and its carbon cost per metamer. `copies` counts identical lateral buds on one node.
 */
export interface ShootCandidates {
  count: number;
  share: Float64Array;
  costKg: Float64Array;
  copies: Uint8Array;
  /**
   * What the candidate grows: 0 extends an axis (one new node), 1 starts a new axis (a node and a bud
   * slot), 2 a leafy short shoot on its node (no new node or bud).
   */
  opensAxis: Uint8Array;
  /** Node the candidate's new shoot hangs from. */
  node: Int32Array;
  /** Most metamers this candidate's shoot may make this year. */
  maxMetamers: Uint8Array;
  /** Scratch: candidates still in play during the search. */
  live: Int32Array;
}

/**
 * The extra cost a trial scale puts on the existing structure: `add` the leaf area each candidate
 * would hang on its node, then `total` returns the carbon of the wood that leaf area needs.
 */
export interface StructureCost {
  begin(): void;
  add(node: number, leafAreaM2: number): void;
  total(): number;
}

/**
 * Allocate candidate buffers for `capacity` buds.
 * @internal
 */
export function createShootCandidates(capacity: number): ShootCandidates {
  return {
    count: 0,
    share: new Float64Array(capacity),
    costKg: new Float64Array(capacity),
    copies: new Uint8Array(capacity),
    opensAxis: new Uint8Array(capacity),
    node: new Int32Array(capacity),
    maxMetamers: new Uint8Array(capacity),
    live: new Int32Array(capacity),
  };
}

/**
 * What one year can spend on new shoots: carbon and free node and bud slots.
 * @internal
 */
export interface ShootBudget {
  carbonKg: number;
  freeNodes: number;
  freeBuds: number;
  /** Leaf area one metamer carries, m². */
  leafAreaPerMetamer: number;
}


/** Stop the carbon search once α is bracketed to this share of itself. */
const SOLVE_TOLERANCE = 1 / 256;
const SOLVE_MAX_STEPS = 24;

function countAt(candidates: ShootCandidates, liveCount: number, scale: number, budget: ShootBudget): boolean {
  let nodes = 0;
  let axes = 0;
  for (let k = 0; k < liveCount; k += 1) {
    const i = candidates.live[k] ?? 0;
    const raw = Math.floor(scale * (candidates.share[i] ?? 0));
    if (raw < 1) continue;
    const cap = candidates.maxMetamers[i] ?? 1;
    const copies = candidates.copies[i] ?? 1;
    const kind = candidates.opensAxis[i] ?? 0;
    if (kind !== 2) nodes += (raw > cap ? cap : raw) * copies;
    if (kind === 1) axes += copies;
  }
  return nodes <= budget.freeNodes && axes <= budget.freeBuds;
}

function carbonAt(candidates: ShootCandidates, liveCount: number, scale: number, budget: ShootBudget, structure: StructureCost): number {
  structure.begin();
  let carbon = 0;
  for (let k = 0; k < liveCount; k += 1) {
    const i = candidates.live[k] ?? 0;
    const raw = Math.floor(scale * (candidates.share[i] ?? 0));
    if (raw < 1) continue;
    const cap = candidates.maxMetamers[i] ?? 1;
    const metamers = (raw > cap ? cap : raw) * (candidates.copies[i] ?? 1);
    carbon += metamers * (candidates.costKg[i] ?? 0);
    structure.add(candidates.node[i] ?? 0, metamers * budget.leafAreaPerMetamer);
  }
  return carbon + structure.total();
}

/** Keep only candidates that reach one metamer below `scale`; returns how many. */
function keepReachable(candidates: ShootCandidates, liveCount: number, scale: number): number {
  let kept = 0;
  const floorShare = 1 / scale;
  for (let k = 0; k < liveCount; k += 1) {
    const i = candidates.live[k] ?? 0;
    if ((candidates.share[i] ?? 0) < floorShare) continue;
    candidates.live[kept] = i;
    kept += 1;
  }
  return kept;
}

/**
 * LIGNUM's growth-allocation step: the largest vigour scale α for which the shoots it buys
 * (floor(α · share) metamers per bud) plus the wood the structure needs to carry their leaves cost no
 * more carbon than the year's budget, and fit the node and bud caps. Cost and counts are monotone in
 * α: the caps are bisected with a cheap count, then carbon is found by Illinois false position.
 * @internal
 */
export function solveShootScale(candidates: ShootCandidates, budget: ShootBudget, structure: StructureCost): number {
  if (candidates.count === 0 || budget.carbonKg <= 0 || budget.freeNodes <= 0) return 0;
  let continuous = 0;
  for (let i = 0; i < candidates.count; i += 1) continuous += (candidates.share[i] ?? 0) * (candidates.costKg[i] ?? 0) * (candidates.copies[i] ?? 1);
  if (continuous <= 0) return 0;
  for (let i = 0; i < candidates.count; i += 1) candidates.live[i] = i;
  let live = candidates.count;
  // Carbon alone never buys more than budget / continuous-cost doubled once for the floors.
  let high = (2 * budget.carbonKg) / continuous;
  let minShare = Number.POSITIVE_INFINITY;
  for (let i = 0; i < candidates.count; i += 1) {
    const share = candidates.share[i] ?? 0;
    if (share > 0 && share < minShare) minShare = share;
  }
  for (let guard = 0; guard < 60; guard += 1) {
    if (!countAt(candidates, live, high, budget)) break;
    if (carbonAt(candidates, live, high, budget, structure) > budget.carbonKg) break;
    // Every candidate is already at its metamer cap: more scale buys nothing.
    if (high * minShare >= 256) return high;
    high *= 2;
  }
  live = keepReachable(candidates, live, high);
  if (!countAt(candidates, live, high, budget)) {
    let low = 0;
    let top = high;
    for (let iteration = 0; iteration < 40 && top - low > top * SOLVE_TOLERANCE; iteration += 1) {
      const middle = (low + top) / 2;
      if (countAt(candidates, live, middle, budget)) low = middle;
      else top = middle;
    }
    if (carbonAt(candidates, live, low, budget, structure) <= budget.carbonKg) return low;
    high = top;
  }
  let low = 0;
  let gLow = carbonAt(candidates, live, 0, budget, structure) - budget.carbonKg;
  if (gLow > 0) return 0;
  let gHigh = carbonAt(candidates, live, high, budget, structure) - budget.carbonKg;
  let side = 0;
  for (let step = 0; step < SOLVE_MAX_STEPS && high - low > high * SOLVE_TOLERANCE; step += 1) {
    let trial = low + ((high - low) * -gLow) / (gHigh - gLow);
    // Keep each trial strictly inside, and fall back to halving when false position stalls.
    const margin = (high - low) / 64;
    if (!(trial > low + margin)) trial = low + margin;
    if (!(trial < high - margin)) trial = high - margin;
    const g = carbonAt(candidates, live, trial, budget, structure) - budget.carbonKg;
    if (g <= 0) {
      low = trial;
      gLow = g;
      if (side === -1) gHigh /= 2;
      side = -1;
    } else {
      high = trial;
      gHigh = g;
      if (side === 1) gLow /= 2;
      side = 1;
    }
  }
  return countAt(candidates, live, low, budget) ? low : 0;
}
