export interface StatModifier {
    add?: number;
    multiply?: number;
}
export type StatModifierSet<TStat extends string> = Partial<Record<TStat, StatModifier>>;
export interface Stats<TStat extends string> {
    setBase(stat: TStat, value: number): void;
    getBase(stat: TStat): number;
    addSource(sourceId: string, modifiers: StatModifierSet<TStat>, options?: {
        expiresAtMs?: number;
    }): void;
    removeSource(sourceId: string): void;
    hasSource(sourceId: string): boolean;
    get(stat: TStat, nowMs?: number): number;
    pruneExpired(nowMs: number): string[];
    sources(): string[];
}
export declare function createStats<TStat extends string>(base: Record<TStat, number>): Stats<TStat>;
