export interface PresencePoseState {
    position: {
        x: number;
        y: number;
        z: number;
    };
    rotationY: number;
    rotationPitch?: number;
    lastSeenAtMs?: number;
}
export interface IncomingPose {
    position: {
        x: number;
        z: number;
        y?: number;
    };
    rotationY?: number;
    rotationPitch?: number;
}
export interface PoseSyncRules {
    /** Speed cap (units/sec) for client-authoritative movement. */
    maxSpeed: number;
    /** Vertical offset clamp (e.g. peak jump height). */
    maxVerticalOffset: number;
    /** Elapsed-time clamp so stale or bursty clients cannot teleport. */
    minElapsedSec: number;
    maxElapsedSec: number;
    /** Unchanged poses refresh the keep-alive stamp at most this often. */
    keepAliveRefreshMs: number;
}
export interface PoseSyncDecision {
    position: {
        x: number;
        y: number;
        z: number;
    };
    rotationY: number;
    rotationPitch: number;
    /** True when the pose differs and a pose write is needed. */
    changed: boolean;
    /** True when only the keep-alive stamp should be written. */
    refreshKeepAlive: boolean;
}
export declare function decidePoseSync(current: PresencePoseState, incoming: IncomingPose, rules: PoseSyncRules, nowMs: number): PoseSyncDecision;
export declare function shouldRefreshKeepAlive(lastSeenAtMs: number | undefined, nowMs: number, rules: Pick<PoseSyncRules, "keepAliveRefreshMs">): boolean;
export declare function shouldPersistWorldSnapshot(lastSavedAtMs: number | undefined, nowMs: number, intervalMs: number): boolean;
export interface ActivePresenceResolution<T> {
    active: T | null;
    /** Other unrevoked rows for the same actor — a session may only have one. */
    extras: T[];
}
export declare function resolveActivePresence<T extends {
    revokedAt?: number;
    lastSeenAt?: number;
}>(rows: readonly T[]): ActivePresenceResolution<T>;
export declare function isPresenceExpired(lastSeenAtMs: number, nowMs: number, idleCutoffMs: number): boolean;
/** Most-recently-seen row across an actor's rows, to reuse instead of inserting a new one. */
export declare function pickReusablePresence<T extends {
    lastSeenAt?: number;
}>(rows: readonly T[]): T | undefined;
