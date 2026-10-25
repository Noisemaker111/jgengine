import type { MusicInstrument, MusicTheme, NoteEvent } from "./music";
import type { MusicTier } from "./musicState";

/**
 * Soundtrack that follows the fight: the shell raises an intensity when the local player deals or
 * takes damage and lets it decay, and the tier ladder picks the theme. `true` uses the built-in
 * explore / tension / fight themes; an object swaps in the game's own tiers and themes.
 */
export interface AdaptiveMusicConfig {
  /** Tier ladder over intensity `0..1`. Default {@link DEFAULT_ADAPTIVE_TIERS}. */
  tiers?: readonly MusicTier[];
  /** Intensity must fall this far below a tier to leave it. Default 0.2. */
  release?: number;
  /** Intensity lost per second of quiet. Default 0.1. */
  decayPerSecond?: number;
  /** Intensity added when the local player lands a hit. Default 0.18. */
  onHit?: number;
  /** Intensity added when the local player is hit. Default 0.3. */
  onHurt?: number;
  /** Intensity added when the local player kills. Default 0.15, on top of the hit. */
  onKill?: number;
}

function note(beat: number, midi: number, dur: number, vel: number, inst: MusicInstrument): NoteEvent {
  return { beat, midi, dur, vel, inst };
}

function every(step: number, beats: number, make: (beat: number, index: number) => NoteEvent): NoteEvent[] {
  const out: NoteEvent[] = [];
  for (let beat = 0, index = 0; beat < beats; beat += step, index++) out.push(make(beat, index));
  return out;
}

/** Slow and open: an A-minor pad under a sparse flute, quiet enough to sit under exploring. */
const explore: MusicTheme = {
  id: "jg.explore",
  bpm: 68,
  bars: 8,
  trim: 0.8,
  events: [
    ...every(8, 32, (beat, i) => note(beat, [45, 41, 43, 40][i % 4]!, 8, 0.3, "pad")),
    ...every(8, 32, (beat, i) => note(beat, [57, 53, 55, 52][i % 4]!, 8, 0.2, "strings")),
    note(2, 69, 2, 0.24, "flute"),
    note(5, 72, 3, 0.22, "flute"),
    note(13, 71, 2, 0.22, "flute"),
    note(20, 67, 3, 0.2, "flute"),
    note(27, 64, 4, 0.2, "flute"),
    note(10, 81, 1, 0.12, "tinyBell"),
    note(30, 76, 1, 0.12, "tinyBell"),
  ],
};

/** Something is near: a pulsing low string ostinato and a held horn, no drums yet. */
const tension: MusicTheme = {
  id: "jg.tension",
  bpm: 96,
  bars: 4,
  trim: 0.8,
  events: [
    ...every(0.5, 16, (beat, i) => note(beat, (Math.floor(i / 8) % 2 === 0 ? 45 : 46), 0.4, i % 2 === 0 ? 0.34 : 0.22, "stacc")),
    ...every(4, 16, (beat, i) => note(beat, [57, 58, 57, 55][i % 4]!, 4, 0.22, "strings")),
    note(0, 64, 6, 0.24, "horn"),
    note(8, 65, 6, 0.24, "horn"),
    ...every(4, 16, (beat) => note(beat + 3, 33, 1, 0.3, "timpani")),
  ],
};

/** The fight: war drums and a driving bass, brass stabs on the turnaround. */
const fight: MusicTheme = {
  id: "jg.fight",
  bpm: 132,
  bars: 4,
  trim: 0.78,
  events: [
    ...every(0.5, 16, (beat, i) => note(beat, (Math.floor(i / 8) % 2 === 0 ? 33 : 31) + (i % 4 === 3 ? 7 : 0), 0.4, 0.46, "bass")),
    ...every(1, 16, (beat, i) => note(beat, 40, 0.4, i % 2 === 0 ? 0.5 : 0.36, "warDrum")),
    ...every(0.5, 16, (beat) => note(beat + 0.25, 44, 0.2, 0.16, "shaker")),
    note(3, 69, 0.5, 0.4, "brassStab"),
    note(3.5, 72, 0.5, 0.38, "brassStab"),
    note(7, 67, 1, 0.4, "brassStab"),
    note(11, 69, 0.5, 0.42, "brassStab"),
    note(11.5, 74, 0.5, 0.4, "brassStab"),
    note(15, 76, 1, 0.44, "brassStab"),
    note(0, 81, 3, 0.16, "cymSwell"),
  ],
};

/** The built-in adaptive themes, keyed by id. */
export const ADAPTIVE_THEMES: Readonly<Record<string, MusicTheme>> = { [explore.id]: explore, [tension.id]: tension, [fight.id]: fight };

/** Explore below 0.25, tension from 0.25, fight from 0.6 and held at least 6 s once it starts. */
export const DEFAULT_ADAPTIVE_TIERS: readonly MusicTier[] = [
  { id: "explore", theme: explore.id, enter: 0 },
  { id: "tension", theme: tension.id, enter: 0.25, holdMs: 3000 },
  { id: "fight", theme: fight.id, enter: 0.6, holdMs: 6000 },
];

/** A `0..1` combat intensity that jumps on events and decays linearly over quiet time. */
export interface CombatIntensity {
  bump(amount: number, nowMs: number): void;
  read(nowMs: number): number;
  /** The level and when it was last settled, for save/load and tests. */
  snapshot(): CombatIntensityState;
  /** Put a snapshot back. */
  restore(next: CombatIntensityState): void;
}

/** A saved combat intensity: its level (0..1) and the clock time it was read at. */
export interface CombatIntensityState {
  value: number;
  atMs: number;
}

/** A fresh intensity at 0 that loses `decayPerSecond` per second of quiet. */
export function createCombatIntensity(decayPerSecond = 0.1): CombatIntensity {
  let value = 0;
  let at = 0;
  const settle = (nowMs: number) => {
    value = Math.max(0, value - (Math.max(0, nowMs - at) / 1000) * decayPerSecond);
    at = nowMs;
  };
  return {
    bump(amount, nowMs) {
      settle(nowMs);
      value = Math.min(1, value + amount);
    },
    read(nowMs) {
      settle(nowMs);
      return value;
    },
    snapshot: () => ({ value, atMs: at }),
    restore(next) {
      value = Math.min(1, Math.max(0, next.value));
      at = next.atMs;
    },
  };
}
