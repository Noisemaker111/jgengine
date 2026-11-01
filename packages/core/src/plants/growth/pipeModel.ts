import type { PlantSpecies } from "../species/plantSpecies";
import type { StructureCost } from "./carbonBalance";
import { NODE_DEAD, type GrowthState } from "./growthState";
import { plantPow } from "./plantMath";

/**
 * Whether a species has a vascular cambium. Palms and ferns have none (Tomlinson 1990): each stem
 * section reaches its width just below the crown and never widens after.
 * @internal
 */
export function hasCambium(species: PlantSpecies): boolean {
  return species.habit !== "palm" && species.habit !== "fern";
}

/**
 * Whether node `i` can still widen: always with a cambium, and for a palm or fern only while the
 * fronds of its own shoot are alive.
 * @internal
 */
export function canWiden(state: GrowthState, species: PlantSpecies, cambium: boolean, i: number): boolean {
  return cambium || state.vitals.year - (state.nodes.born[i] ?? 0) <= species.growth.spurYears + 1;
}

/**
 * Pipe-model thickening (Shinozaki 1964; LIGNUM; Mäkelä 1997). Each internode needs sapwood area in
 * proportion to the leaf area above it. A share of old sapwood turns to heartwood each year, and any
 * sapwood above the requirement does too, so the cross-section never shrinks. At a branch join the
 * parent is also kept at least as thick as the da Vinci rule r^n = Σ r_i^n allows.
 *
 * Fills `need` with each node's new sapwood area (m²) and returns the carbon (kg) that new wood costs.
 * With `gather`, `foliageAbove` is summed from the live leaves in the same pass and `out` receives the
 * wood carbon of one m² of sapwood per m² of leaves on every live node (Pressler weighting).
 * @internal
 */
export function pipeDemand(
  state: GrowthState,
  species: PlantSpecies,
  foliageAbove: Float64Array,
  firstChild: Int32Array,
  nextSibling: Int32Array,
  need: Float64Array,
  gather?: { pressler: number },
): number {
  const { sapwoodPerFoliage, sapwoodTurnover, pipeExponent } = species.carbon;
  const woodKgPerM3 = species.wood.densityKgM3 * (1 + species.carbon.coarseRootShare);
  const { flags, sapArea, heartArea, length, parent, foliage } = state.nodes;
  const cambium = hasCambium(species);
  const toChild = pipeExponent / 2;
  const toParent = 2 / pipeExponent;
  let carbon = 0;
  let pressler = 0;
  if (gather) foliageAbove.fill(0, 0, state.slots.nodeCount);
  for (let i = state.slots.nodeCount - 1; i >= 0; i -= 1) {
    need[i] = 0;
    const dead = ((flags[i] ?? 0) & NODE_DEAD) !== 0;
    if (gather) {
      const above = (foliageAbove[i] ?? 0) + (dead ? 0 : (foliage[i] ?? 0));
      foliageAbove[i] = above;
      const p = parent[i] ?? -1;
      if (p >= 0) foliageAbove[p] = (foliageAbove[p] ?? 0) + above;
      if (!dead && canWiden(state, species, cambium, i)) pressler += above * (length[i] ?? 0) * woodKgPerM3;
    }
    if (dead || !canWiden(state, species, cambium, i)) continue;
    const sap = sapArea[i] ?? 0;
    const retained = sap * (1 - sapwoodTurnover);
    const required = sapwoodPerFoliage * (foliageAbove[i] ?? 0);
    let add = required > retained ? required - retained : 0;
    const first = firstChild[i] ?? -1;
    if (first >= 0 && (nextSibling[first] ?? -1) >= 0) {
      const total = sap + (heartArea[i] ?? 0) + add;
      let plain = 0;
      for (let c = first; c >= 0; c = nextSibling[c] ?? -1) {
        if (((flags[c] ?? 0) & NODE_DEAD) === 0) plain += (sapArea[c] ?? 0) + (heartArea[c] ?? 0) + (need[c] ?? 0);
      }
      // For n ≥ 2 the da Vinci area never exceeds the plain sum of child areas, so it can only bind
      // when the parent is thinner than that sum.
      if (plain > total) {
        let sum = 0;
        for (let c = first; c >= 0; c = nextSibling[c] ?? -1) {
          if (((flags[c] ?? 0) & NODE_DEAD) !== 0) continue;
          sum += plantPow((sapArea[c] ?? 0) + (heartArea[c] ?? 0) + (need[c] ?? 0), toChild);
        }
        const floorArea = plantPow(sum, toParent);
        if (floorArea > total) add += floorArea - total;
      }
    }
    need[i] = add;
    carbon += add * (length[i] ?? 0) * woodKgPerM3;
  }
  if (gather) gather.pressler = pressler;
  return carbon;
}

/**
 * One node's yearly ring: retire a share of sapwood (and any above the pipe requirement) to heartwood,
 * then add `area` m² of new sapwood.
 * @internal
 */
export function thickenNode(state: GrowthState, species: PlantSpecies, i: number, foliageAbove: number, area: number): void {
  if (!canWiden(state, species, hasCambium(species), i)) return;
  const { sapwoodPerFoliage, sapwoodTurnover } = species.carbon;
  const sap = state.nodes.sapArea[i] ?? 0;
  let heart = (state.nodes.heartArea[i] ?? 0) + sap * sapwoodTurnover;
  let next = sap * (1 - sapwoodTurnover);
  const required = sapwoodPerFoliage * foliageAbove;
  if (next > required) {
    heart += next - required;
    next = required;
  }
  state.nodes.sapArea[i] = next + area;
  state.nodes.heartArea[i] = heart;
}

/**
 * Lay down `share` (0..1) of each node's new sapwood and move retired sapwood to heartwood.
 * @internal
 */
export function applyThickening(state: GrowthState, species: PlantSpecies, foliageAbove: Float64Array, need: Float64Array, share: number): void {
  for (let i = 0; i < state.slots.nodeCount; i += 1) {
    if (((state.nodes.flags[i] ?? 0) & NODE_DEAD) !== 0) continue;
    thickenNode(state, species, i, foliageAbove[i] ?? 0, (need[i] ?? 0) * share);
  }
}

/** {@link StructureCost} rebuilt each year from the current foliage. */
export interface PipeCost extends StructureCost {
  /** Rebuild from this year's foliage; only `nodes[0..count)` and their ancestors may receive leaf area. */
  prepare(state: GrowthState, foliageAbove: Float64Array, nodes: Int32Array, count: number): void;
}

/**
 * The pipe-model cost of hanging extra leaf area on the tree, for the growth solve: every node below a
 * new shoot needs sapwood for the leaves above it, less what it already has. A node already short of
 * sapwood costs linearly in the leaf area added above it, so prepare folds those into one wood weight
 * per path node; each trial then walks only the path nodes with sapwood to spare.
 * @internal
 */
export function createPipeCost(species: PlantSpecies, capacity: number): PipeCost {
  return new PipeCostWalk(species, capacity);
}

// A class rather than closures, so the solve's calls stay inlined however many plants are alive.
class PipeCostWalk implements PipeCost {
  private readonly shortfall: Float64Array;
  private readonly woodPerArea: Float64Array;
  private readonly added: Float64Array;
  private readonly parent: Int32Array;
  private readonly slot: Int32Array;
  /** Per path node: the nearest spare-sapwood node at or below it in the tree, as a walk slot. */
  private readonly spare: Int32Array;
  /** Per path node: sapwood-per-foliage times the wood of every short node from it down to the root. */
  private readonly linearWood: Float64Array;
  private readonly sapwoodPerFoliage: number;
  private readonly sapwoodTurnover: number;
  private readonly woodKgPerM3: number;
  private readonly species: PlantSpecies;
  private readonly cambium: boolean;
  private n = 0;
  private base = 0;
  private linear = 0;

  constructor(species: PlantSpecies, capacity: number) {
    this.shortfall = new Float64Array(capacity);
    this.woodPerArea = new Float64Array(capacity);
    this.added = new Float64Array(capacity);
    this.parent = new Int32Array(capacity);
    this.slot = new Int32Array(capacity);
    this.spare = new Int32Array(capacity);
    this.linearWood = new Float64Array(capacity);
    this.sapwoodPerFoliage = species.carbon.sapwoodPerFoliage;
    this.sapwoodTurnover = species.carbon.sapwoodTurnover;
    this.woodKgPerM3 = species.wood.densityKgM3 * (1 + species.carbon.coarseRootShare);
    this.species = species;
    this.cambium = hasCambium(species);
  }

  prepare(state: GrowthState, foliageAbove: Float64Array, nodes: Int32Array, count: number): void {
    const { slot, spare, linearWood, parent, shortfall, woodPerArea, sapwoodPerFoliage, sapwoodTurnover, woodKgPerM3 } = this;
    slot.fill(-1, 0, state.slots.nodeCount);
    for (let k = 0; k < count; k += 1) {
      for (let i = nodes[k] ?? -1; i >= 0 && (slot[i] ?? 0) < 0; i = state.nodes.parent[i] ?? -1) slot[i] = 0;
    }
    let n = 0;
    let base = 0;
    for (let i = 0; i < state.slots.nodeCount; i += 1) {
      const dead = ((state.nodes.flags[i] ?? 0) & NODE_DEAD) !== 0 || !canWiden(state, this.species, this.cambium, i);
      const need = dead ? Number.NEGATIVE_INFINITY : sapwoodPerFoliage * (foliageAbove[i] ?? 0) - (state.nodes.sapArea[i] ?? 0) * (1 - sapwoodTurnover);
      const wood = dead ? 0 : (state.nodes.length[i] ?? 0) * woodKgPerM3;
      if ((slot[i] ?? -1) < 0) {
        if (need > 0) base += need * wood;
        continue;
      }
      const p = state.nodes.parent[i] ?? -1;
      const above = p >= 0 ? (spare[p] ?? -1) : -1;
      const carried = p >= 0 ? (linearWood[p] ?? 0) : 0;
      if (need >= 0) {
        base += need * wood;
        spare[i] = above;
        linearWood[i] = carried + sapwoodPerFoliage * wood;
        continue;
      }
      spare[i] = n;
      linearWood[i] = carried;
      parent[n] = above;
      shortfall[n] = need;
      woodPerArea[n] = wood;
      n += 1;
    }
    this.n = n;
    this.base = base;
  }

  begin(): void {
    // total() leaves `added` zeroed behind it.
    this.linear = 0;
  }

  add(node: number, leafAreaM2: number): void {
    this.linear += leafAreaM2 * (this.linearWood[node] ?? 0);
    const at = this.spare[node] ?? -1;
    if (at >= 0) this.added[at] = (this.added[at] ?? 0) + leafAreaM2;
  }

  total(): number {
    const { added, shortfall, woodPerArea, parent, sapwoodPerFoliage } = this;
    let carbon = this.base + this.linear;
    for (let i = this.n - 1; i >= 0; i -= 1) {
      const extra = added[i] ?? 0;
      added[i] = 0;
      const need = (shortfall[i] ?? 0) + sapwoodPerFoliage * extra;
      if (need > 0) carbon += need * (woodPerArea[i] ?? 0);
      const p = parent[i] ?? -1;
      if (p >= 0 && extra > 0) added[p] = (added[p] ?? 0) + extra;
    }
    return carbon;
  }
}
