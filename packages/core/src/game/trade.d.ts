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
export declare function createTradeSystem(deps: TradeSystemDeps): TradeSystem;
