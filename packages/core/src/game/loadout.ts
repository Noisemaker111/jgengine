export interface LoadoutItemEntry {
  item: string;
  count: number;
  slot?: number;
}

export interface LoadoutDef {
  inventories?: Record<string, LoadoutItemEntry[]>;
  stats?: Record<string, { current: number; max?: number; min?: number }>;
  economy?: Record<string, number>;
  unlocks?: string[];
}

export interface LoadoutInventoryTransaction {
  put(inventoryId: string, itemId: string, count: number, slot?: number): { reason: string } | null;
  commit(): void;
}

export interface LoadoutDeps {
  inventory: { begin(userId: string): LoadoutInventoryTransaction };
  stats: { seed(userId: string, statId: string, pool: { current: number; max?: number; min?: number }): void };
  economy: { grant(userId: string, currencyId: string, amount: number): void };
  unlocks: { grant(userId: string, unlockId: string): void };
}

export interface Loadouts {
  register(defs: Record<string, LoadoutDef>): void;
  has(loadoutId: string): boolean;
  applyLoadout(userId: string, loadoutId: string): { reason: string } | null;
}

export function createLoadouts(deps: LoadoutDeps): Loadouts {
  const definitions = new Map<string, LoadoutDef>();

  return {
    register(defs) {
      for (const [loadoutId, def] of Object.entries(defs)) definitions.set(loadoutId, def);
    },
    has(loadoutId) {
      return definitions.has(loadoutId);
    },
    applyLoadout(userId, loadoutId) {
      const def = definitions.get(loadoutId);
      if (def === undefined) return { reason: `unknown loadout "${loadoutId}"` };

      const transaction = deps.inventory.begin(userId);
      for (const [inventoryId, entries] of Object.entries(def.inventories ?? {})) {
        for (const entry of entries) {
          const rejection = transaction.put(inventoryId, entry.item, entry.count, entry.slot);
          if (rejection !== null) return { reason: `${inventoryId}: ${rejection.reason}` };
        }
      }
      transaction.commit();

      for (const [statId, pool] of Object.entries(def.stats ?? {})) {
        deps.stats.seed(userId, statId, pool);
      }
      for (const [currencyId, amount] of Object.entries(def.economy ?? {})) {
        deps.economy.grant(userId, currencyId, amount);
      }
      for (const unlockId of def.unlocks ?? []) {
        deps.unlocks.grant(userId, unlockId);
      }
      return null;
    },
  };
}
