import { createRecordingBuffer, type RecordingBuffer } from "@jgengine/core/sensor/recordingBuffer";
import { interpolateRecordedPose } from "@jgengine/core/sensor/replayLoop";

import type { RecordStorage } from "./records";

/**
 * The ghost of your best run on a timed event, Trackmania-style: the kart's pose is recorded ten
 * times a second on the run clock, the fastest escape on each event is kept, and the next run on that
 * event replays it beside you. Recording and seeking are the engine's recording buffer; this file is
 * the sampling rate, the save format and the "metres ahead of your best" read.
 */

export interface GhostPose {
  position: readonly [number, number, number];
  rotationY: number;
}

/** One saved ghost: the time it set and its frames as compact `[t, x, y, z, heading]` rows. */
export interface SavedGhost {
  time: number;
  frames: readonly (readonly [number, number, number, number, number])[];
}

export const GHOST_KEY = "drift-foundry.ghost.v1";
const SAMPLE_SECONDS = 0.1;
/** A long stall at a wall still fits: two and a half minutes of frames at the sample rate. */
const MAX_FRAMES = 1500;

const round = (value: number): number => Math.round(value * 100) / 100;

export function readGhosts(storage?: RecordStorage): Record<string, SavedGhost> {
  try {
    const data = JSON.parse(storage?.getItem(GHOST_KEY) ?? "null") as Record<string, SavedGhost> | null;
    if (data === null || typeof data !== "object") return {};
    const clean: Record<string, SavedGhost> = {};
    for (const [id, ghost] of Object.entries(data)) {
      if (typeof ghost?.time !== "number" || !Array.isArray(ghost.frames)) continue;
      const frames = ghost.frames.filter((row) => Array.isArray(row) && row.length === 5 && row.every((n) => typeof n === "number" && Number.isFinite(n)));
      if (frames.length > 1) clean[id] = { time: ghost.time, frames };
    }
    return clean;
  } catch {
    return {};
  }
}

export function saveGhost(eventId: string, ghost: SavedGhost, storage?: RecordStorage): boolean {
  if (storage === undefined) return false;
  try {
    storage.setItem(GHOST_KEY, JSON.stringify({ ...readGhosts(storage), [eventId]: ghost }));
    return true;
  } catch {
    return false;
  }
}

/** Records the live run; `take` hands back the frames once it escapes. */
export interface GhostRecorder {
  record(t: number, pose: GhostPose): void;
  take(time: number): SavedGhost;
  reset(): void;
}

export function createGhostRecorder(): GhostRecorder {
  const buffer: RecordingBuffer<GhostPose> = createRecordingBuffer({ maxFrames: MAX_FRAMES });
  let next = 0;
  return {
    record(t, pose) {
      if (t < next) return;
      buffer.append(t, pose);
      next = t + SAMPLE_SECONDS;
    },
    take(time) {
      return {
        time: round(time),
        frames: buffer.frames().map((frame) => [round(frame.t), round(frame.data.position[0]), round(frame.data.position[1]), round(frame.data.position[2]), round(frame.data.rotationY)] as const),
      };
    },
    reset() {
      buffer.clear();
      next = 0;
    },
  };
}

/** A saved ghost played back on the run clock: its pose at `t`, or `null` once it has crossed the gate. */
export interface GhostReplay {
  time: number;
  poseAt(t: number): GhostPose | null;
}

export function replayGhost(ghost: SavedGhost): GhostReplay {
  const buffer = createRecordingBuffer<GhostPose>();
  buffer.restore(ghost.frames.map(([t, x, y, z, heading]) => ({ t, data: { position: [x, y, z] as const, rotationY: heading } })));
  const end = ghost.frames[ghost.frames.length - 1]?.[0] ?? 0;
  return {
    time: ghost.time,
    poseAt(t) {
      if (t > end) return null;
      const { before, after } = buffer.seekPair(t);
      if (before === null) return after?.data ?? null;
      if (after === null || after.t <= before.t) return before.data;
      return interpolateRecordedPose(before.data, after.data, (t - before.t) / (after.t - before.t));
    },
  };
}
