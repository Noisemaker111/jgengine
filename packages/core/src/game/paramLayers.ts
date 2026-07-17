/**
 * Layered numeric parameter modifiers over a caller-owned schema.
 *
 * A {@link ParamLayer} is a named, serializable bundle of transforms ({@link ParamOp}) keyed by
 * parameter name. {@link resolveParams} folds an ordered stack of layers over a base value map and
 * returns a deterministic {@link ParamSnapshot} — the effective values plus a full provenance trace
 * of every op that touched each parameter. Layers order by ascending `priority` (ties broken by
 * active-list index, a stable sort), and within a layer a parameter's ops fold left-to-right, so the
 * stacking order is fully well-defined and reproducible.
 *
 * The primitive is genre-agnostic: difficulty tiers, game modes, mutators, accessibility presets,
 * events, NG+, server rules, and challenge runs are all just ordered layers over different schemas.
 * Save files store a {@link LayerSelection} (ordered layer ids); a {@link LayerRegistry} resolves
 * those ids back to layers and reports unknown ids so migration and unknown saved content degrade
 * gracefully rather than throwing.
 */
import { type Curve, evalCurve } from "./progression";

/**
 * A single transform applied to one numeric parameter. `set` overrides, `add`/`multiply` accumulate,
 * `clamp` bounds, and `curve` remaps the running value through a {@link Curve} (the same curve
 * primitive progression tracks use), so a caller can reshape a value non-linearly mid-stack.
 */
export type ParamOp =
  | { readonly kind: "set"; readonly value: number }
  | { readonly kind: "add"; readonly value: number }
  | { readonly kind: "multiply"; readonly value: number }
  | { readonly kind: "clamp"; readonly min?: number; readonly max?: number }
  | { readonly kind: "curve"; readonly curve: Curve };

/** Per-parameter ops contributed by one layer — a single op or an ordered list folded in sequence. */
export type LayerOps = Readonly<Record<string, ParamOp | readonly ParamOp[]>>;

/**
 * A named, serializable bundle of parameter transforms with a stable id and precedence. `label` is an
 * optional display name that may intentionally differ from the applied ops (e.g. a tier shown as
 * "Mayhem 4" whose real multipliers are data). Higher `priority` applies later — on top — and ties
 * break by the layer's index in the active list, so ordering is deterministic.
 */
export interface ParamLayer {
  readonly id: string;
  readonly label?: string;
  /** Higher applies later (stacks on top). Ties break by active-list index. Default `0`. */
  readonly priority?: number;
  readonly ops: LayerOps;
}

/** One recorded fold step — which layer's op ran and the value before/after. Contribution provenance. */
export interface ParamContribution {
  readonly layerId: string;
  readonly op: ParamOp;
  readonly from: number;
  readonly to: number;
}

/** A resolved effective-parameter snapshot: final `values` plus the ordered op trace per parameter. */
export interface ParamSnapshot {
  readonly values: Readonly<Record<string, number>>;
  readonly contributions: Readonly<Record<string, readonly ParamContribution[]>>;
}

/** A serializable, ordered reference to layers by stable id — what a save file or session setup stores. */
export type LayerSelection = readonly string[];

/** A single conflict surfaced by {@link validateLayers}. */
export interface LayerConflict {
  readonly kind: "duplicate-id" | "set-conflict";
  /** The affected parameter, for `set-conflict`. */
  readonly param?: string;
  readonly layerIds: readonly string[];
}

/** One parameter's change between two value maps, for preview/diff surfaces. */
export interface ParamDelta {
  readonly param: string;
  readonly from: number;
  readonly to: number;
  readonly delta: number;
}

function applyOp(value: number, op: ParamOp): number {
  switch (op.kind) {
    case "set":
      return op.value;
    case "add":
      return value + op.value;
    case "multiply":
      return value * op.value;
    case "clamp": {
      let next = value;
      if (op.min !== undefined) next = Math.max(op.min, next);
      if (op.max !== undefined) next = Math.min(op.max, next);
      return next;
    }
    case "curve":
      return evalCurve(op.curve, value);
  }
}

/**
 * Order layers into their well-defined application sequence: ascending `priority`, ties broken by the
 * layer's index in `layers` (a stable sort). Same input, same order, on every platform.
 *
 * @capability param-layers order active parameter layers into their deterministic application sequence
 */
export function orderLayers(layers: readonly ParamLayer[]): readonly ParamLayer[] {
  return layers
    .map((layer, index) => ({ layer, index }))
    .sort((a, b) => (a.layer.priority ?? 0) - (b.layer.priority ?? 0) || a.index - b.index)
    .map((entry) => entry.layer);
}

/**
 * Fold an ordered stack of layers over `base` and return the effective {@link ParamSnapshot}. Layers
 * apply in {@link orderLayers} sequence; within a layer each parameter's ops fold left-to-right. Every
 * op is recorded in `contributions` for provenance/preview. Parameters a layer introduces but `base`
 * omits start from `0`. Pure and deterministic — no ambient randomness or time.
 *
 * @capability param-layers resolve base values plus ordered layers into an effective parameter snapshot
 */
export function resolveParams(
  base: Readonly<Record<string, number>>,
  layers: readonly ParamLayer[],
): ParamSnapshot {
  const values: Record<string, number> = { ...base };
  const contributions: Record<string, ParamContribution[]> = {};
  for (const layer of orderLayers(layers)) {
    for (const [param, opOrList] of Object.entries(layer.ops)) {
      const ops = Array.isArray(opOrList) ? opOrList : [opOrList];
      let current = values[param] ?? 0;
      const trace = (contributions[param] ??= []);
      for (const op of ops) {
        const next = applyOp(current, op);
        trace.push({ layerId: layer.id, op, from: current, to: next });
        current = next;
      }
      values[param] = current;
    }
  }
  return { values, contributions };
}

/**
 * Detect design conflicts in a layer set before resolving: duplicate ids, and competing `set` ops on
 * the same parameter at the same priority (order-dependent, so worth surfacing). Returns an empty
 * array when the set is clean, so callers can gate a difficulty/session build on it.
 *
 * @capability param-layers validate a layer set for duplicate ids and competing set-op conflicts
 */
export function validateLayers(layers: readonly ParamLayer[]): readonly LayerConflict[] {
  const conflicts: LayerConflict[] = [];
  const counts = new Map<string, number>();
  for (const layer of layers) counts.set(layer.id, (counts.get(layer.id) ?? 0) + 1);
  for (const [id, count] of counts) {
    if (count > 1) conflicts.push({ kind: "duplicate-id", layerIds: [id] });
  }
  const setters = new Map<string, { layerId: string; priority: number }[]>();
  for (const layer of layers) {
    const priority = layer.priority ?? 0;
    for (const [param, opOrList] of Object.entries(layer.ops)) {
      const ops = Array.isArray(opOrList) ? opOrList : [opOrList];
      if (!ops.some((op) => op.kind === "set")) continue;
      const existing = setters.get(param);
      if (existing) existing.push({ layerId: layer.id, priority });
      else setters.set(param, [{ layerId: layer.id, priority }]);
    }
  }
  for (const [param, entries] of setters) {
    const byPriority = new Map<number, Set<string>>();
    for (const entry of entries) {
      const bucket = byPriority.get(entry.priority);
      if (bucket) bucket.add(entry.layerId);
      else byPriority.set(entry.priority, new Set([entry.layerId]));
    }
    for (const ids of byPriority.values()) {
      if (ids.size > 1) conflicts.push({ kind: "set-conflict", param, layerIds: [...ids] });
    }
  }
  return conflicts;
}

/**
 * Compute the per-parameter deltas between two value maps — the preview/diff of applying a change,
 * for showing a player what a difficulty tier or mutator will do before they commit.
 *
 * @capability param-layers diff two parameter value maps into per-parameter deltas for preview
 */
export function diffParams(
  before: Readonly<Record<string, number>>,
  after: Readonly<Record<string, number>>,
): readonly ParamDelta[] {
  const params = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
  const deltas: ParamDelta[] = [];
  for (const param of [...params].sort()) {
    const from = before[param] ?? 0;
    const to = after[param] ?? 0;
    if (from !== to) deltas.push({ param, from, to, delta: to - from });
  }
  return deltas;
}

/** Registered lookup of {@link ParamLayer}s by stable id, resolving serialized selections and unknowns. */
export interface LayerRegistry {
  register(layer: ParamLayer): void;
  has(id: string): boolean;
  get(id: string): ParamLayer | undefined;
  all(): readonly ParamLayer[];
  /**
   * Resolve a saved {@link LayerSelection} to concrete layers in the given order, collecting any ids
   * with no registered layer into `unknown` (dropped, never thrown) so migration and stale saves
   * degrade gracefully.
   */
  resolve(ids: LayerSelection): { readonly layers: readonly ParamLayer[]; readonly unknown: readonly string[] };
}

/**
 * Create a {@link LayerRegistry} — the registration seam difficulty tiers, mutators, and presets
 * install into. Duplicate ids throw at registration; unknown ids at resolve time are reported, not
 * fatal, which is what keeps saved sessions reproducible across content/version drift.
 *
 * @capability param-layers register parameter layers by stable id and resolve serialized selections
 */
export function createLayerRegistry(initial?: readonly ParamLayer[]): LayerRegistry {
  const layers = new Map<string, ParamLayer>();
  const register = (layer: ParamLayer): void => {
    if (layers.has(layer.id)) throw new Error(`param layer "${layer.id}" is already registered`);
    layers.set(layer.id, layer);
  };
  if (initial) for (const layer of initial) register(layer);
  return {
    register,
    has: (id) => layers.has(id),
    get: (id) => layers.get(id),
    all: () => [...layers.values()],
    resolve(ids) {
      const resolved: ParamLayer[] = [];
      const unknown: string[] = [];
      for (const id of ids) {
        const layer = layers.get(id);
        if (layer) resolved.push(layer);
        else unknown.push(id);
      }
      return { layers: resolved, unknown };
    },
  };
}

/**
 * Reproducible session setup in one call: resolve a saved {@link LayerSelection} through a registry,
 * fold the found layers over `base`, and return the snapshot alongside any unknown ids. The same
 * base + registry + selection always yields the same snapshot.
 *
 * @capability param-layers resolve a saved layer selection into an effective snapshot with unknown-id report
 */
export function resolveSelection(
  base: Readonly<Record<string, number>>,
  registry: LayerRegistry,
  ids: LayerSelection,
): { readonly snapshot: ParamSnapshot; readonly unknown: readonly string[] } {
  const { layers, unknown } = registry.resolve(ids);
  return { snapshot: resolveParams(base, layers), unknown };
}
