import { devtools } from "../devtools/devtools";

/**
 * Money in this module is an integer count of **minor units** — cents when the currency has two
 * decimals, whole coins when it has none. Every price, cost and total is a safe integer, so a
 * simulation never accumulates float drift; the caller converts at the display boundary.
 */

/** One traded good: its reference price, finite stock, demand and price-curve policy. */
export interface MarketGoodDef {
  /** Stable id, unique within a market. */
  id: string;
  /** Price per unit at the reference stock, in integer minor units. */
  basePrice: number;
  /** Units on hand; a non-negative integer. Finite by construction. */
  stock: number;
  /** Units buyers want per period at `basePrice`; a non-negative finite number. */
  demand: number;
  /** Periods of demand the market wants to hold in stock (default `4`). */
  coverPeriods?: number;
  /** Curve exponent: how hard price reacts to a stock/demand gap (default `1`). */
  elasticity?: number;
  /** Floor on the price as a fraction of `basePrice` (default `0.25`). */
  minFactor?: number;
  /** Ceiling on the price as a fraction of `basePrice` (default `4`). */
  maxFactor?: number;
  /** What one unit costs the caller from the market's supplier, in minor units (default `basePrice`). */
  restockCost?: number;
}

/** The mutable half of a good: what a save stores, with the definition kept as authored data. */
export interface MarketGoodState {
  id: string;
  stock: number;
  demand: number;
}

/** Counters and stocks of a market, for a probe or a summary line. */
export interface MarketStats {
  goods: number;
  unitsInStock: number;
  /** Sum of `stock × price` over every good, in minor units. */
  stockValue: number;
  sales: number;
  unitsSold: number;
  /** Gross takings, in minor units. */
  revenue: number;
  /** Units buyers asked for that stock could not serve. */
  unmetUnits: number;
}

/** Everything a price curve reads: the good's resolved policy plus its live stock and demand. */
export interface MarketPriceInput {
  basePrice: number;
  stock: number;
  demand: number;
  /** `coverPeriods × demand` — the stock at which price is `basePrice`. */
  targetStock: number;
  elasticity: number;
  minFactor: number;
  maxFactor: number;
}

/** Serializable market state: the mutable half of every good plus the running counters. */
export interface MarketSnapshot {
  goods: readonly MarketGoodState[];
  counters: {
    sales: number;
    unitsSold: number;
    revenue: number;
    unmetUnits: number;
  };
}

/** Options for {@link createMarket}: the goods and the price/demand policy they share. */
export interface MarketConfig {
  goods?: readonly MarketGoodDef[];
  /** Periods of demand held in stock when a good does not name its own; default `4`. */
  coverPeriods?: number;
  /** Curve exponent when a good does not name its own; default `1`. */
  elasticity?: number;
  minFactor?: number;
  maxFactor?: number;
  /** Fraction of the gap between current and observed demand adopted per {@link Market.recordDemand} (default `0.5`). */
  demandSmoothing?: number;
  /** Weight added to demand per unit buyers asked for and did not get (default `0.5`). */
  unmetDemandFactor?: number;
  /** Replace the default price curve; receives the good's resolved inputs. */
  priceCurve?: (input: MarketPriceInput) => number;
  /** Register a devtools probe under this name reporting {@link MarketStats}. */
  devtoolsName?: string;
}

/** A served sale: what the buyer paid per unit and in total, in minor units. */
export interface MarketSale {
  ok: true;
  goodId: string;
  qty: number;
  unitPrice: number;
  total: number;
}

/** Why a sale could not be served. */
export interface MarketSaleRejection {
  ok: false;
  reason: "unknown-good" | "invalid-qty" | "out-of-stock";
  /** Units the market could not cover; only present for `"out-of-stock"`. */
  shortfall?: number;
}

/** A sale outcome: the price the buyers paid, or why it could not be served. */
export type MarketSaleResult = MarketSale | MarketSaleRejection;

/** A non-mutating read of what a sale would cost and how it would move the price. */
export interface MarketQuote {
  goodId: string;
  qty: number;
  unitPrice: number;
  total: number;
  /** Units that could not be covered from stock. */
  shortfall: number;
  /** Unit price after the sale, from the curve — the supply term moving. */
  nextUnitPrice: number;
}

/** A live market: prices from supply and demand over finite stock, with serializable state. */
export interface Market {
  /** Unit price in integer minor units. */
  priceOf(goodId: string): number;
  /** Price after `qty` more units left stock (a negative `qty` is a delivery), without mutating. */
  priceAfter(goodId: string, qty: number): number;
  /** `coverPeriods × demand` — the stock the market wants on hand. */
  targetStockOf(goodId: string): number;
  stockOf(goodId: string): number;
  demandOf(goodId: string): number;
  /** What one unit costs from the supplier, in minor units. */
  restockCostOf(goodId: string): number;
  /** What a sale of `qty` would cost and do to the price; `null` for an unknown good. */
  quote(goodId: string, qty: number): MarketQuote | null;
  /** Serve `qty` units to buyers: decrements finite stock and returns the price they paid. */
  sell(goodId: string, qty: number): MarketSaleResult;
  /** Take delivery of `qty` units from the supplier, lowering the price. `false` for an unknown good or bad count. */
  restock(goodId: string, qty: number): boolean;
  /**
   * Fold one period of observed buying into demand: smooths it toward what sold and adds
   * `unmetDemandFactor × unitsUnmet`. This is the demand term of the price curve moving.
   */
  recordDemand(goodId: string, unitsSold: number, unitsUnmet?: number): void;
  /** Set demand directly, e.g. from an authored scenario. */
  setDemand(goodId: string, demand: number): void;
  /** Change a good's price policy in play. `false` for an unknown good or an unusable patch. */
  retune(goodId: string, patch: Partial<Omit<MarketGoodDef, "id" | "stock" | "demand">>): boolean;
  /** Every good's mutable state, in insertion order. */
  list(): MarketGoodState[];
  snapshot(): MarketSnapshot;
  /** Replace state; returns `false` without mutation when the snapshot is malformed or names an unknown good. */
  restore(next: MarketSnapshot): boolean;
  stats(): MarketStats;
  reset(): void;
  /** Drop the devtools probe registered by `devtoolsName`. Safe to call twice. */
  dispose(): void;
}

interface GoodRecord {
  id: string;
  basePrice: number;
  coverPeriods: number;
  elasticity: number;
  minFactor: number;
  maxFactor: number;
  restockCost: number;
  stock: number;
  demand: number;
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new RangeError(message);
}

function isMinorUnits(value: number): boolean {
  return Number.isSafeInteger(value);
}

function assertGood(def: MarketGoodDef, config: MarketConfig, seen: Set<string>): void {
  check(def.id.trim() !== "", 'Market good field "id" must not be empty');
  check(!seen.has(def.id), `Market good "${def.id}" is declared twice`);
  seen.add(def.id);
  check(isMinorUnits(def.basePrice) && def.basePrice > 0, `Market good "${def.id}" basePrice must be a positive integer in minor units`);
  check(Number.isInteger(def.stock) && def.stock >= 0, `Market good "${def.id}" stock must be a non-negative integer`);
  check(Number.isFinite(def.demand) && def.demand >= 0, `Market good "${def.id}" demand must be a non-negative finite number`);
  const cover = def.coverPeriods ?? config.coverPeriods ?? 4;
  check(Number.isFinite(cover) && cover > 0, `Market good "${def.id}" coverPeriods must be positive`);
  const elasticity = def.elasticity ?? config.elasticity ?? 1;
  check(Number.isFinite(elasticity) && elasticity > 0, `Market good "${def.id}" elasticity must be positive`);
  const minFactor = def.minFactor ?? config.minFactor ?? 0.25;
  const maxFactor = def.maxFactor ?? config.maxFactor ?? 4;
  check(minFactor > 0 && maxFactor >= minFactor, `Market good "${def.id}" needs 0 < minFactor <= maxFactor`);
  const cost = def.restockCost ?? def.basePrice;
  check(isMinorUnits(cost) && cost >= 0, `Market good "${def.id}" restockCost must be a non-negative integer in minor units`);
}

/** The default price curve: `basePrice × (targetStock / stock)^elasticity`, clamped to the factor bounds. */
function defaultPrice(input: MarketPriceInput): number {
  const scarcity = input.targetStock / Math.max(1, input.stock);
  const raw = input.basePrice * scarcity ** input.elasticity;
  const floor = input.basePrice * input.minFactor;
  const ceiling = input.basePrice * input.maxFactor;
  return Math.round(Math.max(floor, Math.min(ceiling, raw)));
}

/**
 * A market whose price comes from supply and demand over finite stock, as plain serializable state.
 *
 * The stated curve is `price = clamp(basePrice × (coverPeriods × demand / max(stock, 1))^elasticity)`
 * between `basePrice × minFactor` and `basePrice × maxFactor`. Both terms are live: selling thins
 * stock and raises the price, restocking lowers it, and `recordDemand` moves demand from what
 * buyers actually took and could not take. `priceCurve` replaces the curve, and `retune` changes a
 * good's policy in play. Money is integer minor units throughout.
 *
 * @capability supply-demand-pricing price goods from finite stock and live demand on a stated curve
 */
export function createMarket(config: MarketConfig = {}): Market {
  const records = new Map<string, GoodRecord>();
  const seen = new Set<string>();
  for (const def of config.goods ?? []) {
    assertGood(def, config, seen);
    records.set(def.id, {
      id: def.id,
      basePrice: def.basePrice,
      coverPeriods: def.coverPeriods ?? config.coverPeriods ?? 4,
      elasticity: def.elasticity ?? config.elasticity ?? 1,
      minFactor: def.minFactor ?? config.minFactor ?? 0.25,
      maxFactor: def.maxFactor ?? config.maxFactor ?? 4,
      restockCost: def.restockCost ?? def.basePrice,
      stock: def.stock,
      demand: def.demand,
    });
  }
  const demandSmoothing = config.demandSmoothing ?? 0.5;
  const unmetDemandFactor = config.unmetDemandFactor ?? 0.5;
  const curve = config.priceCurve ?? defaultPrice;

  let counters = { sales: 0, unitsSold: 0, revenue: 0, unmetUnits: 0 };

  const inputsOf = (record: GoodRecord, stock: number): MarketPriceInput => ({
    basePrice: record.basePrice,
    stock,
    demand: record.demand,
    targetStock: record.coverPeriods * record.demand,
    elasticity: record.elasticity,
    minFactor: record.minFactor,
    maxFactor: record.maxFactor,
  });

  const priceAt = (record: GoodRecord, stock: number): number => Math.round(curve(inputsOf(record, stock)));

  const readGoods = (): MarketGoodState[] =>
    Array.from(records.values(), (record) => ({ id: record.id, stock: record.stock, demand: record.demand }));

  const probe = config.devtoolsName === undefined
    ? null
    : devtools.probes.register(config.devtoolsName, () => readStats());

  function readStats(): MarketStats {
    let unitsInStock = 0;
    let stockValue = 0;
    for (const record of records.values()) {
      unitsInStock += record.stock;
      stockValue += record.stock * priceAt(record, record.stock);
    }
    return { goods: records.size, unitsInStock, stockValue, ...counters };
  }

  return {
    priceOf(goodId) {
      const record = records.get(goodId);
      return record === undefined ? 0 : priceAt(record, record.stock);
    },
    priceAfter(goodId, qty) {
      const record = records.get(goodId);
      if (record === undefined) return 0;
      const moved = Number.isFinite(qty) ? qty : 0;
      return priceAt(record, Math.max(0, record.stock - moved));
    },
    targetStockOf(goodId) {
      const record = records.get(goodId);
      return record === undefined ? 0 : record.coverPeriods * record.demand;
    },
    stockOf(goodId) {
      return records.get(goodId)?.stock ?? 0;
    },
    demandOf(goodId) {
      return records.get(goodId)?.demand ?? 0;
    },
    restockCostOf(goodId) {
      return records.get(goodId)?.restockCost ?? 0;
    },
    quote(goodId, qty) {
      const record = records.get(goodId);
      if (record === undefined) return null;
      const unitPrice = priceAt(record, record.stock);
      const served = Math.max(0, Math.min(qty, record.stock));
      return {
        goodId,
        qty,
        unitPrice,
        total: unitPrice * served,
        shortfall: qty - served,
        nextUnitPrice: priceAt(record, record.stock - served),
      };
    },
    sell(goodId, qty) {
      const record = records.get(goodId);
      if (record === undefined) return { ok: false, reason: "unknown-good" };
      if (!Number.isInteger(qty) || qty < 1) return { ok: false, reason: "invalid-qty" };
      if (qty > record.stock) return { ok: false, reason: "out-of-stock", shortfall: qty - record.stock };
      const unitPrice = priceAt(record, record.stock);
      record.stock -= qty;
      counters = {
        sales: counters.sales + 1,
        unitsSold: counters.unitsSold + qty,
        revenue: counters.revenue + unitPrice * qty,
        unmetUnits: counters.unmetUnits,
      };
      return { ok: true, goodId, qty, unitPrice, total: unitPrice * qty };
    },
    restock(goodId, qty) {
      const record = records.get(goodId);
      if (record === undefined) return false;
      if (!Number.isInteger(qty) || qty < 1) return false;
      record.stock += qty;
      return true;
    },
    recordDemand(goodId, unitsSold, unitsUnmet = 0) {
      const record = records.get(goodId);
      if (record === undefined) return;
      const sold = Number.isFinite(unitsSold) ? Math.max(0, unitsSold) : 0;
      const unmet = Number.isFinite(unitsUnmet) ? Math.max(0, unitsUnmet) : 0;
      const smoothed = record.demand + demandSmoothing * (sold - record.demand);
      record.demand = Math.max(0, smoothed + unmetDemandFactor * unmet);
      if (unmet > 0) counters = { ...counters, unmetUnits: counters.unmetUnits + unmet };
    },
    setDemand(goodId, demand) {
      const record = records.get(goodId);
      if (record === undefined) return;
      check(Number.isFinite(demand) && demand >= 0, `Market good "${goodId}" demand must be a non-negative finite number`);
      record.demand = demand;
    },
    retune(goodId, patch) {
      const record = records.get(goodId);
      if (record === undefined) return false;
      const merged: MarketGoodDef = {
        id: goodId,
        basePrice: patch.basePrice ?? record.basePrice,
        stock: record.stock,
        demand: record.demand,
        coverPeriods: patch.coverPeriods ?? record.coverPeriods,
        elasticity: patch.elasticity ?? record.elasticity,
        minFactor: patch.minFactor ?? record.minFactor,
        maxFactor: patch.maxFactor ?? record.maxFactor,
        restockCost: patch.restockCost ?? record.restockCost,
      };
      try {
        assertGood(merged, config, new Set());
      } catch {
        return false;
      }
      record.basePrice = merged.basePrice;
      record.coverPeriods = merged.coverPeriods ?? record.coverPeriods;
      record.elasticity = merged.elasticity ?? record.elasticity;
      record.minFactor = merged.minFactor ?? record.minFactor;
      record.maxFactor = merged.maxFactor ?? record.maxFactor;
      record.restockCost = merged.restockCost ?? record.restockCost;
      return true;
    },
    list: readGoods,
    snapshot() {
      return { goods: readGoods(), counters: { ...counters } };
    },
    restore(next) {
      if (!Array.isArray(next.goods)) return false;
      const restored: MarketGoodState[] = [];
      for (const good of next.goods) {
        const record = records.get(good.id);
        if (record === undefined) return false;
        if (!Number.isInteger(good.stock) || good.stock < 0) return false;
        if (!Number.isFinite(good.demand) || good.demand < 0) return false;
        restored.push({ id: good.id, stock: good.stock, demand: good.demand });
      }
      const countersIn = next.counters;
      if (
        countersIn === undefined ||
        !Number.isInteger(countersIn.sales) || countersIn.sales < 0 ||
        !Number.isInteger(countersIn.unitsSold) || countersIn.unitsSold < 0 ||
        !isMinorUnits(countersIn.revenue) ||
        !Number.isInteger(countersIn.unmetUnits) || countersIn.unmetUnits < 0
      ) return false;
      for (const good of restored) {
        const record = records.get(good.id)!;
        record.stock = good.stock;
        record.demand = good.demand;
      }
      counters = { ...countersIn };
      return true;
    },
    stats: readStats,
    reset() {
      for (const record of records.values()) {
        record.stock = 0;
        record.demand = 0;
      }
      counters = { sales: 0, unitsSold: 0, revenue: 0, unmetUnits: 0 };
    },
    dispose() {
      probe?.();
    },
  };
}
