import type { RecordingFrame } from "@jgengine/core/sensor/recordingBuffer";

import type { GhostFrameData } from "./types";

export interface PaceReading {
  status: "ahead" | "behind" | "even" | "unknown";
  deltaSeconds: number;
}

function nearestFrameByS(frames: readonly RecordingFrame<GhostFrameData>[], s: number): RecordingFrame<GhostFrameData> | null {
  if (frames.length === 0) return null;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid]!.data.s < s) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0) {
    const prev = frames[lo - 1]!;
    const curr = frames[lo]!;
    if (Math.abs(prev.data.s - s) <= Math.abs(curr.data.s - s)) return prev;
  }
  return frames[lo]!;
}

const EVEN_TOLERANCE = 0.05;

export function paceDelta(
  previousLapFrames: readonly RecordingFrame<GhostFrameData>[] | null,
  currentElapsed: number,
  currentS: number,
): PaceReading {
  if (previousLapFrames === null || previousLapFrames.length === 0) {
    return { status: "unknown", deltaSeconds: 0 };
  }
  const match = nearestFrameByS(previousLapFrames, currentS);
  if (match === null) return { status: "unknown", deltaSeconds: 0 };
  const deltaSeconds = match.t - currentElapsed;
  if (Math.abs(deltaSeconds) <= EVEN_TOLERANCE) return { status: "even", deltaSeconds };
  return { status: deltaSeconds > 0 ? "ahead" : "behind", deltaSeconds };
}
