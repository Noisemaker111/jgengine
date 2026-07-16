import type { GameFeatures } from "./defineGame";
import type { GameContext } from "../runtime/gameContext";
import type { SnapshotModule } from "../runtime/worldSnapshot";

/**
 * How a system is scheduled. Omit `tick` (or use only `events`) for event-driven systems.
 * Multiple systems may share the same channel; order within a channel is deterministic by stage
 * then optional `before`/`after` constraints — never import order.
 */
export type SystemTick =
  | {
      type: "fixed";
      /** Steps per game-second. Default 60. */
      rate?: number;
      stage?: string;
      after?: string | readonly string[];
      before?: string | readonly string[];
    }
  | {
      type: "frame";
      stage?: string;
      after?: string | readonly string[];
      before?: string | readonly string[];
    }
  | {
      type: "interval";
      /** Period in game-seconds between runs. */
      every: number;
      stage?: string;
      after?: string | readonly string[];
      before?: string | readonly string[];
    }
  | { type: "manual" };

/** Event name → handler. Payload is the engine event shape for that name. */
export type SystemEventHandlers = {
  readonly [eventName: string]: (ctx: GameContext, event: unknown) => void;
};

/**
 * A reusable game capability — lifecycle, timing, events, and optional save / replication /
 * reset / disposal. Pass instances via `defineGame({ systems })`. Prefer one system per meaningful
 * capability (`combat`, `quests`), not per micro-tick.
 *
 * @capability game-system declare a composable capability with its own schedule and lifecycle
 */
export interface SystemDefinition {
  readonly id: string;
  /**
   * Timing channel. Omit for event-only systems (handlers in {@link events} still run).
   * `manual` systems install but never auto-tick — call them yourself or leave as infrastructure.
   */
  tick?: SystemTick;
  /** Other system ids that must also be installed; validated when the schedule compiles. */
  dependsOn?: readonly string[];
  /**
   * Opt-in `ctx.game.*` feature(s) this system needs. Installing the system enables them — no
   * separate `features: { quest: true }` flag required (you may still set flags for systems-free games).
   */
  feature?: keyof GameFeatures | readonly (keyof GameFeatures)[];
  /** Once per world boot, before {@link start}. */
  create?(ctx: GameContext): void;
  /** Once per world boot, after every system's `create`. */
  start?(ctx: GameContext): void;
  /** Per schedule fire — `dt` is game-seconds for the step (fixed/frame/interval). */
  update?(ctx: GameContext, dt: number): void;
  events?: SystemEventHandlers;
  /**
   * Whole-world save contribution. A factory form runs after `create` so closures can close over
   * system state. Registered into `ctx.game.save` coverage.
   */
  save?: SnapshotModule | ((ctx: GameContext) => SnapshotModule | undefined);
  /**
   * Host→client replication contribution. Same factory form as {@link save}; registered into
   * `ctx.snapshot` / `ctx.hydrate`.
   */
  replicate?: SnapshotModule | ((ctx: GameContext) => SnapshotModule | undefined);
  /** Run on scenario/run reset — clear run-scoped state while meta may survive. */
  reset?(ctx: GameContext): void;
  /** Run when the world is torn down (mode switch, unmount). */
  dispose?(ctx: GameContext): void;
}

/**
 * Declare a composable game system. Pure data + hooks — the engine compiles the schedule and
 * installs lifecycle when the game boots.
 */
export function defineSystem(definition: SystemDefinition): SystemDefinition {
  if (definition.id.trim().length === 0) {
    throw new Error("defineSystem: id must be non-empty");
  }
  if (definition.tick?.type === "interval" && !(definition.tick.every > 0)) {
    throw new Error(`defineSystem "${definition.id}": interval.every must be > 0`);
  }
  if (definition.tick?.type === "fixed" && definition.tick.rate !== undefined && !(definition.tick.rate > 0)) {
    throw new Error(`defineSystem "${definition.id}": fixed.rate must be > 0`);
  }
  return definition;
}

/** Collect feature flags implied by a system list (OR-merge; installing a system activates its capability).
 * @internal */
export function featuresFromSystems(systems: readonly SystemDefinition[] | undefined): GameFeatures {
  const out: GameFeatures = {};
  if (systems === undefined) return out;
  for (const system of systems) {
    if (system.feature === undefined) continue;
    const keys = typeof system.feature === "string" ? [system.feature] : system.feature;
    for (const key of keys) out[key] = true;
  }
  return out;
}

/** OR-merge explicit `features` with flags implied by installed systems.
 * @internal */
export function mergeSystemFeatures(
  explicit: GameFeatures | undefined,
  systems: readonly SystemDefinition[] | undefined,
): GameFeatures | undefined {
  const fromSystems = featuresFromSystems(systems);
  if (explicit === undefined) {
    return Object.keys(fromSystems).length === 0 ? undefined : fromSystems;
  }
  const merged: GameFeatures = { ...explicit };
  for (const key of Object.keys(fromSystems) as (keyof GameFeatures)[]) {
    if (fromSystems[key] === true) merged[key] = true;
  }
  return merged;
}
