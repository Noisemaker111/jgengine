/** Where an item instance stands: still usable, broken down, or sold. */
export type ItemLifecycle = "owned" | "salvaged" | "sold";

/** Items that have left play, keyed by instance id; anything absent is still `owned`. */
export type ItemLedgerState = Readonly<Record<string, Exclude<ItemLifecycle, "owned">>>;

/**
 * One record of what happened to rolled item instances. Every path that removes an item - salvage,
 * sale, granting a duplicate - claims it here first, so a second claim returns false and the item
 * cannot be equipped, sold or broken down twice.
 */
export interface ItemLedger {
  status(id: string): ItemLifecycle;
  /** True only while the instance is `owned`; a salvaged or sold item is no longer usable. */
  canUse(id: string): boolean;
  /** Claim `id` for `salvaged` or `sold`; false when it already left play. */
  spend(id: string, how: Exclude<ItemLifecycle, "owned">): boolean;
  snapshot(): ItemLedgerState;
  /** Replace the ledger; false without mutation when an entry names an unknown outcome. */
  restore(next: ItemLedgerState): boolean;
  reset(): void;
}

/**
 * Build an item ledger. Ids are consumed once: the first successful {@link ItemLedger.spend} wins,
 * every later call fails, which is what makes salvage and sale mutually exclusive.
 *
 * @capability item-ledger track which rolled item instances are still owned, salvaged or sold
 */
export function createItemLedger(initial: ItemLedgerState = {}): ItemLedger {
  const spent = new Map<string, Exclude<ItemLifecycle, "owned">>();
  for (const [id, how] of Object.entries(initial)) {
    if (how === "salvaged" || how === "sold") spent.set(id, how);
  }

  return {
    status: (id) => spent.get(id) ?? "owned",
    canUse: (id) => !spent.has(id),
    spend(id, how) {
      if (spent.has(id)) return false;
      spent.set(id, how);
      return true;
    },
    snapshot: () => Object.fromEntries(spent),
    restore(next) {
      if (next === null || typeof next !== "object") return false;
      const staged = new Map<string, Exclude<ItemLifecycle, "owned">>();
      for (const [id, how] of Object.entries(next)) {
        if (how !== "salvaged" && how !== "sold") return false;
        if (id.trim() === "") return false;
        staged.set(id, how);
      }
      spent.clear();
      for (const [id, how] of staged) spent.set(id, how);
      return true;
    },
    reset: () => spent.clear(),
  };
}

/** The currency and amount one salvage yields. `currency` is the game's key, never interpreted. */
export interface SalvageYield {
  currency: string;
  amount: number;
}

/** What a broken-down item is worth: a game-authored currency, rate and per-rarity multiplier. */
export interface SalvageTable {
  /** Wallet currency key the yield is granted in, e.g. `"cores"`. */
  currency: string;
  /** Units paid per item level at multiplier `1`. */
  perLevel: number;
  /** Multiplier per rarity id; omitted rarities use `1`. */
  rarityMultiplier?: Readonly<Record<string, number>>;
  /** Floor for the yield (default `1`). */
  minimum?: number;
}

/**
 * The yield an item of this level and rarity breaks down into. The formula is
 * `round(perLevel x level x rarityMultiplier)`, floored by `minimum`, so the same item always yields
 * the same amount and a higher level never yields less.
 *
 * @capability item-salvage-value compute the currency an item of a level and rarity breaks down into
 */
export function salvageValue(item: Pick<ItemDropLike, "level" | "rarity">, table: SalvageTable): SalvageYield {
  const multiplier = table.rarityMultiplier?.[item.rarity] ?? 1;
  const amount = Math.max(table.minimum ?? 1, Math.round(table.perLevel * Math.max(1, item.level) * multiplier));
  return { currency: table.currency, amount };
}

/** The fields salvage reads; an `ItemDrop` from `./drop` satisfies it. */
export interface ItemDropLike {
  id: string;
  level: number;
  rarity: string;
}

/** Salvage outcome: the yield, or the reason the instance could not be broken down. */
export type SalvageResult =
  | { ok: true; id: string; yield: SalvageYield }
  | { ok: false; reason: "already-spent" | "invalid-item" };

/**
 * Break one item down through its ledger. The ledger is claimed before the yield is computed, so a
 * salvaged item cannot be salvaged, equipped or sold again; pass the game's own wallet update from
 * `yield`.
 *
 * @capability item-salvage break an item down for the currency its level and rarity say, once
 */
export function salvageItem(item: ItemDropLike, table: SalvageTable, ledger: ItemLedger): SalvageResult {
  if (!Number.isFinite(item.level) || item.level < 1 || item.id.trim() === "") {
    return { ok: false, reason: "invalid-item" };
  }
  if (!ledger.spend(item.id, "salvaged")) return { ok: false, reason: "already-spent" };
  return { ok: true, id: item.id, yield: salvageValue(item, table) };
}
