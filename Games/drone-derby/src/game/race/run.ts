import {
  finishRaceSession,
  startRaceCountdown,
  tickRaceSession,
  type RaceEvent,
  type RacePhase,
  type RaceSessionState,
} from "@jgengine/core/game/race";

import { COURSES, type CourseId } from "./courses";

export type RunPhase = "menu" | "countdown" | "flying" | "finished" | "dnf";
export type Medal = "gold" | "silver" | "bronze" | "none";
export type DnfReason = "battery" | "time";

export interface Telemetry {
  position: readonly [number, number, number];
  heading: number;
  speed: number;
  altitude: number;
  batteryCells: number;
  drawRate: number;
  rangeMeters: number;
  windVector: readonly [number, number];
  windSpeed: number;
  gustActive: boolean;
  charging: boolean;
  chargingPadId: string | null;
  chargeFraction: number;
  nearestPadId: string | null;
  nearestPadDistance: number | null;
}

const NEUTRAL_TELEMETRY: Telemetry = {
  position: [0, 0, 0],
  heading: 0,
  speed: 0,
  altitude: 0,
  batteryCells: 100,
  drawRate: 0,
  rangeMeters: 0,
  windVector: [0, 0],
  windSpeed: 0,
  gustActive: false,
  charging: false,
  chargingPadId: null,
  chargeFraction: 0,
  nearestPadId: null,
  nearestPadDistance: null,
};

export interface RunState {
  phase: RunPhase;
  courseId: CourseId;
  attempts: number;
  countdown: number;
  elapsed: number;
  ringIndex: number;
  ringTotal: number;
  medal: Medal;
  finishTime: number | null;
  dnfReason: DnfReason | null;
  dnfPosition: readonly [number, number, number] | null;
  cellsUsed: number;
  telemetry: Telemetry;
}

function runPhaseToSession(phase: RunPhase): RacePhase {
  return phase === "menu" ? "idle" : phase === "countdown" ? "countdown" : phase === "flying" ? "racing" : "finished";
}

function toSession(state: RunState): RaceSessionState {
  return { phase: runPhaseToSession(state.phase), countdown: state.countdown, elapsed: state.elapsed };
}

export function initialRunState(courseId: CourseId = "short"): RunState {
  return {
    phase: "menu",
    courseId,
    attempts: 0,
    countdown: startRaceCountdown().countdown,
    elapsed: 0,
    ringIndex: 0,
    ringTotal: COURSES[courseId].ringIds.length,
    medal: "none",
    finishTime: null,
    dnfReason: null,
    dnfPosition: null,
    cellsUsed: 0,
    telemetry: NEUTRAL_TELEMETRY,
  };
}

export function selectCourse(courseId: CourseId): RunState {
  return initialRunState(courseId);
}

export function beginCountdown(state: RunState): RunState {
  const session = startRaceCountdown();
  return { ...initialRunState(state.courseId), phase: "countdown", countdown: session.countdown, attempts: state.attempts + 1 };
}

export function beginCountdownForCourse(state: RunState, courseId: CourseId): RunState {
  const attempts = state.courseId === courseId ? state.attempts + 1 : 1;
  const session = startRaceCountdown();
  return { ...initialRunState(courseId), phase: "countdown", countdown: session.countdown, attempts };
}

export function tickCountdown(state: RunState, dt: number): RunState {
  if (state.phase !== "countdown") return state;
  const session = tickRaceSession(toSession(state), dt);
  return session.phase === "racing" ? { ...state, phase: "flying", countdown: 0 } : { ...state, countdown: session.countdown };
}

export function tickFlying(state: RunState, dt: number): RunState {
  if (state.phase !== "flying") return state;
  return { ...state, elapsed: tickRaceSession(toSession(state), dt).elapsed };
}

export function applyRingEvents(state: RunState, events: readonly RaceEvent[]): RunState {
  let next = state;
  for (const event of events) {
    if (event.type === "checkpoint.hit") {
      next = { ...next, ringIndex: Math.min(next.ringTotal, event.checkpoint + 1) };
    }
  }
  return next;
}

export function withTelemetry(state: RunState, telemetry: Telemetry): RunState {
  return { ...state, telemetry };
}

export interface CourseParTimes {
  parGold: number;
  parSilver: number;
  parBronze: number;
}

export function assignMedal(time: number, course: CourseParTimes): Medal {
  if (time <= course.parGold) return "gold";
  if (time <= course.parSilver) return "silver";
  if (time <= course.parBronze) return "bronze";
  return "none";
}

export function finishRun(state: RunState, cellsUsed: number): RunState {
  if (state.phase !== "flying") return state;
  const session = finishRaceSession(toSession(state));
  const course = COURSES[state.courseId];
  const medal = assignMedal(session.elapsed, course);
  return { ...state, phase: "finished", elapsed: session.elapsed, finishTime: session.elapsed, medal, cellsUsed };
}

export function crashDnf(
  state: RunState,
  reason: DnfReason,
  position: readonly [number, number, number],
  cellsUsed: number,
): RunState {
  if (state.phase !== "flying") return state;
  return { ...state, phase: "dnf", dnfReason: reason, dnfPosition: position, cellsUsed };
}

export interface RunStore {
  getState(): RunState;
  subscribe(listener: () => void): () => void;
  setState(updater: (state: RunState) => RunState): void;
}

export function createRunStore(courseId: CourseId = "short"): RunStore {
  let state = initialRunState(courseId);
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

export function formatRaceTime(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped - minutes * 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}
