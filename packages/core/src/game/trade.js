function scale(amounts, count) {
    const scaled = {};
    for (const [currency, amount] of Object.entries(amounts))
        scaled[currency] = amount * count;
    return scaled;
}
export function createTradeSystem(deps) {
    const { resolveTrade, wallet, inventory } = deps;
    function canBuy(itemId, shopId, count = 1) {
        const trade = resolveTrade(itemId);
        if (!trade?.buy)
            return "not-purchasable";
        if (!trade.shops?.includes(shopId))
            return "not-stocked";
        return wallet.canAfford(scale(trade.buy, count));
    }
    function canSell(itemId, _count = 1) {
        const trade = resolveTrade(itemId);
        if (!trade?.sell)
            return "not-sellable";
        return null;
    }
    return {
        canBuy,
        canSell,
        buy(itemId, count = 1, { shop, inventoryId }) {
            const rejection = canBuy(itemId, shop, count);
            if (rejection)
                return { reason: rejection };
            const costs = scale(resolveTrade(itemId).buy, count);
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
            if (rejection)
                return { reason: rejection };
            const takeResult = inventory.take(inventoryId, itemId, count);
            if (takeResult)
                return takeResult;
            wallet.grant(scale(resolveTrade(itemId).sell, count));
            return null;
        },
        tradableAt(shopId, allItemIds) {
            return allItemIds.filter((itemId) => resolveTrade(itemId)?.shops?.includes(shopId) ?? false);
        },
    };
}
