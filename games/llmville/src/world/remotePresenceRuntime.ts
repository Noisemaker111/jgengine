/**
 * Frame-readable remote presence poses. Snapshot deliveries arrive at the
 * sender's tick rate (and re-stamp every row), so the runtime buffers the last
 * two ACTUALLY-CHANGED poses per presence and renders between them; a pose
 * with no newer update decays to standing still instead of latching its last
 * walk state.
 */


export interface LiveRemotePose {
  presenceId: string;
  actorExternalId: string;
  label: string | null;
  kind: "human" | "bot";
  online: boolean;
  position: { x: number; y: number; z: number };
  rotationY: number;
  rotationPitch: number;
  /** performance.now() when the reactive query delivered this row. */
  receivedAt: number;
}

export interface RemotePoseSample {
  position: { x: number; y: number; z: number };
  rotationY: number;
  rotationPitch: number;
  /** Implied by inter-update velocity; false once updates go stale. */
  moving: boolean;
  /** Inter-update speed (world units/sec); 0 once updates go stale. */
  speedUnitsPerSec: number;
  online: boolean;
}

interface BufferedRemotePose {
  latest: LiveRemotePose;
  prev: LiveRemotePose | null;
}

const buffers = new Map<string, BufferedRemotePose>();

const POSE_EPSILON = 1e-4;
const MOVING_SPEED_THRESHOLD_UNITS_PER_SEC = 0.5;
const MIN_UPDATE_INTERVAL_MS = 30;
const MAX_UPDATE_INTERVAL_MS = 600;
const MOVING_STALENESS_GRACE_MS = 150;

function samePose(a: LiveRemotePose, b: LiveRemotePose): boolean {
  return (
    Math.abs(a.position.x - b.position.x) < POSE_EPSILON
    && Math.abs(a.position.y - b.position.y) < POSE_EPSILON
    && Math.abs(a.position.z - b.position.z) < POSE_EPSILON
    && Math.abs(a.rotationY - b.rotationY) < POSE_EPSILON
    && Math.abs(a.rotationPitch - b.rotationPitch) < POSE_EPSILON
  );
}

export function publishLiveRemotePoses(poses: readonly LiveRemotePose[]): void {
  const seen = new Set<string>();
  for (const pose of poses) {
    seen.add(pose.presenceId);
    const existing = buffers.get(pose.presenceId);
    if (existing === undefined) {
      buffers.set(pose.presenceId, { latest: pose, prev: null });
      continue;
    }
    if (samePose(existing.latest, pose)) {
      existing.latest = { ...existing.latest, label: pose.label, online: pose.online };
      continue;
    }
    buffers.set(pose.presenceId, { latest: pose, prev: existing.latest });
  }
  for (const presenceId of buffers.keys()) {
    if (!seen.has(presenceId)) buffers.delete(presenceId);
  }
}

export function readLiveRemotePose(presenceId: string): LiveRemotePose | undefined {
  return buffers.get(presenceId)?.latest;
}

function lerpShortestAngle(from: number, to: number, alpha: number): number {
  const tau = Math.PI * 2;
  const delta = ((((to - from) % tau) + tau + Math.PI) % tau) - Math.PI;
  return from + delta * alpha;
}

export function sampleRemotePose(presenceId: string, nowMs: number): RemotePoseSample | undefined {
  const buffer = buffers.get(presenceId);
  if (buffer === undefined) return undefined;
  const { latest, prev } = buffer;

  if (prev === null) {
    return {
      position: { x: latest.position.x, y: latest.position.y, z: latest.position.z },
      rotationY: latest.rotationY,
      rotationPitch: latest.rotationPitch,
      moving: false,
      speedUnitsPerSec: 0,
      online: latest.online,
    };
  }

  const interval = Math.min(
    MAX_UPDATE_INTERVAL_MS,
    Math.max(MIN_UPDATE_INTERVAL_MS, latest.receivedAt - prev.receivedAt),
  );
  const t = Math.min(1, Math.max(0, (nowMs - latest.receivedAt) / interval));

  const dx = latest.position.x - prev.position.x;
  const dz = latest.position.z - prev.position.z;
  const speedUnitsPerSec = Math.hypot(dx, dz) / (interval / 1000);
  const fresh = nowMs - latest.receivedAt <= interval + MOVING_STALENESS_GRACE_MS;

  return {
    position: {
      x: prev.position.x + dx * t,
      y: prev.position.y + (latest.position.y - prev.position.y) * t,
      z: prev.position.z + dz * t,
    },
    rotationY: lerpShortestAngle(prev.rotationY, latest.rotationY, t),
    rotationPitch: prev.rotationPitch + (latest.rotationPitch - prev.rotationPitch) * t,
    moving: fresh && speedUnitsPerSec > MOVING_SPEED_THRESHOLD_UNITS_PER_SEC,
    speedUnitsPerSec: fresh ? speedUnitsPerSec : 0,
    online: latest.online,
  };
}
