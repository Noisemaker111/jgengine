import type { ShopStock, ShopStockEntry } from "../economy/shopStock";
import { rollLoot, type LootCatalog, type LootItem } from "../loot/lootGen";
import type { ItemDrop } from "./drop";

/** How a vendor price is derived from an item: a base, a per-level rate and a rarity multiplier. */
export interface VendorPriceRule {
  /** Wallet currency key the stock is priced in, e.g. `"credits"`. */
  currency: string;
  /** Price floor at level 1 before the rarity multiplier. */
  base: number;
  /** Added per item level. */
  perLevel: number;
  /** Multiplier per rarity id; omitted rarities use `1`. */
  rarityMultiplier?: Readonly<Record<string, number>>;
  /** Buy-back fraction of the buy price; omitted means the vendor does not buy this stock back. */
  sellFactor?: number;
}

/** One stocked item and the shop entry that prices it. */
export interface VendorOffer {
  item: ItemDrop;
  entry: ShopStockEntry;
}

/** What stocking a vendor reads: the roll catalog, a seeded rng and the pricing policy. */
export interface StockVendorOptions {
  catalog: LootCatalog;
  /** Injected random source; pass a seeded generator so the shelf is reproducible. */
  rng: () => number;
  /** Item level rolled onto the shelf. */
  level: number;
  /** How many items to roll. */
  count: number;
  price: VendorPriceRule;
  /** Stable id prefix for this vendor, e.g. `"harbor.guns"`. */
  idPrefix: string;
  /** Whole units on hand; `null` means unlimited (default `1`). */
  qty?: number | null;
}

/**
 * The price of one item under a `VendorPriceRule`: `round(base + perLevel x level)` times the
 * rarity multiplier, never below 1. Sell-back is `floor(price x sellFactor)` when the rule sets one.
 *
 * @capability item-vendor-price price an item from its level and rarity through the economy's currency
 */
export function itemPrice(
  item: Pick<LootItem, "level" | "rarity">,
  rule: VendorPriceRule,
): { buy: number; sell: number | null } {
  const multiplier = rule.rarityMultiplier?.[item.rarity] ?? 1;
  const buy = Math.max(1, Math.round((rule.base + rule.perLevel * Math.max(1, item.level)) * multiplier));
  const sell = rule.sellFactor === undefined ? null : Math.max(0, Math.floor(buy * rule.sellFactor));
  return { buy, sell };
}

/**
 * Roll a vendor's shelf and add it to an existing {@link ShopStock}. Entries added by a previous
 * call with the same `idPrefix` are removed first, so a refresh replaces the shelf instead of
 * throwing on duplicate ids. Buying, selling and wallet charging stay in the economy owner.
 *
 * @capability item-vendor stock a vendor with rolled items priced through the shared economy
 */
export function stockVendor(shop: ShopStock, options: StockVendorOptions): VendorOffer[] {
  for (const entry of shop.list()) {
    if (entry.id.startsWith(`${options.idPrefix}:`)) shop.remove(entry.id);
  }
  const offers: VendorOffer[] = [];
  for (let i = 0; i < Math.max(0, Math.floor(options.count)); i += 1) {
    const item: ItemDrop = {
      ...rollLoot(options.catalog, options.rng, { level: options.level }),
      id: `${options.idPrefix}:${i}`,
    };
    const price = itemPrice(item, options.price);
    const entry: ShopStockEntry = {
      id: item.id,
      kind: item.baseId,
      price: { currency: options.price.currency, amount: price.buy },
      qty: options.qty === undefined ? 1 : options.qty,
      ...(price.sell === null ? {} : { sellPrice: { currency: options.price.currency, amount: price.sell } }),
    };
    shop.add(entry);
    offers.push({ item, entry });
  }
  return offers;
}

/** Where a vendor shelf stands: the run number it was last stocked on. */
export interface VendorRotationState {
  refreshedAt: number;
}

/** A run-count refresh rule; the game owns how many runs between restocks. */
export interface VendorRotation {
  /** True when `run` is at least `everyRuns` past the last refresh. */
  due(run: number): boolean;
  /** Record that the shelf was stocked on `run`. */
  mark(run: number): void;
  state(): VendorRotationState;
  restore(next: VendorRotationState): boolean;
  reset(run?: number): void;
}

/**
 * A restock rule the game authors as "every N runs". It only answers when a refresh is due; the
 * game calls {@link stockVendor} and then `mark`. No timer, so a paused or reloaded save keeps the
 * same shelf until the run count moves.
 *
 * @capability item-vendor-rotation decide when a vendor's shelf is due for a restock
 */
export function createVendorRotation(everyRuns: number, start = 0): VendorRotation {
  if (!Number.isFinite(everyRuns) || everyRuns < 1) throw new RangeError("everyRuns must be >= 1");
  let refreshedAt = start;
  return {
    due: (run) => run - refreshedAt >= everyRuns,
    mark: (run) => {
      refreshedAt = run;
    },
    state: () => ({ refreshedAt }),
    restore(next) {
      if (next === null || typeof next !== "object" || !Number.isFinite(next.refreshedAt)) return false;
      refreshedAt = next.refreshedAt;
      return true;
    },
    reset(run = 0) {
      refreshedAt = run;
    },
  };
}
