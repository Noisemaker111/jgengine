/** One completed sale recorded into a {@link PriceHistory}. */
export interface SaleRecord {
  readonly itemId: string;
  readonly count: number;
  readonly unitPrice: number;
  readonly currency: string;
  readonly at: number;
}

/**
 * Tunables for {@link createPriceHistory} — the per-item sample cap bounds memory; the optional
 * window drops samples older than `windowSeconds` whenever the history is written or read with a
 * newer timestamp.
 */
export interface PriceHistoryConfig {
  maxSamplesPerItem: number;
  windowSeconds?: number;
}

/** Aggregated market stats for one item over the retained samples. */
export interface PriceStats {
  readonly sampleCount: number;
  readonly volume: number;
  readonly minUnitPrice: number;
  readonly maxUnitPrice: number;
  readonly averageUnitPrice: number;
  readonly latestUnitPrice: number;
}

/** A bounded rolling record of completed sales per item. See {@link createPriceHistory}. */
export interface PriceHistory {
  record(sale: SaleRecord): void;
  statsOf(itemId: string, now?: number): PriceStats | null;
  samplesOf(itemId: string, now?: number): readonly SaleRecord[];
  itemIds(): readonly string[];
  clear(itemId?: string): void;
}

/**
 * The "market price" readout behind every auction house: a bounded rolling record of completed
 * sales per item, aggregated into min/max/volume-weighted-average/latest unit-price stats so games
 * can show current value and recent trends. Memory is bounded by `maxSamplesPerItem` (oldest
 * samples drop first) and optionally by a sliding time window; timestamps are injected by the
 * caller so the history stays deterministic.
 *
 * @capability price-history rolling per-item sale records aggregated into market price stats
 */
export function createPriceHistory(config: PriceHistoryConfig): PriceHistory {
  const samples = new Map<string, SaleRecord[]>();

  function trim(list: SaleRecord[], now: number | undefined): void {
    if (config.windowSeconds !== undefined && now !== undefined) {
      const cutoff = now - config.windowSeconds;
      let drop = 0;
      while (drop < list.length && list[drop].at < cutoff) drop += 1;
      if (drop > 0) list.splice(0, drop);
    }
    if (list.length > config.maxSamplesPerItem) {
      list.splice(0, list.length - config.maxSamplesPerItem);
    }
  }

  function retained(itemId: string, now: number | undefined): SaleRecord[] | null {
    const list = samples.get(itemId);
    if (list === undefined) return null;
    trim(list, now);
    if (list.length === 0) {
      samples.delete(itemId);
      return null;
    }
    return list;
  }

  return {
    record(sale) {
      if (!Number.isFinite(sale.unitPrice) || sale.unitPrice < 0) return;
      if (!Number.isInteger(sale.count) || sale.count < 1) return;
      let list = samples.get(sale.itemId);
      if (list === undefined) {
        list = [];
        samples.set(sale.itemId, list);
      }
      list.push(sale);
      trim(list, sale.at);
    },
    statsOf(itemId, now) {
      const list = retained(itemId, now);
      if (list === null) return null;
      let volume = 0;
      let spend = 0;
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (const sale of list) {
        volume += sale.count;
        spend += sale.unitPrice * sale.count;
        if (sale.unitPrice < min) min = sale.unitPrice;
        if (sale.unitPrice > max) max = sale.unitPrice;
      }
      return {
        sampleCount: list.length,
        volume,
        minUnitPrice: min,
        maxUnitPrice: max,
        averageUnitPrice: spend / volume,
        latestUnitPrice: list[list.length - 1].unitPrice,
      };
    },
    samplesOf(itemId, now) {
      const list = retained(itemId, now);
      return list === null ? [] : [...list];
    },
    itemIds() {
      return [...samples.keys()];
    },
    clear(itemId) {
      if (itemId === undefined) samples.clear();
      else samples.delete(itemId);
    },
  };
}
