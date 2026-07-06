export interface StatValue {
    current: number;
    max: number;
    min: number;
}
export interface StatValuePatch {
    current?: number;
    max?: number;
    min?: number;
}
export type StatValueMap = Record<string, StatValue>;
export type StatCatalog = Record<string, {
    max: number;
    min?: number;
    current?: number;
}>;
export type PoolDeltaResult = {
    status: "ok";
    map: StatValueMap;
    stat: StatValue;
    hitMin: boolean;
    hitMax: boolean;
} | {
    status: "rejected";
    reason: string;
};
export declare function getStatValue(map: StatValueMap, statId: string): StatValue | null;
export declare function setStatValue(map: StatValueMap, statId: string, patch: StatValuePatch): StatValueMap;
export declare function applyPoolDelta(map: StatValueMap, statId: string, amount: number): PoolDeltaResult;
export declare function seedStatValues(catalogStats: StatCatalog): StatValueMap;
export interface EntityStatsApi {
    get(instanceId: string, statId: string): StatValue | null;
    set(instanceId: string, statId: string, patch: StatValuePatch): boolean;
    delta(instanceId: string, statId: string, amount: number): null | {
        reason: string;
    };
}
export declare function createEntityStatsApi(resolve: (instanceId: string) => StatValueMap | undefined): EntityStatsApi;
