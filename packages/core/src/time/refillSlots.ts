export interface RefillSlotsConfig {
  slots: readonly string[];
  /** Seconds from emptied to ready again: uniform between the two, drawn from the injected rng. */
  refillSeconds: readonly [number, number];
}

export interface RefillSlotState {
  filled: boolean;
  readyAt: number;
}

export interface RefillSlotsState {
  slots: Record<string, RefillSlotState>;
}

export interface RefillSlots {
  ready(now: number): string[];
  fill(slot: string): void;
  /** The slot's thing is gone: it is ready again after a refill wait from `now`, or after `seconds` exactly when given (no rng draw). */
  empty(slot: string, now: number, seconds?: number): void;
  /** Seconds from `now` until an empty slot is ready; 0 when it is ready or filled. */
  remaining(slot: string, now: number): number;
  /** Push an empty slot's ready time later by `seconds`, e.g. while something holds the spot. */
  postpone(slot: string, seconds: number): void;
  add(slot: string): void;
  remove(slot: string): void;
  isFilled(slot: string): boolean;
  readyAt(slot: string, at: number): void;
  retune(config: Partial<Pick<RefillSlotsConfig, "refillSeconds">>): void;
  snapshot(): RefillSlotsState;
  restore(state: RefillSlotsState): void;
  reset(): void;
}

function waitRange(seconds: readonly [number, number]): readonly [number, number] {
  return [Math.max(0, Math.min(seconds[0], seconds[1])), Math.max(0, Math.max(seconds[0], seconds[1]))];
}

/** @capability refill-slots named slots that each hold one thing and refill a random while after it is gone */
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
