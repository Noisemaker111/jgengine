import type { ItemUseInput } from "./use";

/**
 * Per-behavior configuration stored on an item as plain data (e.g. charge time,
 * projectile id). Kept opaque here so no game noun leaks into item core.
 */
export type BehaviorConfig = Record<string, unknown>;

/**
 * A single behavior's mutable, serializable runtime state (e.g. current charge,
 * rounds queued). Composed state is a map of these keyed by behavior id.
 */
export type BehaviorState = Record<string, unknown>;

/**
 * A serialized snapshot of every behavior's state on one item, keyed by
 * behavior id. Round-trips through JSON so it can live in a saved game.
 */
export type SerializedBehaviorState = Record<string, BehaviorState>;

/**
 * The reference an item stores for one composed behavior: a stable behavior id,
 * optional config, and an optional order override. Pure data — the item core
 * never holds the implementation, only this reference.
 */
export interface UseBehaviorRef {
  id: string;
  config?: BehaviorConfig;
  order?: number;
}

/**
 * The context handed to each behavior hook: the shared folded `world`, this
 * behavior's own `config` and `state` slice, and the triggering use input.
 */
export interface UseBehaviorContext<TWorld> {
  world: TWorld;
  config: BehaviorConfig;
  state: BehaviorState;
  input: ItemUseInput;
}

/**
 * The result of applying one behavior: the (possibly advanced) world, this
 * behavior's updated state, an optional error that aborts the chain, and an
 * optional `stop` that ends the chain after a successful apply.
 */
export interface UseBehaviorOutcome<TWorld> {
  world: TWorld;
  state?: BehaviorState;
  error?: string;
  stop?: boolean;
}

/** A reason a behavior refused a use, surfaced from `can`. */
export interface UseBehaviorRejection {
  reason: string;
}

/**
 * A registered behavior implementation. The combat/game side registers these
 * (charge, thrown-reload, projectile-replacement, …); the item core only ever
 * stores a {@link UseBehaviorRef} to one by id. Hooks are the lifecycle: `init`
 * builds serializable state, `can` gates, `apply` folds the world.
 */
export interface UseBehaviorDef<TWorld> {
  id: string;
  /** Lower runs first; ties break on the item's ref order. Default 0. */
  order?: number;
  /** Capability tokens the host must supply at compose time for this behavior. */
  requires?: readonly string[];
  /** Behavior ids that cannot coexist with this one on the same item. */
  conflicts?: readonly string[];
  /** Build initial serializable state from config; defaults to an empty object. */
  init?(config: BehaviorConfig): BehaviorState;
  /** Gate the use before applying; return a rejection or null to allow. */
  can?(ctx: UseBehaviorContext<TWorld>): UseBehaviorRejection | null;
  /** Apply the behavior, folding the shared world and this behavior's state. */
  apply(ctx: UseBehaviorContext<TWorld>): UseBehaviorOutcome<TWorld>;
}

/**
 * A resolved, ordered composition of behaviors for one item. Dispatch is
 * transactional: `apply` commits the folded world only if every behavior in the
 * chain succeeds, otherwise it returns the original world and state plus the
 * first error.
 */
export interface ComposedUse<TWorld> {
  /** The resolved run order as behavior ids. */
  order(): readonly string[];
  /** Fresh per-behavior state for a new item instance, keyed by behavior id. */
  initialState(): SerializedBehaviorState;
  /** First rejection across behaviors (in order), or null if all allow the use. */
  can(world: TWorld, state: SerializedBehaviorState, input: ItemUseInput): UseBehaviorRejection | null;
  /** Run the chain in order; commit folded world+state only on full success. */
  apply(
    world: TWorld,
    state: SerializedBehaviorState,
    input: ItemUseInput,
  ): { world: TWorld; state: SerializedBehaviorState; error?: string };
}

/**
 * The outcome of composing an item's behavior refs: either a ready
 * {@link ComposedUse} or a structured error naming the offending behavior.
 */
export type CompositionResult<TWorld> =
  | { status: "ok"; composed: ComposedUse<TWorld> }
  | { status: "error"; reason: "unknown-behavior"; id: string }
  | { status: "error"; reason: "duplicate-behavior"; id: string }
  | { status: "error"; reason: "missing-capability"; id: string; capability: string }
  | { status: "error"; reason: "conflict"; id: string; conflictsWith: string };

/**
 * A registry of use-behavior implementations plus a composer that turns an
 * item's stored refs into an ordered, conflict-checked {@link ComposedUse}.
 */
export interface UseBehaviorRegistry<TWorld> {
  /** Register behavior implementations; throws on a duplicate id. */
  register(defs: readonly UseBehaviorDef<TWorld>[]): void;
  has(id: string): boolean;
  get(id: string): UseBehaviorDef<TWorld> | null;
  /** All registered behavior ids, in registration order. */
  ids(): string[];
  /** Resolve an item's refs into a composed dispatcher, or a structured error. */
  compose(
    refs: readonly UseBehaviorRef[],
    options?: { capabilities?: readonly string[] },
  ): CompositionResult<TWorld>;
}

interface ResolvedBehavior<TWorld> {
  ref: UseBehaviorRef;
  def: UseBehaviorDef<TWorld>;
}

function orderOf<TWorld>(entry: ResolvedBehavior<TWorld>): number {
  return entry.ref.order ?? entry.def.order ?? 0;
}

/**
 * Create an empty use-behavior registry. Games register their behaviors, then
 * compose each item's stored refs into a dispatcher whose serializable state
 * lives with the item.
 *
 * @capability item-use-composition compose pluggable, ordered item use-behaviors from serializable references
 */
export function createUseBehaviorRegistry<TWorld>(): UseBehaviorRegistry<TWorld> {
  const defs = new Map<string, UseBehaviorDef<TWorld>>();

  function compose(
    refs: readonly UseBehaviorRef[],
    options?: { capabilities?: readonly string[] },
  ): CompositionResult<TWorld> {
    const capabilities = new Set(options?.capabilities ?? []);
    const seen = new Set<string>();
    const resolved: ResolvedBehavior<TWorld>[] = [];

    for (const ref of refs) {
      if (seen.has(ref.id)) return { status: "error", reason: "duplicate-behavior", id: ref.id };
      seen.add(ref.id);
      const def = defs.get(ref.id);
      if (def === undefined) return { status: "error", reason: "unknown-behavior", id: ref.id };
      for (const capability of def.requires ?? []) {
        if (!capabilities.has(capability)) return { status: "error", reason: "missing-capability", id: ref.id, capability };
      }
      resolved.push({ ref, def });
    }

    for (const { def } of resolved) {
      for (const conflict of def.conflicts ?? []) {
        if (seen.has(conflict)) return { status: "error", reason: "conflict", id: def.id, conflictsWith: conflict };
      }
    }

    const ordered = resolved
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => orderOf(a.entry) - orderOf(b.entry) || a.index - b.index)
      .map(({ entry }) => entry);

    const composed: ComposedUse<TWorld> = {
      order() {
        return ordered.map((entry) => entry.def.id);
      },
      initialState() {
        const state: SerializedBehaviorState = {};
        for (const entry of ordered) state[entry.def.id] = entry.def.init?.(entry.ref.config ?? {}) ?? {};
        return state;
      },
      can(world, state, input) {
        for (const entry of ordered) {
          const rejection = entry.def.can?.({
            world,
            config: entry.ref.config ?? {},
            state: state[entry.def.id] ?? {},
            input,
          });
          if (rejection) return rejection;
        }
        return null;
      },
      apply(world, state, input) {
        let nextWorld = world;
        const nextState: SerializedBehaviorState = { ...state };
        for (const entry of ordered) {
          const config = entry.ref.config ?? {};
          const ctx: UseBehaviorContext<TWorld> = { world: nextWorld, config, state: nextState[entry.def.id] ?? {}, input };
          const rejection = entry.def.can?.(ctx);
          if (rejection) return { world, state, error: rejection.reason };
          const outcome = entry.def.apply(ctx);
          if (outcome.error !== undefined) return { world, state, error: outcome.error };
          nextWorld = outcome.world;
          if (outcome.state !== undefined) nextState[entry.def.id] = outcome.state;
          if (outcome.stop === true) break;
        }
        return { world: nextWorld, state: nextState };
      },
    };

    return { status: "ok", composed };
  }

  return {
    register(newDefs) {
      for (const def of newDefs) {
        if (defs.has(def.id)) throw new Error(`Use behavior "${def.id}" is already registered.`);
        defs.set(def.id, def);
      }
    },
    has(id) {
      return defs.has(id);
    },
    get(id) {
      return defs.get(id) ?? null;
    },
    ids() {
      return [...defs.keys()];
    },
    compose,
  };
}
