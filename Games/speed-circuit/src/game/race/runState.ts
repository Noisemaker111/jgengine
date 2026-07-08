import type { RaceEvent } from "@jgengine/core/game/race";

export type RacePhase = "countdown" | "racing" | "finished";

export interface RunState {
  phase: RacePhase;
  countdown: number;
  lap: number;
  laps: number;
  currentLapTime: number;
  bestLapTime: number | null;
  lastLapTime: number | null;
  totalTime: number;
  offTrack: boolean;
  speedKmh: number;
}

export const COUNTDOWN_SECONDS = 3;

export function initialRunState(laps: number): RunState {
  return {
    phase: "countdown",
    countdown: COUNTDOWN_SECONDS,
    lap: 1,
    laps,
    currentLapTime: 0,
    bestLapTime: null,
    lastLapTime: null,
    totalTime: 0,
    offTrack: false,
    speedKmh: 0,
  };
}

export function tickCountdown(state: RunState, dt: number): RunState {
  if (state.phase !== "countdown") return state;
  const countdown = state.countdown - dt;
  return countdown <= 0 ? { ...state, phase: "racing", countdown: 0 } : { ...state, countdown };
}

export function tickRace(state: RunState, dt: number, speedKmh: number, offTrack: boolean): RunState {
  if (state.phase !== "racing") return { ...state, speedKmh, offTrack };
  return { ...state, currentLapTime: state.currentLapTime + dt, totalTime: state.totalTime + dt, speedKmh, offTrack };
}

export function applyRaceEvent(state: RunState, event: RaceEvent): RunState {
  if (event.type === "lap.completed") {
    const lapTime = state.currentLapTime;
    const bestLapTime = state.bestLapTime === null || lapTime < state.bestLapTime ? lapTime : state.bestLapTime;
    return { ...state, lap: Math.min(state.laps, event.lap + 1), currentLapTime: 0, lastLapTime: lapTime, bestLapTime };
  }
  if (event.type === "race.finished") {
    return { ...state, phase: "finished" };
  }
  return state;
}

export function formatRaceTime(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped - minutes * 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}

export interface RunStore {
  getState(): RunState;
  subscribe(listener: () => void): () => void;
  setState(updater: (state: RunState) => RunState): void;
}

export function createRunStore(laps: number): RunStore {
  let state = initialRunState(laps);
  const listeners = new Set<() => void>();
  return {
    getState() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setState(updater) {
      state = updater(state);
      for (const listener of listeners) listener();
    },
  };
}
