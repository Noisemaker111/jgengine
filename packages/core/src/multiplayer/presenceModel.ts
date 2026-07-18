export interface PresencePoseState {
  position: { x: number; y: number; z: number };
  rotationY: number;
  rotationPitch?: number;
  lastSeenAtMs?: number;
  appearance?: Record<string, string>;
}

export interface IncomingPose {
  position: { x: number; z: number; y?: number };
  rotationY?: number;
  rotationPitch?: number;
  appearance?: Record<string, string>;
}

export interface PoseSyncRules {
  /** Speed cap (units/sec) for client-authoritative movement. */
  maxSpeed: number;
  /** Vertical offset clamp above floorY (e.g. peak jump height). */
  maxVerticalOffset: number;
  /** World-floor Y used as the base of the jump band. Defaults to 0. */
  floorY?: number;
  /** Elapsed-time clamp so stale or bursty clients cannot teleport. */
  minElapsedSec: number;
  maxElapsedSec: number;
  /** Unchanged poses refresh the keep-alive stamp at most this often. */
  keepAliveRefreshMs: number;
}

/** Canonical client-authoritative pose-sync tuning shared by every host transport (WS, Convex). */
export const DEFAULT_POSE_SYNC_RULES: PoseSyncRules = {
  maxSpeed: 12,
  maxVerticalOffset: 3,
  minElapsedSec: 0.05,
  maxElapsedSec: 0.5,
  keepAliveRefreshMs: 10_000,
};

export interface PoseSyncDecision {
  position: { x: number; y: number; z: number };
  rotationY: number;
  rotationPitch: number;
  appearance?: Record<string, string>;
  /** True when the pose differs and a pose write is needed. */
  changed: boolean;
  /** True when only the keep-alive stamp should be written. */
  refreshKeepAlive: boolean;
}

function appearanceEqual(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

export const DEFAULT_SPAWN_ORIGIN = { x: 0, y: 0, z: 0 } as const;

/** @internal */
export function spawnPresenceState(
  origin: { x: number; y: number; z: number } = DEFAULT_SPAWN_ORIGIN,
  nowMs: number,
  rules: Pick<PoseSyncRules, "maxElapsedSec">,
): PresencePoseState {
  return {
    position: { x: origin.x, y: origin.y, z: origin.z },
    rotationY: 0,
    rotationPitch: 0,
    lastSeenAtMs: nowMs - rules.maxElapsedSec * 1000,
  };
}

/** @internal */
export function decidePoseSync(
  current: PresencePoseState,
  incoming: IncomingPose,
  rules: PoseSyncRules,
  nowMs: number,
  floorY?: number,
): PoseSyncDecision {
  const rawElapsedSec = Math.max(0, (nowMs - (current.lastSeenAtMs ?? nowMs)) / 1000);
  const elapsedSec = Math.min(rules.maxElapsedSec, rawElapsedSec);
  const maxDist = rules.maxSpeed * elapsedSec;
  const maxDistSq = maxDist * maxDist;

  let targetX = incoming.position.x;
  let targetZ = incoming.position.z;
  const dx = targetX - current.position.x;
  const dz = targetZ - current.position.z;
  const magSq = dx * dx + dz * dz;
  if (magSq > maxDistSq) {
    const scale = Math.sqrt(maxDistSq / magSq);
    targetX = current.position.x + dx * scale;
    targetZ = current.position.z + dz * scale;
  }

  const floor = floorY ?? rules.floorY ?? 0;
  const ceiling = floor + rules.maxVerticalOffset;
  const nextY =
    incoming.position.y === undefined
      ? current.position.y
      : Math.max(floor, Math.min(ceiling, incoming.position.y));
  const nextRotationY = incoming.rotationY ?? current.rotationY;
  const nextRotationPitch = incoming.rotationPitch ?? current.rotationPitch ?? 0;

  const nextAppearance = incoming.appearance ?? current.appearance;
  const appearanceChanged =
    incoming.appearance !== undefined && !appearanceEqual(incoming.appearance, current.appearance);

  const moved = targetX !== current.position.x || targetZ !== current.position.z;
  const jumped = nextY !== current.position.y;
  const rotated =
    nextRotationY !== current.rotationY || nextRotationPitch !== (current.rotationPitch ?? 0);
  const changed = moved || jumped || rotated || appearanceChanged;

  return {
    position: { x: targetX, y: nextY, z: targetZ },
    rotationY: nextRotationY,
    rotationPitch: nextRotationPitch,
    appearance: nextAppearance,
    changed,
    refreshKeepAlive: !changed && shouldRefreshKeepAlive(current.lastSeenAtMs, nowMs, rules),
  };
}

/** @internal */
export function shouldRefreshKeepAlive(
  lastSeenAtMs: number | undefined,
  nowMs: number,
  rules: Pick<PoseSyncRules, "keepAliveRefreshMs">,
): boolean {
  return nowMs - (lastSeenAtMs ?? 0) >= rules.keepAliveRefreshMs;
}

/** @internal */
export function shouldPersistWorldSnapshot(
  lastSavedAtMs: number | undefined,
  nowMs: number,
  intervalMs: number,
): boolean {
  return lastSavedAtMs === undefined || nowMs - lastSavedAtMs >= intervalMs;
}

export interface ActivePresenceResolution<T> {
  active: T | null;
  /** Other unrevoked rows for the same actor — a session may only have one. */
  extras: T[];
}

/** @internal */
export function resolveActivePresence<T extends { revokedAt?: number; lastSeenAt?: number }>(
  rows: readonly T[],
): ActivePresenceResolution<T> {
  const actives = rows.filter((row) => row.revokedAt === undefined);
  if (actives.length === 0) return { active: null, extras: [] };
  const sorted = [...actives].sort((a, b) => (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0));
  return { active: sorted[0] ?? null, extras: sorted.slice(1) };
}

/** @internal */
export function isPresenceExpired(
  lastSeenAtMs: number,
  nowMs: number,
  idleCutoffMs: number,
): boolean {
  return nowMs - lastSeenAtMs >= idleCutoffMs;
}

/** Most-recently-seen row across an actor's rows, to reuse instead of inserting a new one.
 * @internal
 */
export function pickReusablePresence<T extends { lastSeenAt?: number }>(
  rows: readonly T[],
): T | undefined {
  return [...rows].sort((a, b) => (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0))[0];
}
