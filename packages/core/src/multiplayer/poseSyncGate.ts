export interface PlayerPose {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  rotationPitch: number;
  appearance?: Record<string, string>;
}

export interface PoseSyncTuning {
  minIntervalMs: number;
  heartbeatMs: number;
  positionEpsilon: number;
  verticalEpsilon: number;
  rotationEpsilon: number;
}

export interface PoseSyncGate {
  evaluate(pose: PlayerPose, nowMs: number): boolean;
}

function appearanceChanged(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  if (a === b) return false;
  if (a === undefined || b === undefined) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return true;
  return aKeys.some((key) => a[key] !== b[key]);
}

function poseChanged(a: PlayerPose, b: PlayerPose, tuning: PoseSyncTuning): boolean {
  return (
    Math.abs(a.x - b.x) > tuning.positionEpsilon
    || Math.abs(a.y - b.y) > tuning.verticalEpsilon
    || Math.abs(a.z - b.z) > tuning.positionEpsilon
    || Math.abs(a.rotationY - b.rotationY) > tuning.rotationEpsilon
    || Math.abs(a.rotationPitch - b.rotationPitch) > tuning.rotationEpsilon
    || appearanceChanged(a.appearance, b.appearance)
  );
}

export function createPoseSyncGate(tuning: PoseSyncTuning): PoseSyncGate {
  let lastSentPose: PlayerPose | null = null;
  let lastSentAt = 0;

  return {
    evaluate(pose: PlayerPose, nowMs: number): boolean {
      if (lastSentPose === null) {
        lastSentPose = pose;
        lastSentAt = nowMs;
        return true;
      }

      const changed = poseChanged(lastSentPose, pose, tuning);
      const intervalElapsed = nowMs - lastSentAt >= tuning.minIntervalMs;
      const heartbeatDue = nowMs - lastSentAt >= tuning.heartbeatMs;

      if (!changed && !heartbeatDue) return false;
      if (!intervalElapsed && !heartbeatDue) return false;

      lastSentPose = pose;
      lastSentAt = nowMs;
      return true;
    },
  };
}
