import type { PlantSpecies } from "../species/plantSpecies";
import type { StructureCost } from "./carbonBalance";
import { NODE_DEAD, type GrowthState } from "./growthState";
import { plantPow } from "./plantMath";

/**
 * Pipe-model thickening (Shinozaki 1964; LIGNUM; Mäkelä 1997). Each internode needs sapwood area in
 * proportion to the leaf area above it. A share of old sapwood turns to heartwood each year, and any
 * sapwood above the requirement does too, so the cross-section never shrinks. At a branch join the
 * parent is also kept at least as thick as the da Vinci rule r^n = Σ r_i^n allows.
 *
 * Fills `need` with each node's new sapwood area (m²) and returns the carbon (kg) that new wood costs.
 * @internal
 */
export function pipeDemand(
  state: GrowthState,
  species: PlantSpecies,
  foliageAbove: Float64Array,
  firstChild: Int32Array,
  nextSibling: Int32Array,
  need: Float64Array,
): number {
  const { sapwoodPerFoliage, sapwoodTurnover, pipeExponent } = species.carbon;
  const woodKgPerM3 = species.wood.densityKgM3 * (1 + species.carbon.coarseRootShare);
  let carbon = 0;
  for (let i = state.nodeCount - 1; i >= 0; i -= 1) {
    need[i] = 0;
    if (((state.flags[i] ?? 0) & NODE_DEAD) !== 0) continue;
    const sap = state.sapArea[i] ?? 0;
    const retained = sap * (1 - sapwoodTurnover);
    const required = sapwoodPerFoliage * (foliageAbove[i] ?? 0);
    let add = required > retained ? required - retained : 0;
    const first = firstChild[i] ?? -1;
    if (first >= 0 && (nextSibling[first] ?? -1) >= 0) {
      const total = sap + (state.heartArea[i] ?? 0) + add;
      let plain = 0;
      for (let c = first; c >= 0; c = nextSibling[c] ?? -1) {
        if (((state.flags[c] ?? 0) & NODE_DEAD) === 0) plain += (state.sapArea[c] ?? 0) + (state.heartArea[c] ?? 0) + (need[c] ?? 0);
      }
      // For n ≥ 2 the da Vinci area never exceeds the plain sum of child areas, so it can only bind
      // when the parent is thinner than that sum.
      if (plain > total) {
        let sum = 0;
        for (let c = first; c >= 0; c = nextSibling[c] ?? -1) {
          if (((state.flags[c] ?? 0) & NODE_DEAD) !== 0) continue;
          const childArea = (state.sapArea[c] ?? 0) + (state.heartArea[c] ?? 0) + (need[c] ?? 0);
          sum += plantPow(childArea, pipeExponent / 2);
        }
        const floorArea = plantPow(sum, 2 / pipeExponent);
        if (floorArea > total) add += floorArea - total;
      }
    }
    need[i] = add;
    carbon += add * (state.length[i] ?? 0) * woodKgPerM3;
  }
  return carbon;
}

/**
 * Lay down `share` (0..1) of each node's new sapwood and move retired sapwood to heartwood.
 * @internal
 */
export function applyThickening(state: GrowthState, species: PlantSpecies, foliageAbove: Float64Array, need: Float64Array, share: number): void {
  const { sapwoodPerFoliage, sapwoodTurnover } = species.carbon;
  for (let i = 0; i < state.nodeCount; i += 1) {
    if (((state.flags[i] ?? 0) & NODE_DEAD) !== 0) continue;
    const sap = state.sapArea[i] ?? 0;
    let heart = (state.heartArea[i] ?? 0) + sap * sapwoodTurnover;
    let next = sap * (1 - sapwoodTurnover);
    const required = sapwoodPerFoliage * (foliageAbove[i] ?? 0);
    if (next > required) {
      heart += next - required;
      next = required;
    }
    next += (need[i] ?? 0) * share;
    state.sapArea[i] = next;
    state.heartArea[i] = heart;
  }
}

/** {@link StructureCost} rebuilt each year from the current foliage. */
export interface PipeCost extends StructureCost {
  /** Rebuild from this year's foliage; only `nodes[0..count)` and their ancestors may receive leaf area. */
  prepare(state: GrowthState, foliageAbove: Float64Array, nodes: Int32Array, count: number): void;
}

/**
 * The pipe-model cost of hanging extra leaf area on the tree, for the growth solve: every node below a
 * new shoot needs sapwood for the leaves above it, less what it already has. Prepared once per year
 * over the candidates' ancestors only, so each trial is one pass over that path set.
 * @internal
 */
export function createPipeCost(species: PlantSpecies, capacity: number): PipeCost {
  const shortfall = new Float64Array(capacity);
  const woodPerArea = new Float64Array(capacity);
  const added = new Float64Array(capacity);
  const parent = new Int32Array(capacity);
  const slot = new Int32Array(capacity);
  const { sapwoodPerFoliage, sapwoodTurnover } = species.carbon;
  const woodKgPerM3 = species.wood.densityKgM3 * (1 + species.carbon.coarseRootShare);
  let n = 0;
  let base = 0;
  return {
    prepare(state, foliageAbove, nodes, count) {
      slot.fill(-1, 0, state.nodeCount);
      for (let k = 0; k < count; k += 1) {
        for (let i = nodes[k] ?? -1; i >= 0 && (slot[i] ?? 0) < 0; i = state.parent[i] ?? -1) slot[i] = 0;
      }
      n = 0;
      base = 0;
      for (let i = 0; i < state.nodeCount; i += 1) {
        const dead = ((state.flags[i] ?? 0) & NODE_DEAD) !== 0;
        const need = dead ? Number.NEGATIVE_INFINITY : sapwoodPerFoliage * (foliageAbove[i] ?? 0) - (state.sapArea[i] ?? 0) * (1 - sapwoodTurnover);
        const wood = dead ? 0 : (state.length[i] ?? 0) * woodKgPerM3;
        if ((slot[i] ?? -1) < 0) {
          if (need > 0) base += need * wood;
          continue;
        }
        slot[i] = n;
        const p = state.parent[i] ?? -1;
        parent[n] = p >= 0 ? (slot[p] ?? -1) : -1;
        shortfall[n] = need;
        woodPerArea[n] = wood;
        n += 1;
      }
    },
    begin() {
      // total() leaves `added` zeroed behind it.
    },
    add(node, leafAreaM2) {
      const at = slot[node] ?? -1;
      if (at >= 0) added[at] = (added[at] ?? 0) + leafAreaM2;
    },
    total() {
      let carbon = base;
      for (let i = n - 1; i >= 0; i -= 1) {
        const extra = added[i] ?? 0;
        added[i] = 0;
        const need = (shortfall[i] ?? 0) + sapwoodPerFoliage * extra;
        if (need > 0) carbon += need * (woodPerArea[i] ?? 0);
        const p = parent[i] ?? -1;
        if (p >= 0 && extra > 0) added[p] = (added[p] ?? 0) + extra;
      }
      return carbon;
    },
  };
}
