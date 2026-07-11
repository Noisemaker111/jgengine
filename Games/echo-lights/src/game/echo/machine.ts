import {
  ADVANCE_DELAY_SECONDS,
  MISS_FLASH_SECONDS,
  PRESS_FLASH_SECONDS,
  REPLAY_DELAY_SECONDS,
  START_DELAY_SECONDS,
  TIER_TIMING,
  speedTier,
  type EchoMode,
  type PadIndex,
} from "./catalog";
import { sequencePads } from "./sequence";

export type EchoPhase = "idle" | "watch" | "recall" | "advance" | "replay" | "over";

export type LitKind = "play" | "press" | "miss";

export type EchoState = {
  readonly mode: EchoMode;
  readonly seed: string;
  readonly daily: boolean;
  readonly sequence: readonly PadIndex[];
  readonly phase: EchoPhase;
  readonly playIndex: number;
  readonly inputIndex: number;
  readonly litPad: PadIndex | null;
  readonly litKind: LitKind | null;
  readonly litUntil: number;
  readonly nextAt: number | null;
  readonly missPad: PadIndex | null;
  readonly completed: number;
};

export function idleState(mode: EchoMode, seed: string, daily: boolean): EchoState {
  return {
    mode,
    seed,
    daily,
    sequence: [],
    phase: "idle",
    playIndex: 0,
    inputIndex: 0,
    litPad: null,
    litKind: null,
    litUntil: 0,
    nextAt: null,
    missPad: null,
    completed: 0,
  };
}

export function startRun(mode: EchoMode, seed: string, daily: boolean, now: number): EchoState {
  return {
    mode,
    seed,
    daily,
    sequence: sequencePads(seed, 1),
    phase: "watch",
    playIndex: 0,
    inputIndex: 0,
    litPad: null,
    litKind: null,
    litUntil: 0,
    nextAt: now + START_DELAY_SECONDS,
    missPad: null,
    completed: 0,
  };
}

export function tickEcho(state: EchoState, now: number): EchoState {
  const litExpired = state.litPad !== null && now >= state.litUntil;
  const due = state.nextAt !== null && now >= state.nextAt;
  if (!litExpired && !due) return state;

  const base: EchoState = litExpired ? { ...state, litPad: null, litKind: null } : state;
  if (!due) return base;

  switch (base.phase) {
    case "watch": {
      const timing = TIER_TIMING[speedTier(base.sequence.length)];
      if (base.playIndex < base.sequence.length) {
        const pad = base.sequence[base.playIndex] as PadIndex;
        return {
          ...base,
          litPad: pad,
          litKind: "play",
          litUntil: now + timing.lit,
          playIndex: base.playIndex + 1,
          nextAt: now + timing.lit + timing.gap,
        };
      }
      return { ...base, phase: "recall", inputIndex: 0, missPad: null, nextAt: null };
    }
    case "advance":
      return {
        ...base,
        sequence: sequencePads(base.seed, base.sequence.length + 1),
        phase: "watch",
        playIndex: 0,
        inputIndex: 0,
        nextAt: now + START_DELAY_SECONDS,
      };
    case "replay":
      return { ...base, phase: "watch", playIndex: 0, inputIndex: 0, nextAt: now + START_DELAY_SECONDS };
    default:
      return { ...base, nextAt: null };
  }
}

export function pressPad(state: EchoState, pad: PadIndex, now: number): EchoState {
  if (state.phase !== "recall") return state;
  const expected = state.sequence[state.inputIndex];
  if (expected === undefined) return state;

  if (pad === expected) {
    const inputIndex = state.inputIndex + 1;
    if (inputIndex >= state.sequence.length) {
      return {
        ...state,
        litPad: pad,
        litKind: "press",
        litUntil: now + PRESS_FLASH_SECONDS,
        inputIndex,
        completed: state.sequence.length,
        phase: "advance",
        nextAt: now + ADVANCE_DELAY_SECONDS,
      };
    }
    return { ...state, litPad: pad, litKind: "press", litUntil: now + PRESS_FLASH_SECONDS, inputIndex };
  }

  if (state.mode === "practice") {
    return {
      ...state,
      litPad: pad,
      litKind: "miss",
      litUntil: now + MISS_FLASH_SECONDS,
      missPad: pad,
      phase: "replay",
      inputIndex: 0,
      nextAt: now + REPLAY_DELAY_SECONDS,
    };
  }

  return {
    ...state,
    litPad: pad,
    litKind: "miss",
    litUntil: now + MISS_FLASH_SECONDS,
    missPad: pad,
    phase: "over",
    nextAt: null,
  };
}
