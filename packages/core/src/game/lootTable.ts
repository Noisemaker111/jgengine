/** One possible drop in a {@link LootTableDef} — an item, currency, or generated item, its count range, and its odds. */
export interface LootEntry {
  item?: string;
  currency?: string;
  /**
   * Roll a procedurally generated item instead of a static catalog id (a rolled unique gun, an
   * affixed relic) — invoked with the roll's rng and returning the generated item's runtime id, the
   * one `content.itemById` and inventories treat exactly like a static id (#536.1). Compose it with
   * `item/itemInstanceRegistry`'s `proceduralLootEntry` over any procedural roller (e.g. `item/affix`'s
   * `createAffixRoller`).
   */
  generate?: (rng: () => number) => string;
  count: number | [number, number];
  /** Relative pick weight — required in `"weighted"` mode, forbidden in `"independent"` mode. */
  weight?: number;
  /** Per-entry drop probability in `(0, 1]` — required in `"independent"` mode, forbidden in `"weighted"` mode. */
  chance?: number;
}

/** A named, validated loot table — its roll count, weighted-vs-independent mode, and candidate entries. */
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

/** A resolved loot outcome — one item or currency grant with its rolled count. */
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
  const kinds = [entry.item !== undefined, entry.currency !== undefined, entry.generate !== undefined].filter(
    Boolean,
  ).length;
  if (kinds !== 1) {
    throw new Error("loot entry must have exactly one of item, currency, or generate");
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
  if (entry.generate !== undefined) return { item: entry.generate(rng), count };
  return entry.item !== undefined ? { item: entry.item, count } : { currency: entry.currency, count };
}

/** Options for {@link createLootRegistry} — inject a default RNG so bare `roll(id)` uses the world stream. */
export interface LootRegistryOptions {
  /**
   * Default `[0,1)` stream when `roll` is called without an explicit rng.
   * Prefer the world stream from `createGameContext` (`ctx.rng`); bare registries
   * still default to `Math.random` for portable call sites outside a game context.
   */
  rng?: () => number;
}

/**
 * Register named loot tables and roll weighted randomized drops from them.
 *
 * @capability loot-table register loot tables and roll weighted randomized drops
 */
export function createLootRegistry(options: LootRegistryOptions = {}): LootRegistry {
  const tables = new Map<string, LootTableDef>();
  const defaultRng = options.rng ?? Math.random;

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
    roll(id, rng = defaultRng) {
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

/**
 * Validates a loot table definition and returns it unchanged, for use with {@link createLootRegistry}.
 *
 * @capability loot-table validate a loot table definition for use with the registry
 */
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
