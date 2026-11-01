/** Named slots that each hold one thing and refill a while after it is gone. */
export interface RefillSlotsConfig {
  slots: readonly string[];
  /** Seconds from emptied to ready again: uniform between the two, drawn from the injected rng. */
  refillSeconds: readonly [number, number];
}

/** One slot's state: whether it holds its thing and, while empty, when it is ready. */
export interface RefillSlotState {
  filled: boolean;
  readyAt: number;
}

/** Plain JSON state: per slot whether it is filled and, if empty, when it is ready. */
export interface RefillSlotsState {
  slots: Record<string, RefillSlotState>;
}

/** Slots that each hold one thing, emptied when it is gone and ready again after a random wait. */
export interface RefillSlots {
  /** Empty slots whose ready time is at or before `now`, in config order. Does not fill them. */
  ready(now: number): string[];
  /** Mark a slot as holding its thing. */
  fill(slot: string): void;
  /** The slot's thing is gone: it is ready again after a refill wait from `now`, or after `seconds` exactly when given (no rng draw). */
  empty(slot: string, now: number, seconds?: number): void;
  /** Seconds from `now` until an empty slot is ready; 0 when it is ready or filled. */
  remaining(slot: string, now: number): number;
  /** Push an empty slot's ready time later by `seconds`, e.g. while something holds the spot. */
  postpone(slot: string, seconds: number): void;
  /** Add a new empty slot, ready at time 0. A name already present is left as it is. */
  add(slot: string): void;
  /** Drop a slot and its state. */
  remove(slot: string): void;
  isFilled(slot: string): boolean;
  /** Set when an empty slot is ready, e.g. to spread a world's first fills. */
  readyAt(slot: string, at: number): void;
  /** Change the refill wait for later empties; a slot already waiting keeps its time. */
  retune(config: Partial<Pick<RefillSlotsConfig, "refillSeconds">>): void;
  snapshot(): RefillSlotsState;
  restore(state: RefillSlotsState): void;
  /** Every slot empty and ready at time 0. */
  reset(): void;
}

/** A wait range with its ends in order and neither below zero. */
function waitRange(seconds: readonly [number, number]): readonly [number, number] {
  return [Math.max(0, Math.min(seconds[0], seconds[1])), Math.max(0, Math.max(seconds[0], seconds[1]))];
}

/**
 * Slots that each hold one thing: a crate per drop site, a node per node spot, a herd per den. Ask
 * `ready(now)` for those whose thing is gone and whose wait is over, `fill` one that holds again, and
 * `empty(slot, now)` when its thing is taken or expires; the wait is a uniform draw from the injected rng.
 *
 * @capability refill-slots named slots that each hold one thing and refill a random while after it is gone
 */
export function createRefillSlots(config: RefillSlotsConfig, rng: () => number): RefillSlots {
  const order = [...config.slots];
  let range = waitRange(config.refillSeconds);
  const fresh = (): Map<string, RefillSlotState> => new Map(order.map((slot): [string, RefillSlotState] => [slot, { filled: false, readyAt: 0 }]));
  let slots = fresh();
  const named = (slot: string): RefillSlotState => {
    const state = slots.get(slot);
    if (state === undefined) throw new Error(`refill slots: no slot named "${slot}"`);
    return state;
  };
  return {
    ready(now) {
      return order.filter((slot) => {
        const state = slots.get(slot);
        return state !== undefined && !state.filled && state.readyAt <= now;
      });
    },
    fill(slot) {
      named(slot).filled = true;
    },
    empty(slot, now, seconds) {
      const state = named(slot);
      state.filled = false;
      state.readyAt = now + (seconds !== undefined ? Math.max(0, seconds) : range[0] + rng() * (range[1] - range[0]));
    },
    remaining(slot, now) {
      const state = named(slot);
      return state.filled ? 0 : Math.max(0, state.readyAt - now);
    },
    postpone(slot, seconds) {
      const state = named(slot);
      if (!state.filled) state.readyAt += Math.max(0, seconds);
    },
    add(slot) {
      if (slots.has(slot)) return;
      order.push(slot);
      slots.set(slot, { filled: false, readyAt: 0 });
    },
    remove(slot) {
      if (!slots.delete(slot)) return;
      order.splice(order.indexOf(slot), 1);
    },
    isFilled: (slot) => slots.get(slot)?.filled ?? false,
    readyAt(slot, at) {
      named(slot).readyAt = at;
    },
    retune(patch) {
      if (patch.refillSeconds !== undefined) range = waitRange(patch.refillSeconds);
    },
    snapshot: () => ({ slots: Object.fromEntries([...slots].map(([slot, state]) => [slot, { ...state }])) }),
    restore(state) {
      slots = new Map(
        order.map((slot): [string, RefillSlotState] => {
          const saved = state.slots[slot];
          return [slot, { filled: saved?.filled ?? false, readyAt: saved?.readyAt ?? 0 }];
        }),
      );
    },
    reset() {
      slots = fresh();
    },
  };
}
