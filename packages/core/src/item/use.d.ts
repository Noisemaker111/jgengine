import type { Aim } from "../scene/spatial";
export interface ItemUseInput {
    from: string;
    itemId: string;
    inventoryId?: string;
    aim?: Aim;
}
export interface ItemUseRejection {
    reason: string;
}
export interface ItemUseResult<TState> {
    state: TState;
    error?: string;
}
export interface ItemUseHandler<TState> {
    can?(state: TState, input: ItemUseInput): ItemUseRejection | null;
    apply(state: TState, input: ItemUseInput): ItemUseResult<TState>;
}
export interface ItemUse<TState> {
    register(handlers: Record<string, ItemUseHandler<TState>>): void;
    registered(): string[];
    can(state: TState, input: ItemUseInput): ItemUseRejection | null;
    use(state: TState, input: ItemUseInput): ItemUseResult<TState>;
}
export declare function createItemUse<TState>(resolveUse: (itemId: string) => string | null | undefined): ItemUse<TState>;
