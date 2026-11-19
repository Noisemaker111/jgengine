// @skill jgengine-ui
export interface RecordingFrame<T> {
  /** Game-time seconds (from `ctx.time`), so pause/fast-forward scrub the recording consistently with the sim. */
  t: number;
  data: T;
}

export interface RecordingBufferOptions {
  maxDurationSeconds?: number;
  maxFrames?: number;
}

export interface RecordingPair<T> {
  before: RecordingFrame<T> | null;
  after: RecordingFrame<T> | null;
}

export interface RecordingBuffer<T> {
  append(t: number, data: T): void;
  seek(t: number): RecordingFrame<T> | null;
  seekPair(t: number): RecordingPair<T>;
  range(fromT: number, toT: number): RecordingFrame<T>[];
  clear(): void;
  duration(): number;
  frames(): readonly RecordingFrame<T>[];
  /** Copies the frame list; each frame's `data` is shared, since the buffer never mutates it. */
  snapshot(): RecordingFrame<T>[];
  restore(next: readonly RecordingFrame<T>[]): void;
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

/** @internal */
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
    snapshot() {
      return frames.map((frame) => ({ t: frame.t, data: frame.data }));
    },
    restore(next) {
      frames.length = 0;
      for (const frame of next) frames.push({ t: frame.t, data: frame.data });
    },
  };
}
