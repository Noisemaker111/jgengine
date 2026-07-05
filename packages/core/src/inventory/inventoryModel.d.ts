export interface ItemTraits {
    stackLimit(itemId: string): number;
    kind?(itemId: string): string | null;
}
export interface InventoryLayout {
    slots: number;
    accepts?: string | readonly string[];
}
export type InventorySlot = {
    itemId: string;
    count: number;
} | null;
export interface InventoryState {
    slots: InventorySlot[];
}
export type PutResult = {
    status: "ok";
    state: InventoryState;
} | {
    status: "rejected";
    reason: "no-space" | "wrong-kind" | "slot-occupied" | "invalid-slot";
};
export type TakeResult = {
    status: "ok";
    state: InventoryState;
} | {
    status: "rejected";
    reason: "insufficient";
};
export type MoveResult = {
    status: "ok";
    from: InventoryState;
    to: InventoryState;
} | {
    status: "rejected";
    reason: "invalid-slot" | "empty-slot" | "wrong-kind" | "no-space";
};
export declare function createEmptyInventory(layout: InventoryLayout): InventoryState;
export declare function putItem(state: InventoryState, layout: InventoryLayout, traits: ItemTraits, itemId: string, count: number, options?: {
    slot?: number;
}): PutResult;
export declare function takeItem(state: InventoryState, itemId: string, count: number): TakeResult;
export declare function countItem(state: InventoryState, itemId: string): number;
export declare function hasItem(state: InventoryState, itemId: string, count: number): boolean;
export declare function moveItem(from: InventoryState, fromSlot: number, to: InventoryState, toLayout: InventoryLayout, traits: ItemTraits, toSlot?: number): MoveResult;
export interface InventorySet<TId extends string> {
    put(id: TId, itemId: string, count: number, options?: {
        slot?: number;
    }): PutResult;
    take(id: TId, itemId: string, count: number): TakeResult;
    move(fromId: TId, fromSlot: number, toId: TId, toSlot?: number): MoveResult;
    count(id: TId, itemId: string): number;
    has(id: TId, itemId: string, count: number): boolean;
    state(id: TId): InventoryState;
    replaceState(id: TId, state: InventoryState): void;
}
export declare function createInventorySet<TId extends string>(layouts: Record<TId, InventoryLayout>, traits: ItemTraits): InventorySet<TId>;
