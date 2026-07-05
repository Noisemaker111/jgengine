export interface LoadoutItemEntry {
    item: string;
    count: number;
    slot?: number;
}
export interface LoadoutDef {
    inventories?: Record<string, LoadoutItemEntry[]>;
    stats?: Record<string, {
        current: number;
        max?: number;
        min?: number;
    }>;
    economy?: Record<string, number>;
    unlocks?: string[];
}
export interface LoadoutInventoryTransaction {
    put(inventoryId: string, itemId: string, count: number, slot?: number): {
        reason: string;
    } | null;
    commit(): void;
}
export interface LoadoutDeps {
    inventory: {
        begin(userId: string): LoadoutInventoryTransaction;
    };
    stats: {
        seed(userId: string, statId: string, pool: {
            current: number;
            max?: number;
            min?: number;
        }): void;
    };
    economy: {
        grant(userId: string, currencyId: string, amount: number): void;
    };
    unlocks: {
        grant(userId: string, unlockId: string): void;
    };
}
export interface Loadouts {
    register(defs: Record<string, LoadoutDef>): void;
    has(loadoutId: string): boolean;
    applyLoadout(userId: string, loadoutId: string): {
        reason: string;
    } | null;
}
export declare function createLoadouts(deps: LoadoutDeps): Loadouts;
