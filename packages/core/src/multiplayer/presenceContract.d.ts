export interface PresencePosition {
    x: number;
    y: number;
    z: number;
}
export interface PresencePose {
    position: {
        x: number;
        y?: number;
        z: number;
    };
    rotationY?: number;
    rotationPitch?: number;
    externalId?: string;
}
export interface PresenceSession<TGameId extends string = string> {
    homeGameId: TGameId;
    externalId: string;
}
export interface EnsurePresenceArgs<TGameId extends string = string> {
    gameId: TGameId;
    externalId: string;
}
export interface EnsurePresenceResult {
    presenceId: string;
    position: PresencePosition;
    rotationY: number;
}
export interface LeavePresenceArgs<TGameId extends string = string> {
    gameId: TGameId;
    externalId: string;
}
export interface PresenceFeeds<TRow, TLocation> {
    myPresenceLocation: TLocation | null | undefined;
    onlinePresences: readonly TRow[] | undefined;
    dormantPresences: readonly TRow[] | undefined;
}
export interface PresenceActions<TGameId extends string = string> {
    ensurePresence(args: EnsurePresenceArgs<TGameId>): Promise<EnsurePresenceResult | null>;
    leavePresence(args: LeavePresenceArgs<TGameId>): Promise<{
        left: boolean;
    }>;
    syncPose(pose: PresencePose): void;
}
/**
 * Backend seam for multiplayer presence. Feeds are reactive data and change
 * identity whenever any player's pose updates; actions MUST be identity-stable
 * for the lifetime of a mounted session so join/leave lifecycle effects can
 * depend on them without re-running per pose tick. The use* members are called
 * as React hooks by consumers, so a mounted transport must never change
 * identity — remount the subtree to switch backends.
 */
export interface PresenceTransport<TRow, TLocation, TGameId extends string = string> {
    useFeeds(session: PresenceSession<TGameId> | "skip"): PresenceFeeds<TRow, TLocation>;
    useActions(): PresenceActions<TGameId>;
}
export declare function createLocalPresenceTransport<TRow, TLocation, TGameId extends string = string>(): {
    transport: PresenceTransport<TRow, TLocation, TGameId>;
    actions: PresenceActions<TGameId>;
};
