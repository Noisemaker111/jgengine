import type { MusicInstrument, MusicTheme, NoteEvent } from "@jgengine/core/audio/music";
import { seededRng } from "@jgengine/core/random/rng";

type Chord = readonly [offset: number, quality: "m" | "M"];

interface SongSpec {
  id: string;
  bpm: number;
  /** MIDI note of the key's root in the bass octave (45 = A2). */
  root: number;
  /** One chord per bar, cycled. */
  chords: readonly Chord[];
  drums: "four" | "half" | "brushes";
  bass: "eighths" | "offbeat" | "walk";
  lead: MusicInstrument;
  pad: MusicInstrument;
  arp?: MusicInstrument;
  /** Brass hits on the turnaround. */
  stabs?: boolean;
  /** Melody density 0..1: the chance an eighth gets a note. */
  busy: number;
  trim: number;
}

const BARS = 16;
const MINOR_PENT = [0, 3, 5, 7, 10];
const MAJOR_PENT = [0, 2, 4, 7, 9];

const note = (beat: number, midi: number, dur: number, vel: number, inst: MusicInstrument): NoteEvent => ({ beat, midi, dur, vel, inst });

function triad(root: number, quality: "m" | "M"): number[] {
  return [root, root + (quality === "m" ? 3 : 4), root + 7];
}

/**
 * A generated radio song: drums, bass, a held pad, an optional arpeggio and a seeded pentatonic lead
 * whose two-bar motif comes back varied every four bars, over a one-chord-per-bar progression. Same
 * spec, same song, every time.
 */
function song(spec: SongSpec): MusicTheme {
  const rng = seededRng(spec.id);
  const events: NoteEvent[] = [];
  const minorKey = spec.chords[0]![1] === "m";
  const scale = minorKey ? MINOR_PENT : MAJOR_PENT;
  for (let bar = 0; bar < BARS; bar++) {
    const at = bar * 4;
    const [offset, quality] = spec.chords[bar % spec.chords.length]!;
    const chordRoot = spec.root + offset;
    const tones = triad(chordRoot, quality);
    const fill = bar % 4 === 3;

    if (spec.drums === "four") {
      for (let b = 0; b < 4; b++) events.push(note(at + b, 40, 0.4, b === 0 ? 0.5 : 0.42, "warDrum"));
      events.push(note(at + 1, 52, 0.3, 0.34, "frameDrum"), note(at + 3, 52, 0.3, fill ? 0.42 : 0.34, "frameDrum"));
      for (let e = 0; e < 8; e++) events.push(note(at + e * 0.5, 44, 0.15, e % 2 === 1 ? 0.2 : 0.1, "shaker"));
    } else if (spec.drums === "half") {
      events.push(note(at, 40, 0.5, 0.48, "warDrum"), note(at + 2.5, 40, 0.4, 0.32, "warDrum"), note(at + 2, 52, 0.3, 0.38, "frameDrum"));
      for (let e = 0; e < 8; e++) events.push(note(at + e * 0.5, 44, 0.15, e % 2 === 0 ? 0.14 : 0.09, "shaker"));
    } else {
      for (let b = 0; b < 4; b++) events.push(note(at + b, 44, 0.3, b % 2 === 1 ? 0.18 : 0.1, "shaker"), note(at + b + 0.66, 44, 0.2, 0.07, "shaker"));
      events.push(note(at + 1, 70, 0.2, 0.12, "woodBlock"), note(at + 3, 70, 0.2, 0.12, "woodBlock"));
    }
    if (bar % 8 === 0) events.push(note(at, 81, 3, 0.12, "cymSwell"));

    if (spec.bass === "eighths") {
      for (let e = 0; e < 8; e++) events.push(note(at + e * 0.5, chordRoot + (e === 7 && fill ? 7 : 0), 0.4, e % 2 === 0 ? 0.42 : 0.3, "bass"));
    } else if (spec.bass === "offbeat") {
      for (let b = 0; b < 4; b++) events.push(note(at + b + 0.5, chordRoot + (b === 3 ? 12 : 0), 0.4, 0.38, "bass"));
      events.push(note(at, chordRoot, 0.5, 0.4, "bass"));
    } else {
      [0, 7, 12, 7].forEach((step, b) => events.push(note(at + b, chordRoot + step, 0.9, 0.36, "bass")));
    }

    for (const tone of tones) events.push(note(at, tone + 12, 4, 0.16, spec.pad));

    if (spec.arp !== undefined) {
      const arp = [tones[0]! + 24, tones[1]! + 24, tones[2]! + 24, tones[1]! + 24];
      for (let s = 0; s < 8; s++) events.push(note(at + s * 0.5, arp[s % 4]!, 0.4, 0.1, spec.arp));
    }

    if (spec.stabs === true && fill) {
      events.push(note(at + 3, tones[0]! + 24, 0.4, 0.34, "brassStab"), note(at + 3.5, tones[2]! + 24, 0.4, 0.34, "brassStab"));
    }
  }

  // The lead: one two-bar motif, played, answered a step higher, played again, then resolved home.
  const motif: { beat: number; degree: number; dur: number }[] = [];
  let degree = 2;
  for (let e = 0; e < 16; e++) {
    if (rng() > spec.busy) continue;
    degree = Math.max(0, Math.min(7, degree + Math.floor(rng() * 5) - 2));
    const dur = rng() < 0.3 ? 1 : 0.5;
    motif.push({ beat: e * 0.5, degree, dur });
  }
  if (motif.length === 0) motif.push({ beat: 0, degree: 2, dur: 1 });
  const pitch = (deg: number) => spec.root + 24 + scale[deg % scale.length]! + 12 * Math.floor(deg / scale.length);
  for (let phrase = 0; phrase < BARS / 2; phrase++) {
    const start = phrase * 8;
    const lift = phrase % 4 === 1 ? 1 : phrase % 4 === 3 ? -1 : 0;
    const rest = phrase % 4 === 3;
    for (const step of motif) {
      if (rest && step.beat >= 6) continue;
      events.push(note(start + step.beat, pitch(Math.max(0, step.degree + lift)), step.dur, 0.3, spec.lead));
    }
    if (rest) events.push(note(start + 6, spec.root + 24, 2, 0.3, spec.lead));
  }
  return { id: spec.id, bpm: spec.bpm, bars: BARS, events, trim: spec.trim };
}

function bed(id: string, bpm: number, root: number, kind: "talk" | "news"): MusicTheme {
  const events: NoteEvent[] = [];
  for (let bar = 0; bar < 8; bar++) {
    const at = bar * 4;
    const chord = triad(root + [0, 5, 3, 7][bar % 4]!, kind === "news" ? "m" : "M");
    for (const tone of chord) events.push(note(at, tone + 12, 4, 0.12, "pad"));
    if (kind === "news") {
      for (let e = 0; e < 8; e++) events.push(note(at + e * 0.5, root, 0.3, e % 2 === 0 ? 0.2 : 0.12, "stacc"));
      if (bar % 2 === 0) events.push(note(at, root + 36, 1, 0.1, "bell"));
    } else {
      events.push(note(at + 1, 72, 0.2, 0.07, "woodBlock"), note(at + 3, 72, 0.2, 0.07, "woodBlock"));
    }
  }
  return { id, bpm, bars: 8, events, trim: 0.32 };
}

/** Neon Tide 94.7's playlist plus the beds under the talk and news stations, as `audio.music` themes. */
export const RADIO_THEMES: Record<string, MusicTheme> = Object.fromEntries(
  [
    song({ id: "song.neon_tidewater", bpm: 104, root: 45, chords: [[0, "m"], [-4, "M"], [3, "M"], [-2, "M"]], drums: "four", bass: "eighths", lead: "squareLead", pad: "pad", arp: "piano", busy: 0.55, trim: 0.75 }),
    song({ id: "song.palm_heights", bpm: 86, root: 38, chords: [[0, "m"], [-4, "M"], [3, "M"], [-2, "M"]], drums: "half", bass: "walk", lead: "bell", pad: "strings", busy: 0.4, trim: 0.8 }),
    song({ id: "song.marina_sunrise", bpm: 118, root: 40, chords: [[0, "M"], [-3, "m"], [5, "M"], [7, "M"]], drums: "four", bass: "offbeat", lead: "flute", pad: "pad", arp: "bell", busy: 0.5, trim: 0.75 }),
    song({ id: "song.canal_row_chase", bpm: 132, root: 42, chords: [[0, "m"], [-4, "M"], [3, "M"], [-2, "M"]], drums: "four", bass: "eighths", lead: "squareLead", pad: "strings", arp: "piano", stabs: true, busy: 0.65, trim: 0.7 }),
    song({ id: "song.ocean_drive", bpm: 72, root: 36, chords: [[0, "M"], [-3, "m"], [2, "m"], [-5, "M"]], drums: "brushes", bass: "walk", lead: "piano", pad: "pad", busy: 0.45, trim: 0.85 }),
    bed("bed.tide", 100, 45, "talk"),
    bed("bed.harbor_talk", 90, 41, "talk"),
    bed("bed.mnn", 120, 38, "news"),
  ].map((theme) => [theme.id, theme]),
);
