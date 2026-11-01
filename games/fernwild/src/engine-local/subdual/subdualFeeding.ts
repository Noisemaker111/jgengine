// framework-ok: only Fernwild uses this; the second adopter extracts it (#2837)
// @skill jgengine-gameplay
import { evalCurve, type Curve } from "@jgengine/core/progression/leveling";
import { evaluatePredicate, type Predicate } from "@jgengine/core/rules/predicate";
import { changeMeter, createMeter, tickMeter, type MeterState } from "@jgengine/core/stats/statPool";

/**
 * One food a subdued creature will eat. The order foods are listed in is the order it prefers
 * them; every number is the caller's.
 */
export interface FeedingFood {
  /** Meals a full feed takes, by the creature's level. */
  meals: Curve;
  /** Seconds a full feed takes at that level: meals come every `seconds / meals`. */
  seconds: Curve;
  /** What one meal costs the win's quality, as a weight: quality becomes `quality / (1 + weight x quality)`. */
  cost: number;
}

/** How one kind of creature goes down and is won over. Every rate, list and threshold is the caller's. */
export interface SubdualFeedingConfig {
  /** Subdual the creature holds at a level, which is its meter's max. */
  capacity: Curve;
  /** Subdual it sheds per second, by level. */
  drain: Curve;
  /** Foods by item id: it eats the first one it holds. */
  foods: Readonly<Record<string, FeedingFood>>;
  /** What a hit costs the win's quality while it is down, per share of its max health taken. */
  hitCost: number;
  /** Progress lost per second while it is down with nothing it will eat. */
  starveLoss: number;
  /** When it counts as subdued, over the facts `{ value, max, share }`; `share >= 1` by default. */
  subduedWhen?: Predicate;
}

/** A dose that releases into the subdual meter over some seconds. */
export interface FeedingDose {
  amount: number;
  seconds: number;
}

/** One tracked creature's progress. Plain data, JSON round-trips. */
export interface SubdualFeedingState {
  level: number;
  /** What holds it down: a hit fills it, time drains it. */
  subdual: MeterState;
  /** How far the win has come, 0..1. */
  progress: MeterState;
  /** Quality of the win so far, 0..1: meals and hits lower it. */
  quality: MeterState;
  /** Seconds until it next eats. */
  nextMeal: number;
  /** Doses still releasing: amount left and seconds left. */
  doses: FeedingDose[];
  /** Down and feeding rather than free. */
  subdued: boolean;
}

/** What changed this tick. */
export type SubdualFeedingEvent =
  | { type: "subdued" }
  | { type: "ate"; itemId: string }
  | { type: "released" }
  | { type: "won"; quality: number };

/** What a subdued creature holds, as the feeding loop reads and spends it. */
export interface FeedingSupply {
  /** How many of `itemId` it holds. */
  count(itemId: string): number;
  /** Remove one `itemId`; false when there is none. */
  take(itemId: string): boolean;
}

/**
 * Winning over creatures by keeping them subdued and feeding them: hits and doses fill a subdual
 * meter, the creature goes down once it reaches its capacity, it eats what it holds on its own
 * clock (the first food in the caller's list it has), each meal fills the progress meter and costs
 * quality, damage taken while down costs quality too, and it gets away — losing the progress — when
 * the subdual meter empties. Levels scale the caller's tables, never a formula here.
 */
export interface SubdualFeeding {
  /** Start tracking a creature of `kind` at `level` (a no-op when already tracked). */
  track(id: string, kind: string, level: number): void;
  /** Stop tracking (it died, it was won, it despawned). */
  forget(id: string): void;
  /** The creature's progress, or null when untracked. */
  state(id: string): Readonly<SubdualFeedingState> | null;
  /** Subdual capacity for a tracked creature. */
  capacity(id: string): number;
  /** Add subdual from a hit or a sedative; true when this put it down. */
  subdue(id: string, amount: number): boolean;
  /** Damage taken while down, as a share of its max health: costs quality. */
  hurt(id: string, share: number): void;
  /** Force-feed a dose: its amount releases over its seconds. */
  dose(id: string, dose: FeedingDose): void;
  /**
   * Advance every tracked creature; `supplyOf` hands back what a subdued one holds. `pace` is how
   * much faster meals come, while the subdual meter keeps draining at its own rate.
   */
  tick(dt: number, supplyOf: (id: string) => FeedingSupply | null, pace?: number): { id: string; event: SubdualFeedingEvent }[];
  snapshot(): Record<string, SubdualFeedingState & { kind: string }>;
  restore(data: Record<string, SubdualFeedingState & { kind: string }>): void;
  reset(): void;
}

const SUBDUED: Predicate = { gte: ["share", 1] };

/** Shares like 1/3 never sum to the meter's max exactly; this close counts as there. */
const NEAR_FULL = 1e-9;

function freshState(config: SubdualFeedingConfig, level: number): SubdualFeedingState {
  return {
    level,
    subdual: createMeter({ current: 0, max: Math.max(0, evalCurve(config.capacity, level)) }),
    progress: createMeter({ current: 0, max: 1 }),
    quality: createMeter({ max: 1 }),
    nextMeal: 0,
    doses: [],
    subdued: false,
  };
}

function knockDown(state: SubdualFeedingState, config: SubdualFeedingConfig): boolean {
  if (state.subdued) return false;
  const value = state.subdual.pool.current;
  const max = state.subdual.pool.max;
  const facts = { value, max, share: max <= 0 ? 1 : value / max };
  if (!evaluatePredicate(config.subduedWhen ?? SUBDUED, facts)) return false;
  state.subdued = true;
  state.nextMeal = 0;
  return true;
}

function mealInterval(food: FeedingFood, level: number): number {
  return evalCurve(food.seconds, level) / Math.max(1, evalCurve(food.meals, level));
}

function spendQuality(quality: MeterState, weight: number): MeterState {
  const current = quality.pool.current;
  const next = current / (1 + Math.max(0, weight) * current);
  return changeMeter(quality, next - current).meter;
}

function cloneMeter(meter: MeterState): MeterState {
  return { pool: { ...meter.pool }, sinceDrop: meter.sinceDrop, sinceFill: meter.sinceFill };
}

function cloneState(state: SubdualFeedingState): SubdualFeedingState {
  return {
    level: state.level,
    subdual: cloneMeter(state.subdual),
    progress: cloneMeter(state.progress),
    quality: cloneMeter(state.quality),
    nextMeal: state.nextMeal,
    doses: state.doses.map((dose) => ({ amount: dose.amount, seconds: dose.seconds })),
    subdued: state.subdued,
  };
}

/**
 * Track subdual, feeding and quality for every creature the caller names.
 *
 * @capability subdual-feeding win over a creature by keeping it subdued and feeding it, with its quality and doses
 */
export function createSubdualFeeding(configs: Readonly<Record<string, SubdualFeedingConfig>>): SubdualFeeding {
  const tracked = new Map<string, { kind: string; state: SubdualFeedingState }>();
  const configOf = (kind: string): SubdualFeedingConfig | null => configs[kind] ?? null;
  return {
    track(id, kind, level) {
      if (tracked.has(id)) return;
      const config = configOf(kind);
      if (config === null) throw new Error(`subdualFeeding: no config for kind "${kind}"`);
      tracked.set(id, { kind, state: freshState(config, level) });
    },
    forget: (id) => void tracked.delete(id),
    state: (id) => tracked.get(id)?.state ?? null,
    capacity(id) {
      const entry = tracked.get(id);
      return entry === undefined ? 0 : entry.state.subdual.pool.max;
    },
    subdue(id, amount) {
      const entry = tracked.get(id);
      if (entry === undefined) return false;
      const config = configOf(entry.kind);
      if (config === null) return false;
      entry.state.subdual = changeMeter(entry.state.subdual, amount).meter;
      return knockDown(entry.state, config);
    },
    hurt(id, share) {
      const entry = tracked.get(id);
      if (entry === undefined || !entry.state.subdued) return;
      const config = configOf(entry.kind);
      if (config === null) return;
      entry.state.quality = spendQuality(entry.state.quality, Math.max(0, share) * config.hitCost);
    },
    dose(id, dose) {
      const entry = tracked.get(id);
      if (entry === undefined) return;
      entry.state.doses.push({ amount: dose.amount, seconds: Math.max(0.001, dose.seconds) });
    },
    tick(dt, supplyOf, pace = 1) {
      const events: { id: string; event: SubdualFeedingEvent }[] = [];
      const speed = Math.max(0, pace);
      for (const [id, entry] of tracked) {
        const config = configOf(entry.kind);
        if (config === null) continue;
        const state = entry.state;
        // Doses hold the meter up while they release; otherwise it drains at the level's rate.
        let released = 0;
        for (const dose of state.doses) {
          const step = Math.min(dt, dose.seconds);
          const part = dose.amount * (step / dose.seconds);
          released += part;
          dose.amount -= part;
          dose.seconds -= step;
        }
        state.doses = state.doses.filter((dose) => dose.seconds > 1e-6);
        const drain = state.doses.length > 0 ? 0 : Math.max(0, evalCurve(config.drain, state.level)) * dt;
        state.subdual = changeMeter(state.subdual, released - drain).meter;
        if (!state.subdued) {
          if (knockDown(state, config)) events.push({ id, event: { type: "subdued" } });
          continue;
        }
        if (state.subdual.pool.current <= state.subdual.pool.min) {
          entry.state = freshState(config, state.level);
          events.push({ id, event: { type: "released" } });
          continue;
        }
        state.nextMeal -= dt * speed;
        if (state.nextMeal > 0) continue;
        const supply = supplyOf(id);
        const itemId = supply === null ? undefined : Object.keys(config.foods).find((candidate) => supply.count(candidate) > 0);
        const food = itemId === undefined ? undefined : config.foods[itemId];
        if (supply === null || itemId === undefined || food === undefined) {
          state.progress = tickMeter(state.progress, { decay: config.starveLoss }, dt).meter;
          state.nextMeal = 0;
          continue;
        }
        supply.take(itemId);
        const filled = changeMeter(state.progress, 1 / Math.max(1, evalCurve(food.meals, state.level)));
        state.progress = filled.meter;
        state.quality = spendQuality(state.quality, food.cost);
        state.nextMeal = mealInterval(food, state.level);
        events.push({ id, event: { type: "ate", itemId } });
        if (filled.change.hitMax || filled.meter.pool.max - filled.meter.pool.current <= NEAR_FULL) {
          events.push({ id, event: { type: "won", quality: state.quality.pool.current } });
          tracked.delete(id);
        }
      }
      return events;
    },
    snapshot: () => Object.fromEntries([...tracked].map(([id, entry]) => [id, { ...cloneState(entry.state), kind: entry.kind }])),
    restore(data) {
      tracked.clear();
      for (const [id, { kind, ...state }] of Object.entries(data)) tracked.set(id, { kind, state: cloneState(state) });
    },
    reset: () => tracked.clear(),
  };
}
