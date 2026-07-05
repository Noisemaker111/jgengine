export type LeaderboardScope = "global" | "server" | "profile";
export interface LeaderboardTrackDef {
    stat?: string;
    currency?: string;
    scope: LeaderboardScope;
}
export interface LeaderboardRow {
    stat: string;
    scope: LeaderboardScope;
    serverId?: string;
    userId: string;
    value: number;
}
export type IncrementResult = {
    status: "ok";
    value: number;
} | {
    status: "rejected";
    reason: "not-tracked";
};
export interface Leaderboard {
    track(def: LeaderboardTrackDef): void;
    tracked(): {
        stat: string;
        scope: LeaderboardScope;
    }[];
    increment(userId: string, stat: string, options: {
        scope: LeaderboardScope;
        serverId?: string;
        by?: number;
    }): IncrementResult;
    getTop(stat: string, options: {
        scope: LeaderboardScope;
        limit?: number;
        serverId?: string;
    }): {
        userId: string;
        value: number;
    }[];
    getProfile(userId: string): Record<string, number>;
    snapshot(): LeaderboardRow[];
    hydrate(rows: LeaderboardRow[]): void;
}
export declare function createLeaderboard(sink?: {
    onIncrement?(row: LeaderboardRow): void;
}): Leaderboard;
