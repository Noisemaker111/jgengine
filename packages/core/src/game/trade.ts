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

export function createTradeSystem(deps: TradeSystemDeps): TradeSystem {
  const { resolveTrade, wallet, inventory } = deps;

  function canBuy(itemId: string, shopId: string, count = 1): string | null {
    const trade = resolveTrade(itemId);
    if (!trade?.buy) return "not-purchasable";
    if (!trade.shops?.includes(shopId)) return "not-stocked";
    return wallet.canAfford(scale(trade.buy, count));
  }

  function canSell(itemId: string, _count = 1): string | null {
    const trade = resolveTrade(itemId);
    if (!trade?.sell) return "not-sellable";
    return null;
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
