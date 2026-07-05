export interface UnlockDef {
    id: string;
    category?: string;
}
export interface Unlocks {
    has(userId: string, unlockId: string): boolean;
    grant(userId: string, unlockId: string): void;
    list(userId: string): string[];
    tree(categoryId: string): UnlockDef[];
    snapshot(userId: string): string[];
    hydrate(userId: string, ids: string[]): void;
}
export declare function createUnlocks(defs?: UnlockDef[]): Unlocks;
