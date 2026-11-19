import { MAX_JUMP_OFFSET } from "@jgengine/core/movement/movementModel";
import {
  shouldPersistWorldSnapshot,
  type PoseSyncRules,
} from "@jgengine/core/multiplayer/presenceModel";

export const WORLD_POSE_RULES: PoseSyncRules = {
  maxSpeed: 16,
  maxVerticalOffset: MAX_JUMP_OFFSET,
  minElapsedSec: 0.05,
  maxElapsedSec: 1.5,
  keepAliveRefreshMs: 60_000,
};

export const WORLD_SNAPSHOT_INTERVAL_MS = 30_000;

export function shouldPersistPresenceWorldSnapshot(
  lastSavedAtMs: number | undefined,
  nowMs: number,
): boolean {
  return shouldPersistWorldSnapshot(lastSavedAtMs, nowMs, WORLD_SNAPSHOT_INTERVAL_MS);
}

export function preferredPresenceLabel(
  profile: { username?: string; displayName?: string } | null | undefined,
): string | null {
  return profile?.username?.trim() || profile?.displayName?.trim() || null;
}

export const WORLD_CHAT_CHANNEL = "global";
