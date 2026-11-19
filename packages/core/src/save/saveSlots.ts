/**
 * One entry in a {@link SaveSlots} index: a save/profile slot's *display*
 * metadata, not its payload. The real save data lives in a `createSaveStore`
 * slot; this record is only what a save-select menu renders — an id, an optional
 * player-facing `name`, whether the slot is `empty`, when it was last written
 * (`savedAt`), and a free-string `meta` bag the game fills with whatever the
 * menu should show (level, playtime, location, chapter, a thumbnail ref, …).
 * `meta` keys are opaque to this model — it never reads or branches on them.
 */
export interface SaveSlotMeta {
  id: string;
  name?: string | undefined;
  empty: boolean;
  /** Clock time (ms) of the last {@link SaveSlots.write}, or `undefined` while empty. */
  savedAt?: number | undefined;
  /**
   * Free-string display fields the game owns and the menu renders as chips —
   * e.g. `{ chapter: "The Drowned Keep", playtime: "4h 12m", level: 8 }`. The
   * model never interprets these keys; they are pure passthrough to the renderer.
   */
  meta: Record<string, string | number>;
}

export function slotText(slot: SaveSlotMeta, key: string): string | null {
  const value = slot.meta[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function slotNumber(slot: SaveSlotMeta, key: string): number | null {
  const value = slot.meta[key];
  return typeof value === "number" ? value : null;
}

export interface SaveSlotWrite {
  /** Player-facing label for the slot. Omit to keep the existing name. */
  name?: string | undefined;
  /** Replacement free-string display fields. Omit to keep the existing `meta`. */
  meta?: Record<string, string | number>;
  /** The save's own write time (ms) when the payload knows it; omit to use the index's clock. */
  savedAt?: number | undefined;
}

export interface SaveSlotsConfig {
  /** Injected clock (ms) used to stamp `savedAt`. Default `Date.now`. */
  now?: () => number;
  slots?: SaveSlotMeta[];
  /**
   * Fixed number of slots the menu shows. When set, the index is padded with
   * empty slots up to this count and never grows past it. Omit for an
   * open-ended list that only holds the slots you seed.
   */
  capacity?: number;
}

export interface SaveSlotsSnapshot {
  slots: SaveSlotMeta[];
  capacity: number | undefined;
}

export interface SaveSlots {
  write(id: string, write?: SaveSlotWrite): SaveSlotMeta;
  clear(id: string): SaveSlotMeta | null;
  rename(id: string, name: string): SaveSlotMeta | null;
  get(id: string): SaveSlotMeta | null;
  list(): SaveSlotMeta[];
  mostRecent(): SaveSlotMeta | null;
  subscribe(listener: () => void): () => void;
  snapshot(): SaveSlotsSnapshot;
  restore(snapshot: SaveSlotsSnapshot): void;
}

function emptySlot(id: string): SaveSlotMeta {
  return { id, empty: true, meta: {} };
}

function cloneSlot(slot: SaveSlotMeta): SaveSlotMeta {
  return {
    id: slot.id,
    name: slot.name,
    empty: slot.empty,
    savedAt: slot.savedAt,
    meta: { ...slot.meta },
  };
}

function normalizeSlot(slot: SaveSlotMeta): SaveSlotMeta {
  const empty = slot.empty ?? true;
  return {
    id: slot.id,
    name: slot.name,
    empty,
    savedAt: empty ? undefined : slot.savedAt,
    meta: empty ? {} : { ...(slot.meta ?? {}) },
  };
}

/**
 * Create a {@link SaveSlots} index — the serializable, observable list of
 * save/profile slot metadata a save-select menu renders. It is a thin companion
 * to `createSaveStore`: the store owns the real save payload keyed by slot, this
 * owns only the display fields (name, empty, last-saved, and a free-string
 * `meta` bag) the menu shows. `write` stamps a slot saved on the injected clock,
 * `clear` empties one, `rename` relabels one, `mostRecent()` returns the newest
 * non-empty slot to power a "Continue" button, and `list()` feeds the New /
 * Continue / Load / Delete grid. `meta` keys are free strings the game owns —
 * the model never interprets them — and `snapshot`/`restore` round-trips the
 * whole index through a save.
 *
 * @capability save-slots serializable save-slot / profile metadata index — write/clear/rename/mostRecent over free-string per-slot meta, powering New/Continue/Load/Delete menus, with snapshot/restore
 */
export function createSaveSlots(config: SaveSlotsConfig = {}): SaveSlots {
  const now = config.now ?? Date.now;
  let capacity = config.capacity;

  const slots: SaveSlotMeta[] = (config.slots ?? []).map(normalizeSlot);
  const seen = new Set(slots.map((slot) => slot.id));
  if (capacity !== undefined) {
    let n = 1;
    while (slots.length < capacity) {
      let id = `slot-${n}`;
      while (seen.has(id)) {
        n += 1;
        id = `slot-${n}`;
      }
      seen.add(id);
      slots.push(emptySlot(id));
      n += 1;
    }
  }

  const listeners = new Set<() => void>();
  function notify(): void {
    for (const listener of listeners) listener();
  }

  function indexOf(id: string): number {
    return slots.findIndex((slot) => slot.id === id);
  }

  return {
    write(id, write) {
      let i = indexOf(id);
      if (i === -1) {
        if (capacity !== undefined && slots.length >= capacity) {
          throw new Error(`save-slots: cannot create slot "${id}" — capacity ${capacity} reached`);
        }
        slots.push(emptySlot(id));
        i = slots.length - 1;
      }
      const slot = slots[i]!;
      slot.empty = false;
      slot.savedAt = write?.savedAt ?? now();
      if (write?.name !== undefined) slot.name = write.name;
      if (write?.meta !== undefined) slot.meta = { ...write.meta };
      notify();
      return cloneSlot(slot);
    },
    clear(id) {
      const i = indexOf(id);
      if (i === -1) return null;
      const slot = slots[i]!;
      slot.empty = true;
      slot.name = undefined;
      slot.savedAt = undefined;
      slot.meta = {};
      notify();
      return cloneSlot(slot);
    },
    rename(id, name) {
      const i = indexOf(id);
      if (i === -1) return null;
      const slot = slots[i]!;
      slot.name = name;
      notify();
      return cloneSlot(slot);
    },
    get(id) {
      const i = indexOf(id);
      return i === -1 ? null : cloneSlot(slots[i]!);
    },
    list() {
      return slots.map(cloneSlot);
    },
    mostRecent() {
      let best: SaveSlotMeta | null = null;
      for (const slot of slots) {
        if (slot.empty) continue;
        if (best === null || (slot.savedAt ?? 0) > (best.savedAt ?? 0)) best = slot;
      }
      return best === null ? null : cloneSlot(best);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return { slots: slots.map(cloneSlot), capacity };
    },
    restore(snapshot) {
      capacity = snapshot.capacity;
      slots.length = 0;
      for (const slot of snapshot.slots) slots.push(normalizeSlot(slot));
      notify();
    },
  };
}
