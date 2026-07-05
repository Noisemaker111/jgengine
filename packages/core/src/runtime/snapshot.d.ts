export declare const RUNTIME_SNAPSHOT_VERSION = 1;
export type RuntimeEntityRow = {
    instanceId: string;
    catalogId: string;
    position?: [number, number, number];
    rotationY?: number;
    parentSpace?: string;
    group?: string;
    stats?: Record<string, {
        current: number;
        max: number;
        min?: number;
    }>;
    targetInstanceId?: string | null;
    userId?: string;
};
export type RuntimeObjectRow = {
    instanceId: string;
    catalogId: string;
    position: [number, number, number];
    rotationY?: number;
    parentSpace?: string;
    flags?: Record<string, unknown>;
};
export type RuntimeInventorySlot = {
    item: string;
    count: number;
    slot?: number;
};
export type RuntimePlayerRow = {
    userId: string;
    inventories: Record<string, RuntimeInventorySlot[]>;
    economy: Record<string, number>;
    unlocks: string[];
    quests?: unknown;
    social?: unknown;
    leaderboard?: Record<string, number>;
    session?: Record<string, unknown>;
};
export type RuntimeChunkRow = {
    chunkKey: string;
    objects: RuntimeObjectRow[];
    entities: RuntimeEntityRow[];
    flags?: Record<string, unknown>;
};
export type RuntimeServerRow = {
    entities: RuntimeEntityRow[];
    objects: RuntimeObjectRow[];
    session: Record<string, unknown>;
    feeds?: Record<string, unknown[]>;
};
export type RuntimeProfileRow = {
    userId: string;
    gameId: string;
    player: RuntimePlayerRow;
    updatedAt: number;
};
export type GameRuntimeSnapshot = {
    version: number;
    gameId: string;
    serverId: string;
    server: RuntimeServerRow;
    players: Record<string, RuntimePlayerRow>;
    chunks: Record<string, RuntimeChunkRow>;
    revision: number;
    dirty: {
        server: boolean;
        players: string[];
        chunks: string[];
    };
};
export declare function createEmptyServerRow(): RuntimeServerRow;
export declare function createEmptyPlayerRow(userId: string): RuntimePlayerRow;
export declare function createRuntimeSnapshot(args: {
    gameId: string;
    serverId: string;
    server?: RuntimeServerRow;
    players?: Record<string, RuntimePlayerRow>;
    chunks?: Record<string, RuntimeChunkRow>;
}): GameRuntimeSnapshot;
export declare function markServerDirty(snapshot: GameRuntimeSnapshot): GameRuntimeSnapshot;
export declare function markPlayerDirty(snapshot: GameRuntimeSnapshot, userId: string): GameRuntimeSnapshot;
export declare function clearDirtyFlags(snapshot: GameRuntimeSnapshot): GameRuntimeSnapshot;
export declare function splitProfilePlayer(player: RuntimePlayerRow): {
    persistent: RuntimePlayerRow;
    session: Record<string, unknown>;
};
