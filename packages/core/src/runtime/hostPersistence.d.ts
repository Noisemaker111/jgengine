import type { LeaderboardScope } from "../game/leaderboard";
import type { SaveConfig } from "./save";
import type { GameRuntimeSnapshot, RuntimeChunkRow, RuntimePlayerRow, RuntimeServerRow } from "./snapshot";
export type GameServerStatus = "open" | "running" | "closed";
export type GameServerRecord = {
    serverId: string;
    gameId: string;
    status: GameServerStatus;
    mode?: string;
    modeConfig?: unknown;
    memberUserIds: string[];
    slotsPerServer: number;
    save: SaveConfig;
    serverState: RuntimeServerRow;
    sessionPlayers: Record<string, RuntimePlayerRow>;
    revision: number;
    tickAnchorMs: number;
    lastSavedAt?: number;
    dirtyAt?: number;
    createdAt: number;
    updatedAt: number;
};
export type PlayerProfileRecord = {
    userId: string;
    gameId: string;
    playerState: RuntimePlayerRow;
    revision: number;
    updatedAt: number;
};
export type WorldChunkRecord = {
    serverId: string;
    chunkKey: string;
    snapshot: RuntimeChunkRow;
    updatedAt: number;
};
export type LeaderboardIncrement = {
    userId: string;
    stat: string;
    scope: LeaderboardScope;
    serverId?: string;
    by: number;
};
export type LeaderboardEntry = {
    userId: string;
    value: number;
};
export declare const LEADERBOARD_PENDING_KEY = "leaderboardPending";
export declare function drainPendingLeaderboardIncrements(session: Record<string, unknown>): {
    increments: LeaderboardIncrement[];
    session: Record<string, unknown>;
};
export declare const FEED_RING_LIMIT = 20;
export declare function trimFeedEntries<T>(entries: T[], limit?: number): T[];
export declare function shouldAutoSave(save: SaveConfig, dirtyAt: number | undefined, lastSavedAt: number | undefined, now: number): boolean;
export type ServerListing = {
    serverId: string;
    status: GameServerStatus;
    memberCount: number;
    slotsPerServer: number;
    mode?: string;
    updatedAt: number;
};
export declare function toServerListing(record: GameServerRecord): ServerListing;
export type HostPersistence = {
    savePlan?: (plan: ServerPersistPlan) => Promise<void>;
    loadServer: (serverId: string) => Promise<GameServerRecord | null>;
    saveServer: (record: GameServerRecord) => Promise<void>;
    listServers: (gameId: string) => Promise<GameServerRecord[]>;
    loadProfile: (args: {
        userId: string;
        gameId: string;
    }) => Promise<PlayerProfileRecord | null>;
    saveProfile: (record: PlayerProfileRecord) => Promise<void>;
    loadChunks: (serverId: string) => Promise<WorldChunkRecord[]>;
    saveChunks: (serverId: string, chunks: WorldChunkRecord[]) => Promise<void>;
    loadFeed: (args: {
        serverId: string;
        action: string;
    }) => Promise<unknown[]>;
    appendFeed: (args: {
        serverId: string;
        action: string;
        entry: unknown;
    }) => Promise<unknown[]>;
    applyLeaderboardIncrements: (gameId: string, entries: LeaderboardIncrement[]) => Promise<void>;
    getLeaderboardTop: (args: {
        gameId: string;
        stat: string;
        scope: LeaderboardScope;
        serverId?: string;
        limit?: number;
    }) => Promise<LeaderboardEntry[]>;
    getLeaderboardProfile: (args: {
        gameId: string;
        userId: string;
    }) => Promise<Record<string, number>>;
};
export declare function buildHydratePlayers(server: GameServerRecord, profiles: Record<string, PlayerProfileRecord | null>): Record<string, RuntimePlayerRow>;
export type ServerPersistPlan = {
    server: GameServerRecord;
    profiles: PlayerProfileRecord[];
    chunks: WorldChunkRecord[];
    leaderboard: LeaderboardIncrement[];
};
export declare function planServerPersist(server: GameServerRecord, snapshot: GameRuntimeSnapshot, save: SaveConfig, now: number): ServerPersistPlan;
