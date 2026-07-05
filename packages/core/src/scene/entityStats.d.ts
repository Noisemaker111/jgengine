export interface PoolStat {
    current: number;
    max: number;
    min: number;
}
export interface PoolStatPatch {
    current?: number;
    max?: number;
    min?: number;
}
export type PoolStatMap = Record<string, PoolStat>;
export type PoolStatCatalog = Record<string, {
    max: number;
    min?: number;
    current?: number;
}>;
export type PoolDeltaResult = {
    status: "ok";
    map: PoolStatMap;
    stat: PoolStat;
    hitMin: boolean;
    hitMax: boolean;
} | {
    status: "rejected";
    reason: string;
};
export declare function getPoolStat(map: PoolStatMap, statId: string): PoolStat | null;
export declare function setPoolStat(map: PoolStatMap, statId: string, patch: PoolStatPatch): PoolStatMap;
export declare function applyPoolDelta(map: PoolStatMap, statId: string, amount: number): PoolDeltaResult;
export declare function seedPoolStats(catalogStats: PoolStatCatalog): PoolStatMap;
export interface EntityStatsApi {
    get(instanceId: string, statId: string): PoolStat | null;
    set(instanceId: string, statId: string, patch: PoolStatPatch): boolean;
    delta(instanceId: string, statId: string, amount: number): null | {
        reason: string;
    };
}
export declare function createEntityStatsApi(resolve: (instanceId: string) => PoolStatMap | undefined): EntityStatsApi;
