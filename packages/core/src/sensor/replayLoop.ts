import type { RecordingBuffer } from "./recordingBuffer";

export interface ReplayLoopOptions<T> {
  /** Blend between the two frames straddling the seek time; omit to hold the earlier frame. */
  interpolate?: (before: T, after: T, alpha: number) => T;
  /** Returns `null` for this long at the start of every loop pass — a spawn-grace gap so a looping ghost blinks out instead of teleporting. Default `0`. */
  spawnGraceSeconds?: number;
}

/**
 * Replays a finished `RecordingBuffer` on a loop — modulo-time seek, frame interpolation, and
 * spawn grace, the pieces every ghost-lap/echo feature hand-rolled (#286.4). `sample(t)` is a pure
 * function of absolute time; `null` means "the ghost isn't on track right now".
 */
export interface ReplayLoop<T> {
  duration(): number;
  sample(t: number): T | null;
}

export function createReplayLoop<T>(buffer: RecordingBuffer<T>, options: ReplayLoopOptions<T> = {}): ReplayLoop<T> {
  const grace = Math.max(0, options.spawnGraceSeconds ?? 0);
  const interpolate = options.interpolate;

  return {
    duration: () => buffer.duration(),
    sample(t) {
      const frames = buffer.frames();
      if (frames.length === 0) return null;
      const first = frames[0]!;
      const duration = buffer.duration();
      if (duration <= 0) return first.data;
      const local = ((t % duration) + duration) % duration;
      if (local < grace) return null;
      const seekT = first.t + local;
      const pair = buffer.seekPair(seekT);
      if (pair.before === null) return pair.after?.data ?? null;
      if (pair.after === null || interpolate === undefined) return pair.before.data;
      const span = pair.after.t - pair.before.t;
      const alpha = span <= 1e-9 ? 0 : (seekT - pair.before.t) / span;
      return interpolate(pair.before.data, pair.after.data, alpha);
    },
  };
}

export interface ReplayEntityDeps {
  has(id: string): boolean;
  spawn(id: string): void;
  setPose(id: string, pose: { position: readonly [number, number, number]; rotationY?: number; dt?: number }): unknown;
  despawn(id: string): unknown;
}

export interface RecordedPoseLike {
  position: readonly [number, number, number];
  rotationY?: number;
}

/** Linear pose blend for `ReplayLoopOptions.interpolate` — position lerp plus shortest-arc yaw. */
export function interpolateRecordedPose<T extends RecordedPoseLike>(before: T, after: T, alpha: number): T {
  let yawDelta = (after.rotationY ?? 0) - (before.rotationY ?? 0);
  while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
  while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
  return {
    ...before,
    position: [
      before.position[0] + (after.position[0] - before.position[0]) * alpha,
      before.position[1] + (after.position[1] - before.position[1]) * alpha,
      before.position[2] + (after.position[2] - before.position[2]) * alpha,
    ],
    ...(before.rotationY === undefined ? {} : { rotationY: (before.rotationY ?? 0) + yawDelta * alpha }),
  };
}

/**
 * Reconcile a replayed pose against an entity store: spawns the ghost on the first non-null sample,
 * poses it while samples flow, despawns it through grace gaps or after the recording empties.
 * `deps` matches `ctx.scene.entity` structurally — pass `{ has: (id) => ctx.scene.entity.get(id) !== null, spawn, setPose, despawn }`.
 */
export function syncReplayEntity(
  deps: ReplayEntityDeps,
  id: string,
  pose: RecordedPoseLike | null,
  dt?: number,
): void {
  if (pose === null) {
    if (deps.has(id)) deps.despawn(id);
    return;
  }
  if (!deps.has(id)) deps.spawn(id);
  deps.setPose(id, {
    position: pose.position,
    ...(pose.rotationY === undefined ? {} : { rotationY: pose.rotationY }),
    ...(dt === undefined ? {} : { dt }),
  });
}
