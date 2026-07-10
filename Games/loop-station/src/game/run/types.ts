import type { RaceState } from "@jgengine/core/game/race";
import type { RecordingBuffer, RecordingFrame } from "@jgengine/core/sensor/recordingBuffer";

import type { LaneChoice } from "../track/geometry";

export interface GhostFrameData {
  x: number;
  y: number;
  z: number;
  headingRad: number;
  s: number;
}

export interface GhostRecord {
  id: string;
  lapIndex: number;
  color: string;
  startTime: number;
  lapDuration: number;
  buffer: RecordingBuffer<GhostFrameData>;
  faded: boolean;
}

export interface LapRecord {
  lapIndex: number;
  duration: number;
  laneA: LaneChoice;
  laneB: LaneChoice;
}

export type RunPhase = "start" | "running" | "ended";

export interface DeathInfo {
  reason: "ghost" | "gate";
  ghostLap: number | null;
}

export interface RunInputState {
  throttleUp: boolean;
  throttleDown: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  brake: boolean;
  jumpHop: boolean;
  restart: boolean;
  start: boolean;
}

export interface RunState {
  phase: RunPhase;
  seed: string;
  d: number;
  paceMultiplier: number;
  lateral: number;
  laneA: LaneChoice;
  laneB: LaneChoice;
  forkADecided: boolean;
  forkBDecided: boolean;
  jumpWindowActive: boolean;
  jumpedThisPass: boolean;
  lapIndex: number;
  lapStartTime: number;
  now: number;
  liveRecorder: RecordingBuffer<GhostFrameData>;
  previousLapFrames: readonly RecordingFrame<GhostFrameData>[] | null;
  previousLapDuration: number | null;
  ghosts: GhostRecord[];
  tape: LapRecord[];
  best: number | null;
  bestLapsSurvived: number;
  death: DeathInfo | null;
  position: GhostFrameData;
  prevInput: RunInputState;
  race: RaceState;
}

export interface RunEvent {
  type: "lap.completed" | "ghost.faded" | "death";
  lapIndex?: number;
  duration?: number;
  ghostLap?: number | null;
  reason?: "ghost" | "gate";
}

export const RUN_STORE_KEY = "run";

export const GHOST_CAP = 12;
export const GHOST_SPAWN_GRACE_SECONDS = 1.5;
export const STEER_RATE = 1.8;
export const PACE_RATE = 0.5;
export const PACE_MIN = 0.55;
export const PACE_MAX = 1.6;
export const BRAKE_MULT = 0.45;
export const JUMP_WINDOW_PAD = 3;

export const NEUTRAL_INPUT: RunInputState = {
  throttleUp: false,
  throttleDown: false,
  steerLeft: false,
  steerRight: false,
  brake: false,
  jumpHop: false,
  restart: false,
  start: false,
};
