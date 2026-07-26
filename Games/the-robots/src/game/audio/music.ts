import type { MusicInstrument, MusicTheme, NoteEvent } from "@jgengine/core/audio/music";

function note(beat: number, midi: number, dur: number, vel: number, inst: MusicInstrument): NoteEvent {
  return { beat, midi, dur, vel, inst };
}

function ostinato(
  pattern: readonly number[],
  bars: number,
  midi: (step: number, bar: number) => number,
  dur: number,
  vel: number,
  inst: MusicInstrument,
): NoteEvent[] {
  const out: NoteEvent[] = [];
  for (let bar = 0; bar < bars; bar += 1) {
    for (const step of pattern) out.push(note(bar * 4 + step, midi(step, bar), dur, vel, inst));
  }
  return out;
}

/**
 * Wide, slow, and mostly empty — a D-minor pad drone with a reed line that answers it every other
 * bar. Written to be ignorable: it should read as the sound of the flats, not as a track playing.
 */
const wastes: MusicTheme = {
  id: "wastes",
  bpm: 62,
  bars: 8,
  trim: 0.85,
  events: [
    ...[0, 4, 8, 12, 16, 20, 24, 28].map((beat) => note(beat, 38, 4, 0.34, "pad")),
    ...[0, 8, 16, 24].map((beat) => note(beat, 50, 8, 0.24, "pad")),
    note(2, 57, 3, 0.3, "reed"),
    note(6, 60, 2, 0.26, "reed"),
    note(13, 62, 3, 0.28, "reed"),
    note(18, 57, 4, 0.24, "reed"),
    note(26, 53, 5, 0.26, "reed"),
    note(7, 74, 1, 0.16, "tinyBell"),
    note(21, 77, 1, 0.14, "tinyBell"),
    note(30, 72, 2, 0.15, "tinyBell"),
  ],
};

/** Driving, mechanical, and short — a bass ostinato under a war drum, with brass stabs on the turn. */
const skirmish: MusicTheme = {
  id: "skirmish",
  bpm: 138,
  bars: 4,
  trim: 0.8,
  events: [
    ...ostinato([0, 0.5, 1.5, 2, 3], 4, (step, bar) => (bar % 2 === 0 ? 38 : 36) + (step >= 3 ? 3 : 0), 0.5, 0.5, "bass"),
    ...ostinato([0, 1, 2, 3], 4, () => 40, 0.4, 0.44, "warDrum"),
    ...ostinato([0.5, 1.5, 2.5, 3.5], 4, () => 44, 0.2, 0.2, "shaker"),
    note(2, 62, 1, 0.4, "brassStab"),
    note(3.5, 65, 0.5, 0.36, "brassStab"),
    note(6, 60, 1, 0.4, "brassStab"),
    note(10, 65, 1, 0.42, "brassStab"),
    note(14, 67, 2, 0.44, "brassStab"),
    ...[0, 4, 8, 12].map((beat) => note(beat, 74, 1.5, 0.22, "squareLead")),
  ],
};

/** Heavier, slower, and lower than skirmish, so a boss reads as a different kind of trouble. */
const reactor: MusicTheme = {
  id: "reactor",
  bpm: 116,
  bars: 4,
  trim: 0.85,
  events: [
    ...ostinato([0, 1.5, 2.5], 4, (_step, bar) => (bar % 2 === 0 ? 31 : 34), 0.7, 0.6, "bass"),
    ...ostinato([0, 2], 4, () => 36, 0.6, 0.5, "timpani"),
    ...[0, 4, 8, 12].map((beat) => note(beat, 55, 4, 0.32, "choir")),
    note(1, 58, 1.5, 0.4, "horn"),
    note(5, 62, 1.5, 0.42, "horn"),
    note(9, 63, 2, 0.44, "horn"),
    note(13, 58, 3, 0.4, "horn"),
    ...[3.5, 7.5, 11.5, 15.5].map((beat) => note(beat, 43, 0.4, 0.34, "brassStab")),
  ],
};

export const MUSIC_THEMES: Record<string, MusicTheme> = { wastes, skirmish, reactor };
