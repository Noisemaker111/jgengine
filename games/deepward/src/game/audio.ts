import type { SoundDef } from "@jgengine/core/audio/audioFalloff";

/** Original synthesized cues for a small life in a big house, realized by the shared Web Audio engine. */
export const audio = {
  buses: { sfx: { id: "sfx", gain: 0.35 } },
  sounds: {
    squeeze: { id: "squeeze", bus: "sfx", synth: { voices: [{ kind: "noise", duration: 0.25, filterFreq: 900, gain: 0.6 }, { kind: "tone", freq: 420, slideTo: 300, duration: 0.18, wave: "triangle", gain: 0.4 }] } },
    deeper: { id: "deeper", bus: "sfx", synth: { voices: [{ kind: "tone", freq: 330, duration: 0.14, wave: "triangle" }, { kind: "tone", freq: 247, duration: 0.3, wave: "triangle", delay: 0.12 }] } },
    pickup: { id: "pickup", bus: "sfx", synth: { voices: [{ kind: "tone", freq: 520, slideTo: 760, duration: 0.1, wave: "triangle" }] } },
    shiny: { id: "shiny", bus: "sfx", synth: { voices: [{ kind: "tone", freq: 880, duration: 0.1 }, { kind: "tone", freq: 1320, duration: 0.18, delay: 0.08 }, { kind: "tone", freq: 1760, duration: 0.22, delay: 0.16, gain: 0.5 }] } },
    rustle: { id: "rustle", bus: "sfx", synth: { voices: [{ kind: "noise", duration: 0.18, filterFreq: 2400, gain: 0.5 }] } },
    build: { id: "build", bus: "sfx", synth: { voices: [{ kind: "noise", duration: 0.06, filterFreq: 1600 }, { kind: "noise", duration: 0.06, filterFreq: 1200, delay: 0.14 }, { kind: "tone", freq: 600, duration: 0.15, delay: 0.26, wave: "triangle" }] } },
    banked: { id: "banked", bus: "sfx", synth: { voices: [{ kind: "tone", freq: 523, duration: 0.14 }, { kind: "tone", freq: 659, duration: 0.14, delay: 0.12 }, { kind: "tone", freq: 784, duration: 0.3, delay: 0.24 }] } },
    caught: { id: "caught", bus: "sfx", synth: { voices: [{ kind: "tone", freq: 392, slideTo: 196, duration: 0.6, wave: "triangle" }] } },
    hurt: { id: "hurt", bus: "sfx", synth: { voices: [{ kind: "noise", duration: 0.12, filterFreq: 700 }, { kind: "tone", freq: 180, slideTo: 90, duration: 0.2 }] } },
    clang: { id: "clang", bus: "sfx", synth: { voices: [{ kind: "tone", freq: 1240, duration: 0.4, wave: "triangle" }, { kind: "tone", freq: 1870, duration: 0.3, wave: "triangle", gain: 0.4 }] } },
    jab: { id: "jab", bus: "sfx", synth: { voices: [{ kind: "noise", duration: 0.05, filterFreq: 4000 }] } },
    pebble: { id: "pebble", bus: "sfx", synth: { voices: [{ kind: "tone", freq: 1400, duration: 0.04 }, { kind: "tone", freq: 1100, duration: 0.04, delay: 0.3 }, { kind: "tone", freq: 900, duration: 0.04, delay: 0.5 }] } },
    click: { id: "click", bus: "sfx", synth: { voices: [{ kind: "noise", duration: 0.03, filterFreq: 3000 }, { kind: "tone", freq: 300, duration: 0.05, delay: 0.05 }] } },
    snap: { id: "snap", bus: "sfx", synth: { voices: [{ kind: "noise", duration: 0.09, filterFreq: 5000, gain: 1.2 }, { kind: "tone", freq: 140, slideTo: 60, duration: 0.15 }] } },
    wiggle: { id: "wiggle", bus: "sfx", synth: { voices: [{ kind: "noise", duration: 0.5, filterFreq: 320, gain: 0.5 }] } },
    hiss: { id: "hiss", bus: "sfx", synth: { voices: [{ kind: "noise", duration: 0.5, filterFreq: 6000, gain: 0.6 }] } },
    bark: { id: "bark", bus: "sfx", synth: { voices: [{ kind: "tone", freq: 220, slideTo: 140, duration: 0.14, wave: "square", gain: 0.5 }, { kind: "noise", duration: 0.1, filterFreq: 900, gain: 0.6 }] } },
    yelp: { id: "yelp", bus: "sfx", synth: { voices: [{ kind: "tone", freq: 700, slideTo: 1100, duration: 0.15, wave: "triangle" }] } },
    whirr: { id: "whirr", bus: "sfx", synth: { voices: [{ kind: "tone", freq: 90, slideTo: 140, duration: 0.8, wave: "sawtooth", gain: 0.25 }, { kind: "noise", duration: 0.8, filterFreq: 600, gain: 0.4 }] } },
    giggle: { id: "giggle", bus: "sfx", synth: { voices: [{ kind: "tone", freq: 600, duration: 0.07 }, { kind: "tone", freq: 720, duration: 0.07, delay: 0.1 }, { kind: "tone", freq: 640, duration: 0.07, delay: 0.2 }, { kind: "tone", freq: 780, duration: 0.1, delay: 0.3 }] } },
    dawn: { id: "dawn", bus: "sfx", synth: { voices: [{ kind: "tone", freq: 880, duration: 0.2, wave: "triangle" }, { kind: "tone", freq: 880, duration: 0.2, wave: "triangle", delay: 0.35 }, { kind: "tone", freq: 880, duration: 0.2, wave: "triangle", delay: 0.7 }] } },
    // The house at night: a fridge hum and the tick of a far clock.
    bed: { id: "bed", bus: "sfx", loop: true, positional: false, synth: { voices: [
      { kind: "tone", freq: 60, duration: 2, wave: "triangle", gain: 0.25, sustain: 2 },
      { kind: "noise", duration: 2, filterFreq: 180, gain: 0.3, sustain: 2 },
    ] } },
  } satisfies Record<string, SoundDef>,
};
