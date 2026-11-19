import { devtools } from "../devtools/devtools";

/**
 * Money in this module is an integer count of **minor units** — cents when the currency has two
 * decimals, whole coins when it has none. Every price, cost and total is a safe integer, so a
 * simulation never accumulates float drift; the caller converts at the display boundary.
 */

export interface MarketGoodDef {
  id: string;
  basePrice: number;
  stock: number;
  demand: number;
  coverPeriods?: number;
  elasticity?: number;
  minFactor?: number;
  maxFactor?: number;
  restockCost?: number;
}

export interface MarketGoodState {
  id: string;
  stock: number;
  demand: number;
}

export interface MarketStats {
  goods: number;
  unitsInStock: number;
  stockValue: number;
  sales: number;
  unitsSold: number;
  revenue: number;
  unmetUnits: number;
}

export interface MarketPriceInput {
  basePrice: number;
  stock: number;
  demand: number;
  targetStock: number;
  elasticity: number;
  minFactor: number;
  maxFactor: number;
}

export interface MarketSnapshot {
  goods: readonly MarketGoodState[];
  counters: {
    sales: number;
    unitsSold: number;
    revenue: number;
    unmetUnits: number;
  };
}

export interface MarketConfig {
  goods?: readonly MarketGoodDef[];
  coverPeriods?: number;
  elasticity?: number;
  minFactor?: number;
  maxFactor?: number;
  demandSmoothing?: number;
  unmetDemandFactor?: number;
  priceCurve?: (input: MarketPriceInput) => number;
  devtoolsName?: string;
}

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
  shortfall?: number;
}

/** A sale outcome: the price the buyers paid, or why it could not be served. */
export type MarketSaleResult = MarketSale | MarketSaleRejection;

export interface MarketQuote {
  goodId: string;
  qty: number;
  unitPrice: number;
  total: number;
  shortfall: number;
  /** Unit price after the sale, from the curve — the supply term moving. */
  nextUnitPrice: number;
}

export interface Market {
  priceOf(goodId: string): number;
  priceAfter(goodId: string, qty: number): number;
  targetStockOf(goodId: string): number;
  stockOf(goodId: string): number;
  demandOf(goodId: string): number;
  restockCostOf(goodId: string): number;
  quote(goodId: string, qty: number): MarketQuote | null;
  sell(goodId: string, qty: number): MarketSaleResult;
  restock(goodId: string, qty: number): boolean;
  recordDemand(goodId: string, unitsSold: number, unitsUnmet?: number): void;
  setDemand(goodId: string, demand: number): void;
  retune(goodId: string, patch: Partial<Omit<MarketGoodDef, "id" | "stock" | "demand">>): boolean;
  list(): MarketGoodState[];
  snapshot(): MarketSnapshot;
  restore(next: MarketSnapshot): boolean;
  stats(): MarketStats;
  reset(): void;
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

/** @capability supply-demand-pricing price goods from finite stock and live demand on a stated curve */
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
