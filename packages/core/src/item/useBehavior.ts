import type { ItemUseInput } from "./use";

/**
 * Per-behavior configuration stored on an item as plain data (e.g. charge time,
 * projectile id). Kept opaque here so no game noun leaks into item core.
 */
export type BehaviorConfig = Record<string, unknown>;

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

export interface UseBehaviorContext<TWorld> {
  world: TWorld;
  config: BehaviorConfig;
  state: BehaviorState;
  input: ItemUseInput;
}

export interface UseBehaviorOutcome<TWorld> {
  world: TWorld;
  state?: BehaviorState;
  error?: string;
  stop?: boolean;
}

export interface UseBehaviorRejection {
  reason: string;
}

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
  apply(ctx: UseBehaviorContext<TWorld>): UseBehaviorOutcome<TWorld>;
}

/**
 * A resolved, ordered composition of behaviors for one item. Dispatch is
 * transactional: `apply` commits the folded world only if every behavior in the
 * chain succeeds, otherwise it returns the original world and state plus the
 * first error.
 */
export interface ComposedUse<TWorld> {
  order(): readonly string[];
  initialState(): SerializedBehaviorState;
  can(world: TWorld, state: SerializedBehaviorState, input: ItemUseInput): UseBehaviorRejection | null;
  apply(
    world: TWorld,
    state: SerializedBehaviorState,
    input: ItemUseInput,
  ): { world: TWorld; state: SerializedBehaviorState; error?: string };
}

export type CompositionResult<TWorld> =
  | { status: "ok"; composed: ComposedUse<TWorld> }
  | { status: "error"; reason: "unknown-behavior"; id: string }
  | { status: "error"; reason: "duplicate-behavior"; id: string }
  | { status: "error"; reason: "missing-capability"; id: string; capability: string }
  | { status: "error"; reason: "conflict"; id: string; conflictsWith: string };

export interface UseBehaviorRegistry<TWorld> {
  register(defs: readonly UseBehaviorDef<TWorld>[]): void;
  has(id: string): boolean;
  get(id: string): UseBehaviorDef<TWorld> | null;
  ids(): string[];
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

/** @capability item-use-composition compose pluggable, ordered item use-behaviors from serializable references */
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
