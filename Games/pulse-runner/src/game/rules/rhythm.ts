export type TapJudgement = "perfect" | "good" | "miss";

export interface TapWindows {
  perfectSec: number;
  goodSec: number;
}

export const DEFAULT_TAP_WINDOWS: TapWindows = { perfectSec: 0.06, goodSec: 0.14 };

export function nearestBeatDelta(nowSec: number, beatDurationSec: number): number {
  const beatIndex = Math.round(nowSec / beatDurationSec);
  return nowSec - beatIndex * beatDurationSec;
}

export function classifyTap(
  nowSec: number,
  beatDurationSec: number,
  windows: TapWindows = DEFAULT_TAP_WINDOWS,
): TapJudgement {
  const delta = Math.abs(nearestBeatDelta(nowSec, beatDurationSec));
  if (delta <= windows.perfectSec) return "perfect";
  if (delta <= windows.goodSec) return "good";
  return "miss";
}

export interface PulseState {
  value: number;
  strikes: number;
}

export const PULSE_MAX = 1;
export const PULSE_GAIN = { perfect: 0.06, good: 0.02 } as const;
export const PULSE_DRAIN = { miss: 0.12, obstacle: 0.26 } as const;
export const MERCY_RESET_VALUE = 0.35;
export const MAX_STRIKES = 3;

export function createPulseState(): PulseState {
  return { value: PULSE_MAX, strikes: 0 };
}

export function applyPulseDelta(state: PulseState, delta: number, maxStrikes = MAX_STRIKES): PulseState {
  const raw = state.value + delta;
  if (raw <= 0) {
    const strikes = state.strikes + 1;
    return { value: strikes >= maxStrikes ? 0 : MERCY_RESET_VALUE, strikes };
  }
  return { value: Math.min(PULSE_MAX, raw), strikes: state.strikes };
}

export function isDefeated(state: PulseState, maxStrikes = MAX_STRIKES): boolean {
  return state.strikes >= maxStrikes;
}

export const SPEED_MULTIPLIER_RANGE = { min: 0.55, max: 1.18 } as const;
export const STEERING_RATE_RANGE = { min: 2.2, max: 9.5 } as const;
export const RESONANCE_SPEED_BONUS = 0.15;
export const LEAN_BOOST_AMOUNT = 0.18;
export const LEAN_DECAY_PER_SEC = 0.5;

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

export function speedMultiplierForPulse(pulse: number): number {
  return lerp(SPEED_MULTIPLIER_RANGE.min, SPEED_MULTIPLIER_RANGE.max, pulse);
}

export function steeringRateForPulse(pulse: number): number {
  return lerp(STEERING_RATE_RANGE.min, STEERING_RATE_RANGE.max, pulse);
}

export function forwardSpeed(
  bpm: number,
  unitsPerBeat: number,
  pulse: number,
  leanBoost: number,
  resonance: boolean,
): number {
  const base = unitsPerBeat * (bpm / 60) * speedMultiplierForPulse(pulse) * (1 + leanBoost);
  return resonance ? base * (1 + RESONANCE_SPEED_BONUS) : base;
}

export const DOOR_OPEN_WINDOW_BEATS = 0.9;

export function isDownbeatOpen(totalBeat: number, beatsPerBar: number, windowBeats = DOOR_OPEN_WINDOW_BEATS): boolean {
  const barPhase = ((totalBeat % beatsPerBar) + beatsPerBar) % beatsPerBar;
  const distance = Math.min(barPhase, beatsPerBar - barPhase);
  return distance <= windowBeats / 2;
}

export const RESONANCE_STREAK_THRESHOLD = 8;

export function resonanceActive(perfectStreak: number, threshold = RESONANCE_STREAK_THRESHOLD): boolean {
  return perfectStreak >= threshold;
}
