import type { InputFrame } from "./inputSnapshot";

/** An input frame and the first tick it applies to. */
export interface RecordedInput {
  tick: number;
  frame: InputFrame;
}

/** Serializable recorder contents, sorted by tick. */
export interface InputRecorderState {
  frames: RecordedInput[];
}

/** Tick-indexed input log: record per tick, look up the frame in force at any tick. */
export interface InputRecorder {
  /** Store the frame in force from `tick` onward. Recording the same tick twice replaces the earlier frame. */
  record(tick: number, frame: InputFrame): void;
  /** The frame in force at `tick`: the latest recorded frame whose tick is at most `tick`, or `null` before the first. */
  frameAt(tick: number): InputFrame | null;
  frames(): readonly RecordedInput[];
  /** Highest recorded tick, or `-1` when empty. */
  lastTick(): number;
  clear(): void;
  snapshot(): InputRecorderState;
  restore(state: InputRecorderState): void;
}

function cloneFrame(frame: InputFrame): InputFrame {
  return {
    held: [...frame.held],
    pointer: frame.pointer === null ? null : { ...frame.pointer },
    ...(frame.analog === undefined ? {} : { analog: frame.analog === null ? null : { ...frame.analog } }),
    ...(frame.tick === undefined ? {} : { tick: frame.tick }),
  };
}

/**
 * Tick-indexed input log for deterministic replay: record what each tick saw, then feed {@link frameAt} back
 * into a runner stepping from a matching {@link createSimSnapshotRegistry} snapshot.
 *
 * @capability input-recorder tick-indexed input log for replay, rollback, and regression tests
 */
export function createInputRecorder(): InputRecorder {
  let frames: RecordedInput[] = [];

  function indexAtOrBefore(tick: number): number {
    let lo = 0;
    let hi = frames.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid]!.tick <= tick) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return found;
  }

  return {
    record(tick, frame) {
      const entry = { tick, frame: cloneFrame(frame) };
      const index = indexAtOrBefore(tick);
      if (index >= 0 && frames[index]!.tick === tick) {
        frames[index] = entry;
        return;
      }
      frames.splice(index + 1, 0, entry);
    },
    frameAt(tick) {
      const index = indexAtOrBefore(tick);
      return index < 0 ? null : frames[index]!.frame;
    },
    frames: () => frames,
    lastTick: () => (frames.length === 0 ? -1 : frames[frames.length - 1]!.tick),
    clear() {
      frames = [];
    },
    snapshot: () => ({ frames: frames.map((entry) => ({ tick: entry.tick, frame: cloneFrame(entry.frame) })) }),
    restore(state) {
      frames = state.frames
        .map((entry) => ({ tick: entry.tick, frame: cloneFrame(entry.frame) }))
        .sort((a, b) => a.tick - b.tick);
    },
  };
}
