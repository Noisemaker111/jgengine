/**
 * A runtime store for procedurally generated item instances — a rolled unique gun, a rolled
 * affixed relic — keyed by a generated id distinct from any static catalog id. The counterpart a
 * game's `content.itemById` consults for ids `lootTable`'s `generate` entries hand back, so runtime
 * rolls never need a hand-rolled parallel registry (#536.1).
 */
export interface ItemInstanceRegistry<TDef> {
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
export function createItemInstanceRegistry<TDef>(prefix = "item"): ItemInstanceRegistry<TDef> {
  let seq = 0;
  const store = new Map<string, TDef>();

  return {
    register(baseId, def) {
      seq += 1;
      const id = `${prefix}:${baseId}:${seq}`;
      store.set(id, def);
      return id;
    },
    get: (id) => store.get(id),
    has: (id) => store.has(id),
    release: (id) => void store.delete(id),
    count: () => store.size,
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
