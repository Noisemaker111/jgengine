/** Linear blend from `a` to `b`. */
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * How one food tames one species, read straight off a taming table: how many it takes and how long
 * it takes at level 1 and at level 30. Between and past those levels the count and time scale
 * linearly, which is how ARK-style tables grow.
 */
export interface TamingFood {
  /** Items needed to tame a level-1 creature with only this food. */
  countAt1: number;
  /** Items needed at level 30. */
  countAt30: number;
  /** Seconds to tame a level-1 creature with only this food. */
  secondsAt1: number;
  /** Seconds at level 30. */
  secondsAt30: number;
  /**
   * Taming effectiveness lost per item eaten, as a weight in `1 / (1 + Σ weights)`. Preferred
   * kibble barely costs anything; plain meat or berries cost more. Default 0.03.
   */
  ineffectiveness?: number;
}

/** A species' knockout taming rules: its torpor, how it wakes, what it eats and in what order. */
export interface KnockoutTamingConfig {
  /** Torpor capacity at level 1 and its gain per level. */
  torpor: { base: number; perLevel: number };
  /** Torpor the creature sheds per second at level 1 and level 30 (ARK: 0.3 and 0.5). */
  torporDrain: { at1: number; at30: number };
  /** Fraction of max torpor that knocks it out. Default 1. */
  knockoutAt?: number;
  /** Foods by item id, in preference order: the first one it holds is the one it eats. */
  foods: Readonly<Record<string, TamingFood>>;
  /** Effectiveness weight per point of damage as a fraction of max health while it is down. Default 2. */
  damageIneffectiveness?: number;
  /** Fraction of the taming bar lost per second while it is down with nothing it will eat. Default 0.001. */
  starveLoss?: number;
}

/** Torpor the survivor can force into a downed creature: a narcotic's amount spread over seconds. */
export interface Narcotic {
  torpor: number;
  seconds: number;
}

/** One downed or wild creature's taming progress. Plain data, JSON round-trips. */
export interface TamingState {
  level: number;
  torpor: number;
  unconscious: boolean;
  /** Taming bar, 0..1. */
  progress: number;
  /** Sum of ineffectiveness weights so far; effectiveness is `1 / (1 + spent)`. */
  spent: number;
  /** Seconds until it next eats. */
  nextMeal: number;
  /** Narcotics still releasing torpor: amount left and seconds left. */
  dosing: { torpor: number; seconds: number }[];
}

/** What changed this tick. */
export type TamingEvent =
  | { type: "knockedOut" }
  | { type: "ate"; itemId: string }
  | { type: "woke" }
  | { type: "tamed"; effectiveness: number; bonusLevels: number };

/** The food it would eat now from what it holds, and how much a meal of it is worth. */
export interface TamingFeeder {
  /** How many of `itemId` the creature holds. */
  count(itemId: string): number;
  /** Remove one `itemId`; false when there is none. */
  take(itemId: string): boolean;
}

/**
 * Interpolate a level-1 / level-30 pair to `level`.
 * @capability knockout-taming knock a creature out with torpor and tame it by feeding, with taming effectiveness and bonus levels
 */
export function tamingScale(at1: number, at30: number, level: number): number {
  return lerp(at1, at30, (level - 1) / 29);
}

/**
 * Max torpor at `level`.
 * @capability knockout-taming knock a creature out with torpor and tame it by feeding, with taming effectiveness and bonus levels
 */
export function maxTorpor(config: KnockoutTamingConfig, level: number): number {
  return config.torpor.base + config.torpor.perLevel * (level - 1);
}

/**
 * Taming effectiveness from spent weights: 1 at a perfect tame.
 * @capability knockout-taming knock a creature out with torpor and tame it by feeding, with taming effectiveness and bonus levels
 */
export function tamingEffectiveness(state: TamingState): number {
  return 1 / (1 + state.spent);
}

/**
 * ARK's bonus levels: half the wild level, scaled by effectiveness, floored.
 * @capability knockout-taming knock a creature out with torpor and tame it by feeding, with taming effectiveness and bonus levels
 */
export function bonusLevels(level: number, effectiveness: number): number {
  return Math.floor((level * effectiveness) / 2);
}

function freshState(level: number): TamingState {
  return { level, torpor: 0, unconscious: false, progress: 0, spent: 0, nextMeal: 0, dosing: [] };
}

/**
 * Seconds between meals of `food` at `level`: the table's time spread over its count.
 * @capability knockout-taming knock a creature out with torpor and tame it by feeding, with taming effectiveness and bonus levels
 */
export function mealInterval(food: TamingFood, level: number): number {
  return tamingScale(food.secondsAt1, food.secondsAt30, level) / Math.max(1, tamingScale(food.countAt1, food.countAt30, level));
}

/**
 * Knockout taming for a world of creatures: hits and narcotics pile torpor on, a full bar knocks
 * the creature out, it eats what you put in its inventory on its own clock, each meal fills the
 * taming bar by one table-count's worth and costs effectiveness, and it wakes (losing the tame)
 * if torpor drains away first. The numbers are the species' taming table, not a formula to tune.
 *
 * @capability knockout-taming knock a creature out with torpor and tame it by feeding, with taming effectiveness and bonus levels
 */
export interface KnockoutTaming {
  /** Start tracking a creature of `species` at `level` (a no-op when already tracked). */
  track(id: string, species: string, level: number): void;
  /** Stop tracking (it died, it was tamed, it despawned). */
  forget(id: string): void;
  /** The creature's progress, or null when untracked. */
  state(id: string): Readonly<TamingState> | null;
  /** Torpor capacity for a tracked creature. */
  maxTorpor(id: string): number;
  /** Add torpor from a hit; returns true when this hit knocked it out. */
  addTorpor(id: string, amount: number): boolean;
  /** Damage taken while unconscious, as a fraction of its max health: costs effectiveness. */
  damage(id: string, fraction: number): void;
  /** Force-feed a narcotic: its torpor releases over its seconds. */
  dose(id: string, narcotic: Narcotic): void;
  /**
   * Advance every tracked creature; `feederOf` hands back what a downed creature holds. `speed` is the
   * world's taming-speed multiplier: meals come that much sooner while torpor drains at its own rate.
   */
  tick(dt: number, feederOf: (id: string) => TamingFeeder | null, speed?: number): { id: string; event: TamingEvent }[];
  snapshot(): Record<string, TamingState & { species: string }>;
  restore(data: Record<string, TamingState & { species: string }>): void;
  reset(): void;
}

/**
 * Track torpor and taming for every downed creature of the given species: hits add torpor, held food feeds it.
 * @capability knockout-taming knock a creature out with torpor and tame it by feeding, with taming effectiveness and bonus levels
 */
export function createKnockoutTaming(species: Readonly<Record<string, KnockoutTamingConfig>>): KnockoutTaming {
  const tracked = new Map<string, { species: string; state: TamingState }>();
  const configOf = (id: string) => {
    const entry = tracked.get(id);
    return entry === undefined ? null : { entry, config: species[entry.species]! };
  };
  const knock = (entry: { state: TamingState }, config: KnockoutTamingConfig): boolean => {
    const max = maxTorpor(config, entry.state.level);
    entry.state.torpor = Math.min(entry.state.torpor, max);
    if (entry.state.unconscious || entry.state.torpor < max * (config.knockoutAt ?? 1)) return false;
    entry.state.unconscious = true;
    entry.state.nextMeal = 0;
    return true;
  };
  return {
    track(id, kind, level) {
      if (tracked.has(id)) return;
      if (species[kind] === undefined) throw new Error(`knockoutTaming: no taming config for species "${kind}"`);
      tracked.set(id, { species: kind, state: freshState(level) });
    },
    forget: (id) => void tracked.delete(id),
    state: (id) => tracked.get(id)?.state ?? null,
    maxTorpor(id) {
      const found = configOf(id);
      return found === null ? 0 : maxTorpor(found.config, found.entry.state.level);
    },
    addTorpor(id, amount) {
      const found = configOf(id);
      if (found === null) return false;
      found.entry.state.torpor += amount;
      return knock(found.entry, found.config);
    },
    damage(id, fraction) {
      const found = configOf(id);
      if (found === null || !found.entry.state.unconscious) return;
      found.entry.state.spent += Math.max(0, fraction) * (found.config.damageIneffectiveness ?? 2);
    },
    dose(id, narcotic) {
      const found = configOf(id);
      if (found === null) return;
      found.entry.state.dosing.push({ torpor: narcotic.torpor, seconds: Math.max(0.001, narcotic.seconds) });
    },
    tick(dt, feederOf, speed = 1) {
      const events: { id: string; event: TamingEvent }[] = [];
      for (const [id, entry] of tracked) {
        const config = species[entry.species]!;
        const state = entry.state;
        // Narcotics hold torpor up while they release; otherwise it drains at the level's rate.
        let dosed = 0;
        for (const dose of state.dosing) {
          const step = Math.min(dt, dose.seconds);
          dosed += (dose.torpor / dose.seconds) * step;
          dose.torpor -= (dose.torpor / dose.seconds) * step;
          dose.seconds -= step;
        }
        state.dosing = state.dosing.filter((dose) => dose.seconds > 1e-6);
        const drain = state.dosing.length > 0 ? 0 : tamingScale(config.torporDrain.at1, config.torporDrain.at30, state.level) * dt;
        state.torpor = Math.max(0, state.torpor + dosed - drain);
        if (!state.unconscious) {
          if (knock(entry, config)) events.push({ id, event: { type: "knockedOut" } });
          continue;
        }
        if (state.torpor <= 0) {
          entry.state = { ...freshState(state.level) };
          events.push({ id, event: { type: "woke" } });
          continue;
        }
        state.nextMeal -= dt * Math.max(0, speed);
        if (state.nextMeal > 0) continue;
        const feeder = feederOf(id);
        const meal = feeder === null ? undefined : Object.keys(config.foods).find((itemId) => feeder.count(itemId) > 0);
        if (feeder === null || meal === undefined) {
          state.progress = Math.max(0, state.progress - (config.starveLoss ?? 0.001) * dt);
          state.nextMeal = 0;
          continue;
        }
        const food = config.foods[meal]!;
        feeder.take(meal);
        state.progress += 1 / Math.max(1, tamingScale(food.countAt1, food.countAt30, state.level));
        state.spent += food.ineffectiveness ?? 0.03;
        state.nextMeal = mealInterval(food, state.level);
        events.push({ id, event: { type: "ate", itemId: meal } });
        if (state.progress >= 1 - 1e-9) {
          const effectiveness = tamingEffectiveness(state);
          events.push({ id, event: { type: "tamed", effectiveness, bonusLevels: bonusLevels(state.level, effectiveness) } });
          tracked.delete(id);
        }
      }
      return events;
    },
    snapshot: () => Object.fromEntries([...tracked].map(([id, entry]) => [id, { ...entry.state, dosing: entry.state.dosing.map((dose) => ({ ...dose })), species: entry.species }])),
    restore(data) {
      tracked.clear();
      for (const [id, { species: kind, ...state }] of Object.entries(data)) tracked.set(id, { species: kind, state: { ...state, dosing: state.dosing.map((dose) => ({ ...dose })) } });
    },
    reset: () => tracked.clear(),
  };
}
