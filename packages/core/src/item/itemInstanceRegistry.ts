/** Save data for a registry; definitions must be structured-cloneable and use the caller's serialization format. */
export interface ItemInstanceRegistryState<TDef> {
  prefix: string;
  sequence: number;
  entries: [string, TDef][];
}

/** Caller-owned synchronous storage; `entries()` must stream without materializing the collection. */
export interface ItemInstanceStorage<TDef> {
  get(id: string): TDef | undefined;
  has(id: string): boolean;
  set(id: string, def: TDef): void;
  delete(id: string): void;
  count(): number;
  entries(): Iterable<[string, TDef]>;
  /** Consume entries completely and atomically replace storage; any failure must preserve previous data. */
  replace(entries: Iterable<[string, TDef]>): void;
}

/** Inject storage and its saved allocator sequence when attaching an existing collection. */
export interface ItemInstanceRegistryOptions<TDef> {
  storage?: ItemInstanceStorage<TDef>;
  /** Nonnegative safe integer; defaults to zero. Retain it across releases and storage reattachment. */
  sequence?: number;
}

/**
 * A runtime store for procedurally generated item instances — a rolled unique gun, a rolled
 * affixed relic — keyed by a generated id distinct from any static catalog id. The counterpart a
 * game's `content.itemById` consults for ids `lootTable`'s `generate` entries hand back, so runtime
 * rolls never need a hand-rolled parallel registry (#536.1).
 */
export interface ItemInstanceRegistry<TDef> {
  /** Detached definitions and allocator state, including ids of released instances in the sequence. */
  state(): ItemInstanceRegistryState<TDef>;
  /** Detached batches of at most `pageSize` entries; throws if the registry changes during iteration. Keep external storage and definitions unchanged until finished. */
  statePages(pageSize: number): IterableIterator<ItemInstanceRegistryState<TDef>>;
  /** Replace the registry; returns false without mutation when the prefix or allocator is invalid. */
  restore(next: ItemInstanceRegistryState<TDef>): boolean;
  /** Stream detached pages through atomic storage replacement. All pages must share prefix and sequence; malformed pages or storage failures throw without changing state. Empty saves require one empty page. */
  restorePages(pages: Iterable<ItemInstanceRegistryState<TDef>>): boolean;
  /** Stores `def` under a fresh generated id derived from `baseId`; returns that id. */
  register(baseId: string, def: TDef): string;
  get(id: string): TDef | undefined;
  has(id: string): boolean;
  /** Drop a generated instance once nothing references it (consumed, destroyed, sold). */
  release(id: string): void;
  count(): number;
}

/**
 * Builds an {@link ItemInstanceRegistry}; generated ids are `"<prefix>:<baseId>:<n>"`, unique per
 * registry instance.
 *
 * @capability item-instance-registry a runtime store for procedurally generated item instances
 */
export function createItemInstanceRegistry<TDef>(
  prefix = "item",
  options: ItemInstanceRegistryOptions<TDef> = {},
): ItemInstanceRegistry<TDef> {
  let seq = options.sequence ?? 0;
  if (!Number.isSafeInteger(seq) || seq < 0) throw new RangeError("Invalid item allocation sequence");
  let revision = 0;
  let memory = new Map<string, TDef>();
  const store: ItemInstanceStorage<TDef> = options.storage ?? {
    get: (id) => memory.get(id),
    has: (id) => memory.has(id),
    set: (id, def) => void memory.set(id, def),
    delete: (id) => void memory.delete(id),
    count: () => memory.size,
    entries: () => memory.entries(),
    replace: (entries) => { memory = new Map(entries); },
  };

  const validHeader = (next: ItemInstanceRegistryState<TDef>): boolean =>
    next.prefix === prefix && Number.isSafeInteger(next.sequence) && next.sequence >= 0;

  return {
    state: () => ({ prefix, sequence: seq, entries: structuredClone(Array.from(store.entries())) }),
    statePages(pageSize) {
      if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new RangeError("Invalid item page size");
      const sequence = seq;
      const expectedRevision = revision;
      return (function* () {
        const entries = store.entries()[Symbol.iterator]();
        let done = false;
        let first = true;
        try {
          while (!done) {
            if (revision !== expectedRevision) throw new Error("Item registry changed during export");
            const batch: [string, TDef][] = [];
            while (batch.length < pageSize) {
              const next = entries.next();
              if (next.done) { done = true; break; }
              batch.push(next.value);
            }
            const detached = structuredClone(batch);
            if (revision !== expectedRevision) throw new Error("Item registry changed during export");
            if (first || detached.length > 0) yield { prefix, sequence, entries: detached };
            first = false;
          }
        } finally {
          entries.return?.();
        }
      })();
    },
    restore(next) {
      if (!validHeader(next)) return false;
      const entries = structuredClone(next.entries);
      store.replace(entries);
      seq = next.sequence;
      revision += 1;
      return true;
    },
    restorePages(pages) {
      const iterator = pages[Symbol.iterator]();
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        iterator.return?.();
      };
      try {
        const first = iterator.next();
        if (first.done || !validHeader(first.value)) return false;
        const sequence = first.value.sequence;
        store.replace((function* () {
          let page: IteratorResult<ItemInstanceRegistryState<TDef>> = first;
          try {
            while (!page.done) {
              if (!validHeader(page.value) || page.value.sequence !== sequence) {
                throw new Error("Inconsistent item registry pages");
              }
              yield* structuredClone(page.value.entries);
              page = iterator.next();
            }
          } finally {
            close();
          }
        })());
        seq = sequence;
        revision += 1;
        return true;
      } finally {
        close();
      }
    },
    register(baseId, def) {
      let id: string;
      do {
        if (seq === Number.MAX_SAFE_INTEGER) throw new RangeError("Item allocation sequence exhausted");
        seq += 1;
        revision += 1;
        id = `${prefix}:${baseId}:${seq}`;
      } while (store.has(id));
      store.set(id, def);
      return id;
    },
    get: (id) => store.get(id),
    has: (id) => store.has(id),
    release(id) {
      store.delete(id);
      revision += 1;
    },
    count: () => store.count(),
  };
}

/**
 * Bridges any procedural roller into a `LootEntry.generate` callback: rolls a `{ baseId, def }` pair
 * and registers it, returning the runtime id the loot roll hands back as the drop's `item`.
 *
 * @capability item-instance-registry roll and register a procedural item as a loot-table drop
 */
export function proceduralLootEntry<TDef>(
  registry: ItemInstanceRegistry<TDef>,
  roll: (rng: () => number) => { baseId: string; def: TDef },
): (rng: () => number) => string {
  return (rng) => {
    const rolled = roll(rng);
    return registry.register(rolled.baseId, rolled.def);
  };
}
