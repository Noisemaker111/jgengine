import { canAfford, charge, grant, type WalletState } from "./wallet";

export interface ShopPrice {
  /** Free-string currency key the game owns — matches a {@link WalletState} balance key. Never interpreted. */
  currency: string;
  amount: number;
}

/** One item a vendor stocks. Fully serializable; `kind` and `currency` are free strings the model never branches on. */
export interface ShopStockEntry {
  id: string;
  /** Free-string label the game owns and styles ("potion", "blade", "charm", …). The model never interprets it. */
  kind: string;
  price: ShopPrice;
  /** Units on hand: a non-negative integer, or `null` for unlimited (never decrements, never sells out). */
  qty: number | null;
  sellPrice?: ShopPrice;
}

export interface ShopStockConfig {
  /** Initial stock. Ids must be unique; a duplicate id throws. */
  entries?: readonly ShopStockEntry[];
}

/** Why a {@link ShopStock.buy} was refused. */
export type ShopBuyRejection = "unknown-item" | "out-of-stock" | "insufficient-funds";

/** Why a {@link ShopStock.sell} was refused. */
export type ShopSellRejection = "unknown-item" | "not-sellable";

export type ShopBuyResult =
  | { ok: true; wallet: WalletState; entry: ShopStockEntry }
  | { ok: false; reason: ShopBuyRejection };

export type ShopSellResult =
  | { ok: true; wallet: WalletState; entry: ShopStockEntry }
  | { ok: false; reason: ShopSellRejection };

export interface ShopStockSnapshot {
  entries: readonly ShopStockEntry[];
}

export interface ShopStock {
  /**
   * Buy one unit of `id` against `wallet` (the shop never owns the wallet). Debits the entry's `price`
   * via {@link charge}, decrements a finite `qty`, and returns the new wallet to adopt plus the entry
   * snapshot. Rejects `"unknown-item"`, `"out-of-stock"` (finite qty at 0), or `"insufficient-funds"`
   * — the passed wallet is never mutated.
   */
  buy(id: string, wallet: WalletState): ShopBuyResult;
  /**
   * Sell one unit of `id` back to the vendor, crediting the entry's `sellPrice` to `wallet` via
   * {@link grant} and incrementing a finite `qty`. Rejects `"unknown-item"` or `"not-sellable"`
   * (no `sellPrice`). The passed wallet is never mutated.
   */
  sell(id: string, wallet: WalletState): ShopSellResult;
  canAfford(id: string, wallet: WalletState): boolean;
  restock(id: string, n: number): void;
  setPrice(id: string, price: ShopPrice): void;
  add(entry: ShopStockEntry): void;
  remove(id: string): void;
  list(): ShopStockEntry[];
  get(id: string): ShopStockEntry | null;
  subscribe(listener: () => void): () => void;
  snapshot(): ShopStockSnapshot;
  restore(snapshot: ShopStockSnapshot): void;
}

function assertPrice(price: ShopPrice): void {
  if (typeof price.currency !== "string" || price.currency.length === 0) {
    throw new TypeError(`price.currency must be a non-empty string, got ${String(price.currency)}`);
  }
  if (!Number.isFinite(price.amount) || price.amount < 0) {
    throw new RangeError(`price.amount must be a non-negative finite number, got ${price.amount}`);
  }
}

function assertQty(qty: number | null): void {
  if (qty === null) return;
  if (!Number.isInteger(qty) || qty < 0) {
    throw new RangeError(`qty must be null or a non-negative integer, got ${qty}`);
  }
}

/** Deep-copy an entry so live internal records are never handed out or retained by callers. */
function cloneEntry(entry: ShopStockEntry): ShopStockEntry {
  const copy: ShopStockEntry = {
    id: entry.id,
    kind: entry.kind,
    price: { currency: entry.price.currency, amount: entry.price.amount },
    qty: entry.qty,
  };
  if (entry.sellPrice !== undefined) {
    copy.sellPrice = { currency: entry.sellPrice.currency, amount: entry.sellPrice.amount };
  }
  return copy;
}

function validateEntry(entry: ShopStockEntry): void {
  if (typeof entry.id !== "string" || entry.id.length === 0) {
    throw new TypeError(`entry.id must be a non-empty string, got ${String(entry.id)}`);
  }
  if (typeof entry.kind !== "string") {
    throw new TypeError(`entry.kind must be a string, got ${String(entry.kind)}`);
  }
  assertPrice(entry.price);
  assertQty(entry.qty);
  if (entry.sellPrice !== undefined) assertPrice(entry.sellPrice);
}

/**
 * A serializable, observable vendor/shop stock. Each entry carries a game-owned free-string `kind`, a
 * `price` in a free-string `currency`, a finite or unlimited (`qty: null`) count, and an optional
 * `sellPrice` buy-back. All currency math is delegated to the existing pure `wallet` model — `buy`
 * charges and `sell` grants a **caller-owned** {@link WalletState} (the shop never holds the wallet, it
 * returns the new wallet for the caller to adopt), so the same stock composes with any wallet the game
 * owns. Nothing here is genre-specific: `kind` and `currency` are free labels the game styles and the
 * model never branches on. `restock`/`setPrice`/`add`/`remove` mutate the catalog, `subscribe` observes
 * every change, and `snapshot`/`restore` round-trips the whole stock through a save.
 *
 * @capability shop-grid serializable vendor/shop stock with buy/sell over a caller-owned wallet — finite/unlimited qty, sell-back, restock/setPrice, snapshot/restore
 */
export function createShopStock(config: ShopStockConfig = {}): ShopStock {
  // Insertion-ordered map of live records (Map preserves insertion order for list()/snapshot()).
  let entries = new Map<string, ShopStockEntry>();
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function ingest(entry: ShopStockEntry, target = entries): void {
    validateEntry(entry);
    if (target.has(entry.id)) throw new Error(`duplicate shop entry id: ${entry.id}`);
    target.set(entry.id, cloneEntry(entry));
  }

  for (const entry of config.entries ?? []) ingest(entry);

  return {
    buy(id, wallet) {
      const entry = entries.get(id);
      if (entry === undefined) return { ok: false, reason: "unknown-item" };
      if (entry.qty !== null && entry.qty <= 0) return { ok: false, reason: "out-of-stock" };
      let nextWallet = wallet;
      if (entry.price.amount > 0) {
        const result = charge(wallet, entry.price.currency, entry.price.amount);
        if (result.status === "rejected") return { ok: false, reason: "insufficient-funds" };
        nextWallet = result.state;
      }
      if (entry.qty !== null) entry.qty -= 1;
      notify();
      return { ok: true, wallet: nextWallet, entry: cloneEntry(entry) };
    },
    sell(id, wallet) {
      const entry = entries.get(id);
      if (entry === undefined) return { ok: false, reason: "unknown-item" };
      if (entry.sellPrice === undefined) return { ok: false, reason: "not-sellable" };
      const nextWallet = entry.sellPrice.amount > 0 ? grant(wallet, entry.sellPrice.currency, entry.sellPrice.amount) : wallet;
      if (entry.qty !== null) entry.qty += 1;
      notify();
      return { ok: true, wallet: nextWallet, entry: cloneEntry(entry) };
    },
    canAfford(id, wallet) {
      const entry = entries.get(id);
      if (entry === undefined) return false;
      if (entry.qty !== null && entry.qty <= 0) return false;
      if (entry.price.amount <= 0) return true;
      return canAfford(wallet, { [entry.price.currency]: entry.price.amount });
    },
    restock(id, n) {
      if (!Number.isInteger(n) || n < 0) throw new RangeError(`restock count must be a non-negative integer, got ${n}`);
      const entry = entries.get(id);
      if (entry === undefined || entry.qty === null || n === 0) return;
      entry.qty += n;
      notify();
    },
    setPrice(id, price) {
      const entry = entries.get(id);
      if (entry === undefined) return;
      assertPrice(price);
      entry.price = { currency: price.currency, amount: price.amount };
      notify();
    },
    add(entry) {
      ingest(entry);
      notify();
    },
    remove(id) {
      if (entries.delete(id)) notify();
    },
    list() {
      return Array.from(entries.values(), cloneEntry);
    },
    get(id) {
      const entry = entries.get(id);
      return entry === undefined ? null : cloneEntry(entry);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return { entries: Array.from(entries.values(), cloneEntry) };
    },
    restore(snapshot) {
      const next = new Map<string, ShopStockEntry>();
      for (const entry of snapshot.entries) ingest(entry, next);
      entries = next;
      notify();
    },
  };
}
