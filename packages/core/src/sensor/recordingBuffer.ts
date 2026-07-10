export interface RecordingFrame<T> {
  /** Game-time seconds (from `ctx.time`), so pause/fast-forward scrub the recording consistently with the sim. */
  t: number;
  data: T;
}

export interface RecordingBufferOptions {
  /** Evict frames older than `latestT - maxDurationSeconds`. Default unlimited. */
  maxDurationSeconds?: number;
  /** Hard cap on frame count, oldest evicted first. Default unlimited. */
  maxFrames?: number;
}

export interface RecordingPair<T> {
  before: RecordingFrame<T> | null;
  after: RecordingFrame<T> | null;
}

export interface RecordingBuffer<T> {
  append(t: number, data: T): void;
  /** Nearest frame at or before `t`, or null if the buffer is empty or `t` precedes every frame. */
  seek(t: number): RecordingFrame<T> | null;
  /** The frames bracketing `t` for interpolated playback: `before` is `seek(t)`, `after` is the next recorded frame (null past the end). */
  seekPair(t: number): RecordingPair<T>;
  /** Frames with `fromT <= t <= toT`, in recorded order. */
  range(fromT: number, toT: number): RecordingFrame<T>[];
  clear(): void;
  duration(): number;
  frames(): readonly RecordingFrame<T>[];
}

function evict<T>(frames: RecordingFrame<T>[], options: RecordingBufferOptions): void {
  if (options.maxDurationSeconds !== undefined && frames.length > 0) {
    const cutoff = frames[frames.length - 1]!.t - options.maxDurationSeconds;
    let dropTo = 0;
    while (dropTo < frames.length && frames[dropTo]!.t < cutoff) dropTo += 1;
    if (dropTo > 0) frames.splice(0, dropTo);
  }
  if (options.maxFrames !== undefined && frames.length > options.maxFrames) {
    frames.splice(0, frames.length - options.maxFrames);
  }
}

/**
 * A session-recording buffer for replay / photo mode / kill-cam: append
 * timestamped snapshots (poses, camera state, whatever `T` is) on game-time,
 * then seek/scrub the recording independent of the live sim. Frames are
 * expected in non-decreasing `t` order (one push per tick); `seek`/`range`
 * binary-search on that assumption.
 */
export function createRecordingBuffer<T>(options: RecordingBufferOptions = {}): RecordingBuffer<T> {
  const frames: RecordingFrame<T>[] = [];

  function floorIndex(t: number): number {
    let lo = 0;
    let hi = frames.length - 1;
    let result = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid]!.t <= t) {
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return result;
  }

  return {
    append(t, data) {
      frames.push({ t, data });
      evict(frames, options);
    },
    seek(t) {
      const index = floorIndex(t);
      return index === -1 ? null : frames[index]!;
    },
    seekPair(t) {
      const index = floorIndex(t);
      return {
        before: index === -1 ? null : frames[index]!,
        after: frames[index + 1] ?? null,
      };
    },
    range(fromT, toT) {
      return frames.filter((frame) => frame.t >= fromT && frame.t <= toT);
    },
    clear() {
      frames.length = 0;
    },
    duration() {
      return frames.length === 0 ? 0 : frames[frames.length - 1]!.t - frames[0]!.t;
    },
    frames() {
      return frames;
    },
  };
}
