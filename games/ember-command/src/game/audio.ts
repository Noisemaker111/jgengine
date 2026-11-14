import type { SoundDef } from "@jgengine/core/audio/audioFalloff";

/**
 * Procedural cues for the backyard: soil tamped down, chitin clicks, the black ants' drumming, the
 * sprinkler's hiss, the mower's roar, rain, the beam's sizzle, and a summer-noon insect drone.
 * Every id here is played from a real accepted action or outcome in the game source; the audio test
 * fails if a `play`/`loop` id has no entry. No asset files: the patches are synthesised on Web Audio.
 */
export const LAWN_SOUNDS: Record<string, SoundDef> = {
  // A chamber is marked out: a dull soil thump with a short chitin click over it.
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
  // A dug chamber opens: a heavy soil thump, a grit burst, a bright click.
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
  // A hatchling crawls out of the nest: a short buzzing chirp under a fifth.
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
  // Mandibles or acid land: a bright grit transient over a short falling pitch.
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
  // An ant falls or a chamber caves in: a sagging tone under a gritty tail.
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
  // Black-ant drumming: two heavy gaster thumps as a wave musters (ants really do drum).
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
  // The Marshal's Ground Slam: a low rolling boom with a crack of noise.
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
  // Rally Scent: a rising buzz over a quick wingbeat snap.
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
  // Acid Barrage: three tight acid spits in a row.
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
  // Chitin Ward: a smothered hiss as the column hunkers into its armour.
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
  // The black nest dug out: a rising three-note fanfare.
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
  // The red nest falls: a descending three-note toll.
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
  // Retained, non-positional summer drone under the battle: a warm low hum, a high cicada shimmer and
  // the breeze in the grass.
  bed: {
    id: "bed",
    bus: "sfx",
    loop: true,
    positional: false,
    gain: 0.28,
    synth: {
      voices: [
        { kind: "tone", freq: 98, duration: 3, wave: "sine", gain: 0.35, sustain: 3 },
        { kind: "tone", freq: 3520, duration: 3, wave: "triangle", gain: 0.025, sustain: 3 },
        { kind: "noise", duration: 3, filterFreq: 5200, filterType: "bandpass", gain: 0.05, sustain: 3 },
        { kind: "noise", duration: 3, filterFreq: 420, filterType: "lowpass", gain: 0.12, sustain: 3 },
      ],
    },
  },
  // The sprinkler wakes: a pressurised hiss with a stuttering tick.
  sprinkler: {
    id: "sprinkler",
    bus: "sfx",
    positional: false,
    gain: 0.6,
    synth: {
      voices: [
        { kind: "noise", duration: 0.55, filterFreq: 4200, filterType: "highpass", gain: 0.35 },
        { kind: "tone", freq: 900, duration: 0.05, wave: "square", gain: 0.12, delay: 0.1 },
        { kind: "tone", freq: 900, duration: 0.05, wave: "square", gain: 0.12, delay: 0.3 },
        { kind: "tone", freq: 900, duration: 0.05, wave: "square", gain: 0.12, delay: 0.5 },
      ],
    },
  },
  // The lawnmower coughs into life: a sawtooth engine roar swelling under a grinding rumble.
  mower: {
    id: "mower",
    bus: "sfx",
    positional: false,
    gain: 0.85,
    synth: {
      voices: [
        { kind: "tone", freq: 55, slideTo: 92, duration: 0.58, wave: "sawtooth", gain: 0.45 },
        { kind: "tone", freq: 110, slideTo: 184, duration: 0.5, wave: "square", gain: 0.12, delay: 0.05 },
        { kind: "noise", duration: 0.55, filterFreq: 300, filterType: "lowpass", gain: 0.4 },
      ],
    },
  },
  // A rain storm rolls in: a wide wash of noise with a far thunder thump.
  rain: {
    id: "rain",
    bus: "sfx",
    positional: false,
    gain: 0.6,
    synth: {
      voices: [
        { kind: "noise", duration: 0.55, filterFreq: 2400, filterType: "bandpass", gain: 0.35 },
        { kind: "tone", freq: 48, slideTo: 32, duration: 0.4, wave: "sine", gain: 0.5, delay: 0.15 },
      ],
    },
  },
  // The lens focuses: a rising sizzle like fat in a pan.
  sizzle: {
    id: "sizzle",
    bus: "sfx",
    positional: false,
    gain: 0.7,
    synth: {
      voices: [
        { kind: "noise", duration: 0.55, filterFreq: 6000, filterType: "highpass", gain: 0.4 },
        { kind: "tone", freq: 1400, slideTo: 2600, duration: 0.5, wave: "sine", gain: 0.08 },
      ],
    },
  },
  // A pheromone line is laid: a soft rising chime, like a scent you can hear.
  scent: {
    id: "scent",
    bus: "sfx",
    gain: 0.55,
    synth: {
      voices: [
        { kind: "tone", freq: 660, slideTo: 990, duration: 0.3, wave: "sine", gain: 0.25 },
        { kind: "tone", freq: 1320, duration: 0.25, wave: "triangle", gain: 0.1, delay: 0.08 },
      ],
    },
  },
};
