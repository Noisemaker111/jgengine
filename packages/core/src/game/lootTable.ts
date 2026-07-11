export interface LootEntry {
  item?: string;
  currency?: string;
  count: number | [number, number];
  /** Relative pick weight — required in `"weighted"` mode, forbidden in `"independent"` mode. */
  weight?: number;
  /** Per-entry drop probability in `(0, 1]` — required in `"independent"` mode, forbidden in `"weighted"` mode. */
  chance?: number;
}

export interface LootTableDef {
  id: string;
  rolls?: number;
  /**
   * `"weighted"` (default): each roll picks exactly one entry by relative `weight`.
   * `"independent"`: each roll gives every entry its own `chance` — classic drop lists
   * where a kill can yield several items (or nothing) without filler entries.
   */
  mode?: "weighted" | "independent";
  entries: LootEntry[];
}

export interface Drop {
  item?: string;
  currency?: string;
  count: number;
}

export interface LootRegistry {
  register(def: LootTableDef): void;
  has(id: string): boolean;
  roll(id: string, rng?: () => number): Drop[];
}

function assertValidEntry(entry: LootEntry, mode: "weighted" | "independent"): void {
  const hasItem = entry.item !== undefined;
  const hasCurrency = entry.currency !== undefined;
  if (hasItem === hasCurrency) {
    throw new Error("loot entry must have exactly one of item or currency");
  }
  if (mode === "weighted") {
    if (entry.chance !== undefined) {
      throw new Error("loot entry chance is only valid in independent mode");
    }
    if (entry.weight === undefined || !(entry.weight > 0)) {
      throw new Error(`loot entry weight must be positive, got ${entry.weight}`);
    }
    return;
  }
  if (entry.weight !== undefined) {
    throw new Error("loot entry weight is only valid in weighted mode");
  }
  if (entry.chance === undefined || !(entry.chance > 0) || entry.chance > 1) {
    throw new Error(`loot entry chance must be in (0, 1], got ${entry.chance}`);
  }
}

function assertValidDef(def: LootTableDef): void {
  if (def.entries.length === 0) {
    throw new Error(`loot table "${def.id}" must have at least one entry`);
  }
  for (const entry of def.entries) assertValidEntry(entry, def.mode ?? "weighted");
}

function resolveCount(count: number | [number, number], rng: () => number): number {
  if (typeof count === "number") return count;
  const [min, max] = count;
  return min + Math.floor(rng() * (max - min + 1));
}

function pickEntry(entries: LootEntry[], rng: () => number): LootEntry {
  const total = entries.reduce((sum, entry) => sum + (entry.weight ?? 0), 0);
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= entry.weight ?? 0;
    if (roll < 0) return entry;
  }
  return entries[entries.length - 1];
}

function rollEntry(entry: LootEntry, rng: () => number): Drop {
  const count = resolveCount(entry.count, rng);
  return entry.item !== undefined ? { item: entry.item, count } : { currency: entry.currency, count };
}

export function createLootRegistry(): LootRegistry {
  const tables = new Map<string, LootTableDef>();

  return {
    register(def) {
      assertValidDef(def);
      if (tables.has(def.id)) {
        throw new Error(`loot table "${def.id}" is already registered`);
      }
      tables.set(def.id, def);
    },
    has(id) {
      return tables.has(id);
    },
    roll(id, rng = Math.random) {
      const table = tables.get(id);
      if (!table) {
        throw new Error(`unknown loot table: ${id}`);
      }
      const rolls = table.rolls ?? 1;
      const drops: Drop[] = [];
      for (let i = 0; i < rolls; i++) {
        if (table.mode === "independent") {
          for (const entry of table.entries) {
            if (rng() < (entry.chance ?? 0)) drops.push(rollEntry(entry, rng));
          }
        } else {
          drops.push(rollEntry(pickEntry(table.entries, rng), rng));
        }
      }
      return drops;
    },
  };
}

export function lootTable(def: LootTableDef): LootTableDef {
  assertValidDef(def);
  return def;
}

export function grantDrops(
  drops: Drop[],
  appliers: {
    putItem: (itemId: string, count: number) => unknown;
    grantCurrency: (currencyId: string, amount: number) => unknown;
  },
): void {
  for (const drop of drops) {
    if (drop.item !== undefined) {
      appliers.putItem(drop.item, drop.count);
    } else if (drop.currency !== undefined) {
      appliers.grantCurrency(drop.currency, drop.count);
    }
  }
}
