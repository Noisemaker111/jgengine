export interface TimelineSlotConfig {
  id: string;
  cooldownMs: number;
  enabled?: boolean;
  offsetMs?: number;
}

export interface TimelineSlot {
  readonly id: string;
  readonly cooldownMs: number;
  readonly remainingMs: number;
  readonly enabled: boolean;
}

export interface TimelineBoardState {
  readonly slots: readonly TimelineSlot[];
  readonly elapsedMs: number;
}

export interface TimelineFire {
  slotId: string;
  slotIndex: number;
  atMs: number;
}

export interface TimelineTickResult {
  state: TimelineBoardState;
  fires: readonly TimelineFire[];
}

export function createTimelineBoardState(
  slots: readonly TimelineSlotConfig[],
): TimelineBoardState {
  const seen = new Set<string>();
  const built: TimelineSlot[] = [];
  for (const slot of slots) {
    if (slot.cooldownMs <= 0) throw new Error(`timeline slot "${slot.id}" needs a positive cooldown`);
    if (seen.has(slot.id)) throw new Error(`duplicate timeline slot id: ${slot.id}`);
    seen.add(slot.id);
    built.push({
      id: slot.id,
      cooldownMs: slot.cooldownMs,
      remainingMs: slot.offsetMs ?? slot.cooldownMs,
      enabled: slot.enabled ?? true,
    });
  }
  return { slots: built, elapsedMs: 0 };
}

export function tickTimeline(
  state: TimelineBoardState,
  dtMs: number,
): TimelineTickResult {
  if (dtMs <= 0) return { state, fires: [] };
  const fires: TimelineFire[] = [];
  const nextSlots: TimelineSlot[] = state.slots.map((slot, slotIndex) => {
    if (!slot.enabled) return slot;
    let remaining = slot.remainingMs;
    let t = remaining;
    while (t <= dtMs) {
      fires.push({ slotId: slot.id, slotIndex, atMs: state.elapsedMs + t });
      t += slot.cooldownMs;
    }
    remaining = t - dtMs;
    return { ...slot, remainingMs: remaining };
  });
  fires.sort((a, b) => (a.atMs === b.atMs ? a.slotIndex - b.slotIndex : a.atMs - b.atMs));
  return {
    state: { slots: nextSlots, elapsedMs: state.elapsedMs + dtMs },
    fires,
  };
}

export function setSlotEnabled(
  state: TimelineBoardState,
  slotId: string,
  enabled: boolean,
): TimelineBoardState {
  return {
    ...state,
    slots: state.slots.map((slot) => (slot.id === slotId ? { ...slot, enabled } : slot)),
  };
}

export function resetSlot(
  state: TimelineBoardState,
  slotId: string,
  remainingMs?: number,
): TimelineBoardState {
  return {
    ...state,
    slots: state.slots.map((slot) =>
      slot.id === slotId ? { ...slot, remainingMs: remainingMs ?? slot.cooldownMs } : slot,
    ),
  };
}

export interface TimelineBoard {
  state(): TimelineBoardState;
  tick(dtMs: number): readonly TimelineFire[];
  setEnabled(slotId: string, enabled: boolean): void;
  reset(slotId?: string, remainingMs?: number): void;
}

export function createTimelineBoard(slots: readonly TimelineSlotConfig[]): TimelineBoard {
  const initial = slots;
  let state = createTimelineBoardState(slots);
  return {
    state: () => state,
    tick(dtMs) {
      const result = tickTimeline(state, dtMs);
      state = result.state;
      return result.fires;
    },
    setEnabled(slotId, enabled) {
      state = setSlotEnabled(state, slotId, enabled);
    },
    reset(slotId, remainingMs) {
      state = slotId === undefined ? createTimelineBoardState(initial) : resetSlot(state, slotId, remainingMs);
    },
  };
}
