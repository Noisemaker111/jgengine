export interface TradeField {
  buy?: Record<string, number>;
  sell?: Record<string, number>;
  shops?: string[];
}

export interface TradeRejection {
  reason: string;
}

export interface TradeWallet {
  canAfford(costs: Record<string, number>): string | null;
  charge(costs: Record<string, number>): void;
  grant(gains: Record<string, number>): void;
}

export interface TradeInventory {
  put(inventoryId: string, itemId: string, count: number): TradeRejection | null;
  take(inventoryId: string, itemId: string, count: number): TradeRejection | null;
  count(inventoryId: string, itemId: string): number;
}

export interface TradeSystemDeps {
  resolveTrade(itemId: string): TradeField | null | undefined;
  wallet: TradeWallet;
  inventory: TradeInventory;
}

export interface TradeParty {
  shop: string;
  inventoryId: string;
}

export interface TradeSystem {
  canBuy(itemId: string, shopId: string, count?: number): string | null;
  canSell(itemId: string, count?: number): string | null;
  buy(itemId: string, count: number | undefined, party: TradeParty): TradeRejection | null;
  sell(itemId: string, count: number | undefined, party: TradeParty): TradeRejection | null;
  tradableAt(shopId: string, allItemIds: string[]): string[];
}

function scale(amounts: Record<string, number>, count: number): Record<string, number> {
  const scaled: Record<string, number> = {};
  for (const [currency, amount] of Object.entries(amounts)) scaled[currency] = amount * count;
  return scaled;
}

function negate(amounts: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [currency, amount] of Object.entries(amounts)) out[currency] = -amount;
  return out;
}

/** @internal */
export function canAffordCosts(balances: Record<string, number>, costs: Record<string, number>): string | null {
  for (const [currency, amount] of Object.entries(costs)) {
    if ((balances[currency] ?? 0) < amount) return "insufficient-funds";
  }
  return null;
}

function buyEligibility(trade: TradeField | null | undefined, shopId: string): string | null {
  if (!trade?.buy) return "not-purchasable";
  if (!trade.shops?.includes(shopId)) return "not-stocked";
  return null;
}

function sellEligibility(trade: TradeField | null | undefined): string | null {
  return trade?.sell ? null : "not-sellable";
}

export interface TradeOutcome {
  itemId: string;
  count: number;
  currency: Record<string, number>;
}

export type TradeResolution =
  | { status: "ok"; outcome: TradeOutcome }
  | { status: "rejected"; reason: string };

/** @internal */
export function resolveBuy(
  itemId: string,
  trade: TradeField | null | undefined,
  shopId: string,
  count: number,
  balances: Record<string, number>,
): TradeResolution {
  const ineligible = buyEligibility(trade, shopId);
  if (ineligible) return { status: "rejected", reason: ineligible };
  const costs = scale(trade!.buy!, count);
  const unaffordable = canAffordCosts(balances, costs);
  if (unaffordable) return { status: "rejected", reason: unaffordable };
  return { status: "ok", outcome: { itemId, count, currency: negate(costs) } };
}

/** @internal */
export function resolveSell(
  itemId: string,
  trade: TradeField | null | undefined,
  count: number,
): TradeResolution {
  const ineligible = sellEligibility(trade);
  if (ineligible) return { status: "rejected", reason: ineligible };
  return { status: "ok", outcome: { itemId, count: -count, currency: scale(trade!.sell!, count) } };
}

/** @internal */
export function applyTradeOutcome(
  outcome: TradeOutcome,
  appliers: {
    adjustItem(itemId: string, count: number): { reason: string } | null;
    adjustCurrency(delta: Record<string, number>): void;
  },
): { reason: string } | null {
  const itemResult = appliers.adjustItem(outcome.itemId, outcome.count);
  if (itemResult) return itemResult;
  appliers.adjustCurrency(outcome.currency);
  return null;
}

/**
 * Buy and sell goods against player currency balances, resolving affordability and price.
 *
 * @capability shop-trade buy and sell goods against player currency balances
  * @internal
  */
export function createTradeSystem(deps: TradeSystemDeps): TradeSystem {
  const { resolveTrade, wallet, inventory } = deps;

  function canBuy(itemId: string, shopId: string, count = 1): string | null {
    const trade = resolveTrade(itemId);
    const ineligible = buyEligibility(trade, shopId);
    if (ineligible) return ineligible;
    return wallet.canAfford(scale(trade!.buy!, count));
  }

  function canSell(itemId: string, _count = 1): string | null {
    return sellEligibility(resolveTrade(itemId));
  }

  return {
    canBuy,
    canSell,
    buy(itemId, count = 1, { shop, inventoryId }) {
      const rejection = canBuy(itemId, shop, count);
      if (rejection) return { reason: rejection };

      const costs = scale(resolveTrade(itemId)!.buy!, count);
      wallet.charge(costs);

      const putResult = inventory.put(inventoryId, itemId, count);
      if (putResult) {
        wallet.grant(costs);
        return putResult;
      }

      return null;
    },
    sell(itemId, count = 1, { inventoryId }) {
      const rejection = canSell(itemId, count);
      if (rejection) return { reason: rejection };

      const takeResult = inventory.take(inventoryId, itemId, count);
      if (takeResult) return takeResult;

      wallet.grant(scale(resolveTrade(itemId)!.sell!, count));
      return null;
    },
    tradableAt(shopId, allItemIds) {
      return allItemIds.filter((itemId) => resolveTrade(itemId)?.shops?.includes(shopId) ?? false);
    },
  };
}
