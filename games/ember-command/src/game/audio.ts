import type { SoundDef } from "@jgengine/core/audio/audioFalloff";

/**
 * Procedural cues for the skirmish: stone set down, copper bells, war drums, and a low hall drone.
 * Every id here is played from a real accepted action or outcome in the game source; the audio test
 * fails if a `play`/`loop` id has no entry. No asset files: the patches are synthesised on Web Audio.
 */
export const EMBER_SOUNDS: Record<string, SoundDef> = {
  // Stone block set on the ground: a dull knock with a short copper ring over it.
  place: {
    id: "place",
    bus: "sfx",
    gain: 0.7,
    synth: {
      voices: [
        { kind: "noise", duration: 0.22, filterFreq: 480, filterType: "lowpass", gain: 0.6 },
        { kind: "tone", freq: 330, duration: 0.28, wave: "triangle", gain: 0.25, delay: 0.03 },
      ],
    },
  },
  // Raised building settles and rings: a heavy triangle thump, a grit burst, a high copper note.
  raise: {
    id: "raise",
    bus: "sfx",
    gain: 0.75,
    synth: {
      voices: [
        { kind: "tone", freq: 147, slideTo: 98, duration: 0.42, wave: "triangle", gain: 0.6 },
        { kind: "noise", duration: 0.18, filterFreq: 1200, filterType: "bandpass", gain: 0.25, delay: 0.02 },
        { kind: "tone", freq: 880, duration: 0.34, wave: "sine", gain: 0.18, delay: 0.14 },
      ],
    },
  },
  // A recruit steps out of the keep: a short brass-like horn blat under a fifth.
  muster: {
    id: "muster",
    bus: "sfx",
    gain: 0.6,
    synth: {
      voices: [
        { kind: "tone", freq: 220, duration: 0.38, wave: "sawtooth", gain: 0.3 },
        { kind: "tone", freq: 330, duration: 0.36, wave: "sawtooth", gain: 0.2, delay: 0.05 },
      ],
    },
  },
  // Order refused with a message: two low square-wave knocks, stepping down. Named `ui.deny` so the
  // engine notice feed plays it for every deny notice.
  "ui.deny": {
    id: "ui.deny",
    bus: "sfx",
    positional: false,
    gain: 0.7,
    synth: {
      voices: [
        { kind: "tone", freq: 110, duration: 0.14, wave: "square", gain: 0.3 },
        { kind: "tone", freq: 98, duration: 0.2, wave: "square", gain: 0.3, delay: 0.09 },
      ],
    },
  },
  // Blade or arrow lands: a bright grit transient over a short falling pitch.
  hit: {
    id: "hit",
    bus: "sfx",
    gain: 0.55,
    maxVoices: 4,
    synth: {
      voices: [
        { kind: "noise", duration: 0.12, filterFreq: 1800, filterType: "bandpass", gain: 0.45 },
        { kind: "tone", freq: 180, slideTo: 90, duration: 0.1, wave: "triangle", gain: 0.35 },
      ],
    },
  },
  // A unit falls or a building is razed: a sagging tone under a gritty tail.
  fall: {
    id: "fall",
    bus: "sfx",
    gain: 0.7,
    maxVoices: 4,
    synth: {
      voices: [
        { kind: "tone", freq: 130, slideTo: 45, duration: 0.48, wave: "sawtooth", gain: 0.3 },
        { kind: "noise", duration: 0.4, filterFreq: 700, filterType: "lowpass", gain: 0.3, delay: 0.02 },
      ],
    },
  },
  // Marauder war drum: two heavy strikes on the Warcamp's position as a wave musters.
  wave: {
    id: "wave",
    bus: "sfx",
    gain: 0.85,
    synth: {
      voices: [
        { kind: "tone", freq: 60, slideTo: 40, duration: 0.3, wave: "sine", gain: 0.8 },
        { kind: "tone", freq: 60, slideTo: 40, duration: 0.3, wave: "sine", gain: 0.6, delay: 0.28 },
      ],
    },
  },
  // Bram's Thunder Clap: a low rolling boom with a crack of noise.
  thunder: {
    id: "thunder",
    bus: "sfx",
    gain: 0.85,
    synth: {
      voices: [
        { kind: "noise", duration: 0.55, filterFreq: 260, filterType: "lowpass", gain: 0.8 },
        { kind: "tone", freq: 70, slideTo: 35, duration: 0.5, wave: "sine", gain: 0.7 },
      ],
    },
  },
  // Banner Muster: a rising Vanguard horn over a cloth snap.
  banner: {
    id: "banner",
    bus: "sfx",
    gain: 0.7,
    synth: {
      voices: [
        { kind: "tone", freq: 196, slideTo: 294, duration: 0.45, wave: "sawtooth", gain: 0.22 },
        { kind: "noise", duration: 0.2, filterFreq: 2600, filterType: "bandpass", gain: 0.2, delay: 0.04 },
      ],
    },
  },
  // Ember Volley: three tight rifle cracks in a row.
  volley: {
    id: "volley",
    bus: "sfx",
    gain: 0.75,
    synth: {
      voices: [
        { kind: "noise", duration: 0.1, filterFreq: 2400, filterType: "bandpass", gain: 0.5 },
        { kind: "noise", duration: 0.1, filterFreq: 2000, filterType: "bandpass", gain: 0.4, delay: 0.09 },
        { kind: "noise", duration: 0.12, filterFreq: 1700, filterType: "bandpass", gain: 0.35, delay: 0.18 },
      ],
    },
  },
  // Ash Ward: a smothered hiss of ember smoke settling over the line.
  ward: {
    id: "ward",
    bus: "sfx",
    gain: 0.6,
    synth: {
      voices: [
        { kind: "noise", duration: 0.5, filterFreq: 900, filterType: "lowpass", gain: 0.35 },
        { kind: "tone", freq: 220, slideTo: 165, duration: 0.42, wave: "sine", gain: 0.2, delay: 0.05 },
      ],
    },
  },
  // Warcamp razed: a rising three-note copper fanfare.
  victory: {
    id: "victory",
    bus: "sfx",
    positional: false,
    gain: 0.8,
    synth: {
      voices: [
        { kind: "tone", freq: 262, duration: 0.2, wave: "triangle", gain: 0.5 },
        { kind: "tone", freq: 330, duration: 0.2, wave: "triangle", gain: 0.45, delay: 0.1 },
        { kind: "tone", freq: 392, duration: 0.35, wave: "triangle", gain: 0.45, delay: 0.2 },
      ],
    },
  },
  // Keep falls: a descending three-note toll.
  defeat: {
    id: "defeat",
    bus: "sfx",
    positional: false,
    gain: 0.8,
    synth: {
      voices: [
        { kind: "tone", freq: 196, duration: 0.22, wave: "triangle", gain: 0.5 },
        { kind: "tone", freq: 165, duration: 0.22, wave: "triangle", gain: 0.45, delay: 0.18 },
        { kind: "tone", freq: 110, duration: 0.22, wave: "triangle", gain: 0.45, delay: 0.36 },
      ],
    },
  },
  // Retained, non-positional hall drone under the battle: a low flat hum and stone-wind hiss.
  bed: {
    id: "bed",
    bus: "sfx",
    loop: true,
    positional: false,
    gain: 0.3,
    synth: {
      voices: [
        { kind: "tone", freq: 55, duration: 3, wave: "sine", gain: 0.5, sustain: 3 },
        { kind: "tone", freq: 82.5, duration: 3, wave: "triangle", gain: 0.12, sustain: 3 },
        { kind: "noise", duration: 3, filterFreq: 320, filterType: "lowpass", gain: 0.15, sustain: 3 },
      ],
    },
  },
};
