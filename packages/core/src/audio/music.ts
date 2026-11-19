/**
 * Named synthesised instrument. Each maps to a voice in the shell's instrument
 * library (`@jgengine/core/audio/musicVoices.view`); an unknown name falls back to a
 * plain sine voice so a theme is never silent.
 */
export type MusicInstrument =
  | "strings"
  | "flute"
  | "harp"
  | "horn"
  | "choir"
  | "bell"
  | "timpani"
  | "bass"
  | "stacc"
  | "pad"
  | "lute"
  | "dulcimer"
  | "frameDrum"
  | "warDrum"
  | "reed"
  | "pipe"
  | "squareLead"
  | "woodBlock"
  | "tinyBell"
  | "piano"
  | "shaker"
  | "brassStab"
  | "cymSwell"
  | "oboe";

export interface NoteEvent {
  /** Quarter-note position within the loop (0-based). */
  beat: number;
  midi: number;
  dur: number;
  /** Velocity 0..1. */
  vel: number;
  inst: MusicInstrument;
}

export interface MusicTheme {
  id: string;
  bpm: number;
  bars: number;
  events: readonly NoteEvent[];
  trim?: number;
}

/** A resolved note occurrence: the source note plus its absolute onset in seconds. */
export interface ScheduledNote {
  event: NoteEvent;
  /** Absolute onset in seconds, on the timeline of the `anchorSec`/window args. */
  when: number;
}

/** Standard equal-temperament MIDI-to-frequency (A4 = 440 Hz at MIDI 69). */
export function mtof(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Loop length of a theme in seconds. */
export function themeLoopSeconds(theme: MusicTheme): number {
  return (theme.bars * 4 * 60) / theme.bpm;
}

/**
 * Pure lookahead scheduler: every note occurrence of `theme` whose onset falls
 * in the half-open window `(fromSec, toSec]`, given the theme's loop-zero at
 * `anchorSec`. Handles any number of loop wraps, so a director calls it once per
 * tick with a non-overlapping window and never double-schedules a note.
 */
export function notesInWindow(
  theme: MusicTheme,
  anchorSec: number,
  fromSec: number,
  toSec: number,
): ScheduledNote[] {
  const loop = themeLoopSeconds(theme);
  if (loop <= 0 || toSec <= fromSec) return [];
  const spb = 60 / theme.bpm;
  const out: ScheduledNote[] = [];
  for (const event of theme.events) {
    const onset = event.beat * spb;
    let k = Math.max(0, Math.floor((fromSec - anchorSec - onset) / loop));
    for (;;) {
      const when = anchorSec + onset + k * loop;
      if (when > toSec) break;
      if (when > fromSec) out.push({ event, when });
      k += 1;
    }
  }
  return out;
}
