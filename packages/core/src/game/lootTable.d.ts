export interface LootEntry {
    item?: string;
    currency?: string;
    count: number | [number, number];
    weight: number;
}
export interface LootTableDef {
    id: string;
    rolls?: number;
    entries: LootEntry[];
}
export interface Drop {
    item?: string;
    currency?: string;
    count: number;
}
export interface LootRegistry {
    register(def: LootTableDef): void;
    has(id: string): boolean;
    roll(id: string, rng?: () => number): Drop[];
}
export declare function createLootRegistry(): LootRegistry;
export declare function lootTable(def: LootTableDef): LootTableDef;
export declare function grantDrops(drops: Drop[], appliers: {
    putItem: (itemId: string, count: number) => unknown;
    grantCurrency: (currencyId: string, amount: number) => unknown;
}): void;
