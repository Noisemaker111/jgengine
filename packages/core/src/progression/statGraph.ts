import type { StatModifier, StatModifierSet } from "../stats/statModifiers";

/**
 * A game-owned named input value. The engine ships no attribute vocabulary — ids,
 * bounds, defaults, and metadata are entirely caller data, so the same graph can
 * model STR/AGI/INT, SPECIAL scores, skills, difficulty knobs, or anything else.
 */
export interface StatInputDef {
  id: string;
  /** Default base value a fresh sheet starts at. Defaults to `min ?? 0`. */
  base?: number;
  /** Lower bound applied to the resolved value. */
  min?: number;
  /** Upper bound applied to the resolved value. */
  max?: number;
  /** Free-form, engine-ignored metadata (labels, descriptions, UI hints). */
  meta?: Readonly<Record<string, unknown>>;
}

/** How a single contribution folds into a running value. */
export type StatOp = "add" | "mul" | "override" | "clampMin" | "clampMax";

/**
 * One folded contribution to a value, retained so a sheet can explain
 * "why is this value 42?" — every step carries the source that produced it.
 */
export interface StatContribution {
  /** Provenance label — who/what produced this contribution. */
  source: string;
  op: StatOp;
  value: number;
}

/** A modifier entry targeting one stat: a single contribution or an ordered list. */
export type StatModEntry = StatContribution | readonly StatContribution[];

/** The read-only view a derived formula gets: resolved values of its declared dependencies. */
export interface StatDeriveContext {
  /** Resolved (fully modified) value of a declared dependency (input or derived). */
  value(id: string): number;
}

/**
 * A derived value whose formula and dependencies are caller-owned. `compute` may
 * return a scalar (shorthand for a single `add`) or an ordered list of contributions
 * folded left-to-right, so additive/multiplicative/clamped and conditional modifiers
 * are all expressed as plain data or branches inside the function.
 */
export interface StatDerivedDef {
  id: string;
  /** ids (inputs or other derived) this formula reads — drives ordering, cycle detection, and selective recompute. */
  deps?: readonly string[];
  min?: number;
  max?: number;
  round?: "floor" | "ceil" | "round";
  meta?: Readonly<Record<string, unknown>>;
  compute(ctx: StatDeriveContext): number | readonly StatContribution[];
}

/** The full schema of a stat graph: its named inputs and caller-authored derived formulas. */
export interface StatGraphDef {
  inputs: readonly StatInputDef[];
  derived?: readonly StatDerivedDef[];
}

/** Plain-data, JSON-safe sheet state: input base values plus registered modifier sources. */
export interface StatSheetState {
  base: Record<string, number>;
  sources: Record<string, Record<string, StatContribution[]>>;
}

/** One line of a provenance trace: a contribution plus the running total after it folds in. */
export interface StatContributionStep extends StatContribution {
  /** Running total after this contribution folds in. */
  subtotal: number;
}

/** A full provenance trace for one stat: the ordered steps that produced its value. */
export interface StatExplanation {
  id: string;
  value: number;
  steps: StatContributionStep[];
}

/** A live per-entity instance of a {@link StatGraph}: mutable base values and modifier sources over a shared schema. */
export interface StatSheet {
  /** Resolve the fully modified value of an input or derived stat. */
  get(id: string): number;
  /** The stored base of an input stat (before modifiers/clamping). */
  getBase(id: string): number;
  setBase(id: string, value: number): void;
  /** Register (or replace) a named modifier source targeting one or more stats. */
  addSource(sourceId: string, mods: Record<string, StatModEntry>): void;
  removeSource(sourceId: string): boolean;
  hasSource(sourceId: string): boolean;
  sources(): string[];
  /** Resolve every input and derived stat into a plain record. */
  values(): Record<string, number>;
  /** Ordered contribution trace explaining a stat's current value. */
  explain(id: string): StatExplanation;
  /** Resolve values under a proposed, uncommitted mutation (e.g. a previewed allocation). */
  preview(mutate: (draft: StatSheet) => void): Record<string, number>;
  toJSON(): StatSheetState;
}

/** A compiled, immutable stat-graph schema that mints per-entity {@link StatSheet}s from base values or saved state. */
export interface StatGraph {
  readonly inputIds: readonly string[];
  readonly derivedIds: readonly string[];
  create(base?: Record<string, number>): StatSheet;
  restore(state: StatSheetState): StatSheet;
}

const OP_ORDER: Record<StatOp, number> = { override: 0, add: 1, mul: 2, clampMin: 3, clampMax: 4 };

function applyOp(acc: number, op: StatOp, value: number): number {
  switch (op) {
    case "add":
      return acc + value;
    case "mul":
      return acc * value;
    case "override":
      return value;
    case "clampMin":
      return Math.max(acc, value);
    case "clampMax":
      return Math.min(acc, value);
  }
}

function normalizeEntry(entry: StatModEntry): StatContribution[] {
  return Array.isArray(entry) ? [...entry] : [entry as StatContribution];
}

function applyBounds(
  value: number,
  bounds: { min?: number; max?: number; round?: "floor" | "ceil" | "round" },
): number {
  let out = value;
  if (bounds.min !== undefined) out = Math.max(bounds.min, out);
  if (bounds.max !== undefined) out = Math.min(bounds.max, out);
  switch (bounds.round) {
    case "floor":
      return Math.floor(out);
    case "ceil":
      return Math.ceil(out);
    case "round":
      return Math.round(out);
    default:
      return out;
  }
}

/**
 * A data-driven stat graph: game-owned named inputs feed caller-authored derived
 * formulas, with contribution provenance, uncommitted previews, cycle detection, and
 * selective recomputation. Formula semantics and numeric tables stay entirely game-defined.
 *
 * @capability stat-graph derive game-defined stats from named inputs with provenance and preview
 */
export function createStatGraph(def: StatGraphDef): StatGraph {
  const inputs = new Map<string, StatInputDef>();
  for (const input of def.inputs) {
    if (inputs.has(input.id)) throw new Error(`duplicate stat input id: ${input.id}`);
    inputs.set(input.id, input);
  }
  const derived = new Map<string, StatDerivedDef>();
  for (const node of def.derived ?? []) {
    if (inputs.has(node.id) || derived.has(node.id)) throw new Error(`duplicate stat id: ${node.id}`);
    derived.set(node.id, node);
  }

  // Validate dependencies and topologically order derived nodes (cycle detection).
  for (const node of derived.values()) {
    for (const dep of node.deps ?? []) {
      if (!inputs.has(dep) && !derived.has(dep)) {
        throw new Error(`stat "${node.id}" depends on unknown stat "${dep}"`);
      }
    }
  }
  const order: string[] = [];
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): void => {
    if (done.has(id) || inputs.has(id)) return;
    if (visiting.has(id)) throw new Error(`stat dependency cycle through "${id}"`);
    visiting.add(id);
    for (const dep of derived.get(id)?.deps ?? []) visit(dep);
    visiting.delete(id);
    done.add(id);
    order.push(id);
  };
  for (const id of derived.keys()) visit(id);

  // Transitive dependents: changing X invalidates X and everything downstream of it.
  const dependents = new Map<string, Set<string>>();
  for (const node of derived.values()) {
    for (const dep of node.deps ?? []) {
      let set = dependents.get(dep);
      if (!set) dependents.set(dep, (set = new Set()));
      set.add(node.id);
    }
  }
  const affected = (id: string): Set<string> => {
    const out = new Set<string>([id]);
    const stack = [id];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const dep of dependents.get(cur) ?? []) {
        if (!out.has(dep)) {
          out.add(dep);
          stack.push(dep);
        }
      }
    }
    return out;
  };

  const inputIds = Array.from(inputs.keys());
  const derivedIds = Array.from(derived.keys());
  const allIds = [...inputIds, ...order];

  function makeSheet(
    baseState: Record<string, number>,
    sourceState: Map<string, Map<string, StatContribution[]>>,
  ): StatSheet {
    const baseValues = new Map<string, number>(Object.entries(baseState));
    const sources = sourceState;
    const valueCache = new Map<string, number>();
    const stepCache = new Map<string, StatContributionStep[]>();

    const knows = (id: string): boolean => inputs.has(id) || derived.has(id);

    function externalSteps(id: string): StatContribution[] {
      const collected: StatContribution[] = [];
      for (const mods of sources.values()) {
        const list = mods.get(id);
        if (list) collected.push(...list);
      }
      // Stable sort by op precedence; registration order is preserved within an op.
      return collected
        .map((c, index) => ({ c, index }))
        .sort((a, b) => OP_ORDER[a.c.op] - OP_ORDER[b.c.op] || a.index - b.index)
        .map((entry) => entry.c);
    }

    function resolveSteps(id: string): StatContributionStep[] {
      const cached = stepCache.get(id);
      if (cached) return cached;
      const inputDef = inputs.get(id);
      const steps: StatContributionStep[] = [];
      let acc: number;
      if (inputDef) {
        acc = baseValues.get(id) ?? inputDef.base ?? inputDef.min ?? 0;
        steps.push({ source: "base", op: "add", value: acc, subtotal: acc });
      } else {
        const node = derived.get(id);
        if (!node) throw new Error(`unknown stat: ${id}`);
        const deps = new Set(node.deps ?? []);
        const ctx: StatDeriveContext = {
          value: (dep) => {
            if (!deps.has(dep)) throw new Error(`stat "${id}" read undeclared dependency "${dep}"`);
            return resolveValue(dep);
          },
        };
        const out = node.compute(ctx);
        const contribs =
          typeof out === "number" ? [{ source: "formula", op: "add" as StatOp, value: out }] : out;
        acc = 0;
        for (const c of contribs) {
          acc = applyOp(acc, c.op, c.value);
          steps.push({ ...c, subtotal: acc });
        }
      }
      for (const c of externalSteps(id)) {
        acc = applyOp(acc, c.op, c.value);
        steps.push({ ...c, subtotal: acc });
      }
      const bounds = inputDef ?? derived.get(id)!;
      const bounded = applyBounds(acc, bounds);
      if (bounded !== acc) {
        steps.push({ source: "bounds", op: "override", value: bounded, subtotal: bounded });
      }
      stepCache.set(id, steps);
      return steps;
    }

    function resolveValue(id: string): number {
      const cached = valueCache.get(id);
      if (cached !== undefined) return cached;
      const steps = resolveSteps(id);
      const value = steps.length === 0 ? 0 : steps[steps.length - 1].subtotal;
      valueCache.set(id, value);
      return value;
    }

    function invalidate(ids: Iterable<string>): void {
      for (const id of ids) {
        for (const target of affected(id)) {
          valueCache.delete(target);
          stepCache.delete(target);
        }
      }
    }

    function cloneBase(): Record<string, number> {
      const out: Record<string, number> = {};
      for (const [id, value] of baseValues) out[id] = value;
      return out;
    }
    function cloneSourceMaps(): Map<string, Map<string, StatContribution[]>> {
      const clone = new Map<string, Map<string, StatContribution[]>>();
      for (const [sourceId, mods] of sources) {
        const inner = new Map<string, StatContribution[]>();
        for (const [statId, list] of mods) inner.set(statId, list.map((c) => ({ ...c })));
        clone.set(sourceId, inner);
      }
      return clone;
    }

    return {
      get(id) {
        if (!knows(id)) throw new Error(`unknown stat: ${id}`);
        return resolveValue(id);
      },
      getBase(id) {
        const inputDef = inputs.get(id);
        if (!inputDef) throw new Error(`not an input stat: ${id}`);
        return baseValues.get(id) ?? inputDef.base ?? inputDef.min ?? 0;
      },
      setBase(id, value) {
        if (!inputs.has(id)) throw new Error(`not an input stat: ${id}`);
        baseValues.set(id, value);
        invalidate([id]);
      },
      addSource(sourceId, mods) {
        const map = new Map<string, StatContribution[]>();
        for (const [statId, entry] of Object.entries(mods)) {
          if (!knows(statId)) throw new Error(`source "${sourceId}" targets unknown stat "${statId}"`);
          map.set(statId, normalizeEntry(entry));
        }
        // Replacing a source must invalidate stats it USED to target, not just its new targets.
        const touched = new Set<string>(map.keys());
        for (const statId of sources.get(sourceId)?.keys() ?? []) touched.add(statId);
        sources.set(sourceId, map);
        invalidate(touched);
      },
      removeSource(sourceId) {
        const map = sources.get(sourceId);
        if (!map) return false;
        sources.delete(sourceId);
        invalidate(map.keys());
        return true;
      },
      hasSource(sourceId) {
        return sources.has(sourceId);
      },
      sources() {
        return Array.from(sources.keys());
      },
      values() {
        const out: Record<string, number> = {};
        for (const id of allIds) out[id] = resolveValue(id);
        return out;
      },
      explain(id) {
        if (!knows(id)) throw new Error(`unknown stat: ${id}`);
        const steps = resolveSteps(id).map((step) => ({ ...step }));
        return { id, value: resolveValue(id), steps };
      },
      preview(mutate) {
        const draft = makeSheet(cloneBase(), cloneSourceMaps());
        mutate(draft);
        return draft.values();
      },
      toJSON() {
        const sourcesOut: Record<string, Record<string, StatContribution[]>> = {};
        for (const [sourceId, mods] of sources) {
          const inner: Record<string, StatContribution[]> = {};
          for (const [statId, list] of mods) inner[statId] = list.map((c) => ({ ...c }));
          sourcesOut[sourceId] = inner;
        }
        return { base: cloneBase(), sources: sourcesOut };
      },
    };
  }

  return {
    inputIds,
    derivedIds,
    create(base) {
      return makeSheet({ ...(base ?? {}) }, new Map());
    },
    restore(state) {
      const sources = new Map<string, Map<string, StatContribution[]>>();
      for (const [sourceId, mods] of Object.entries(state.sources ?? {})) {
        const inner = new Map<string, StatContribution[]>();
        for (const [statId, list] of Object.entries(mods)) inner.set(statId, list.map((c) => ({ ...c })));
        sources.set(sourceId, inner);
      }
      return makeSheet({ ...(state.base ?? {}) }, sources);
    },
  };
}

/**
 * Bridge the shared {@link StatModifierSet} shape (add/multiply, used by talents, items,
 * and buffs) into stat-graph contributions, so a ranked talent tree or gear roll feeds
 * the graph as one named source instead of a parallel store.
 *
 * @capability stat-graph-bridge feed an existing StatModifierSet into a stat-graph source
 */
export function statModifierContributions<TStat extends string>(
  source: string,
  set: StatModifierSet<TStat>,
): Record<string, StatContribution[]> {
  const out: Record<string, StatContribution[]> = {};
  for (const stat of Object.keys(set) as TStat[]) {
    const modifier: StatModifier | undefined = set[stat];
    if (!modifier) continue;
    const list: StatContribution[] = [];
    if (modifier.add !== undefined) list.push({ source, op: "add", value: modifier.add });
    if (modifier.multiply !== undefined) list.push({ source, op: "mul", value: modifier.multiply });
    if (list.length > 0) out[stat] = list;
  }
  return out;
}
