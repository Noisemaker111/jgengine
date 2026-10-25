import type { SoundDef } from "@jgengine/core/audio/audioFalloff";

/**
 * Procedural cues for the defense's player-facing moments. Each id is played from the accepted
 * command, wave, or death transition that causes it; rejected input only ever plays "denied".
 * Synth patches need no asset files and stay in the forest-keep palette (stone, wood, horn, chime).
 *
 * World cues carry a wide falloff: the top-down camera sits well above the field, so the SDK's
 * default 24-unit range would silence them.
 */
const WORLD_FALLOFF = { minDistance: 8, maxDistance: 120, curve: "linear" } as const;

export const BEACON_SOUNDS: Record<string, SoundDef> = {
  // Tower chosen on the build bar: a short wooden tick.
  select: {
    id: "select",
    bus: "sfx",
    gain: 0.6,
    positional: false,
    synth: {
      voices: [{ kind: "tone", freq: 740, duration: 0.06, wave: "triangle", gain: 0.5 }],
    },
  },
  // Foundation set: a stone knock with a soft earthy tail, heard where the tower rises.
  build: {
    id: "build",
    bus: "sfx",
    gain: 0.8,
    falloff: WORLD_FALLOFF,
    synth: {
      voices: [
        { kind: "tone", freq: 120, slideTo: 70, duration: 0.22, wave: "sine", gain: 0.8 },
        { kind: "noise", duration: 0.18, filterFreq: 700, filterType: "bandpass", gain: 0.35 },
      ],
    },
  },
  // Unaffordable or unavailable press: two low square steps, distinct from the stone knock.
  denied: {
    id: "denied",
    bus: "sfx",
    gain: 0.7,
    positional: false,
    synth: {
      voices: [
        { kind: "tone", freq: 180, duration: 0.1, wave: "square", gain: 0.35 },
        { kind: "tone", freq: 130, duration: 0.14, wave: "square", gain: 0.35, delay: 0.08 },
      ],
    },
  },
  // Coins returned when a tower is sold.
  sell: {
    id: "sell",
    bus: "sfx",
    gain: 0.7,
    positional: false,
    synth: {
      voices: [
        { kind: "tone", freq: 1320, duration: 0.08, wave: "triangle", gain: 0.4 },
        { kind: "tone", freq: 1760, duration: 0.12, wave: "triangle", gain: 0.35, delay: 0.06 },
      ],
    },
  },
  // Tower raised a level: a rising two-part sweep.
  upgrade: {
    id: "upgrade",
    bus: "sfx",
    gain: 0.75,
    positional: false,
    synth: {
      voices: [
        { kind: "tone", freq: 330, slideTo: 660, duration: 0.2, wave: "sine", gain: 0.5 },
        { kind: "tone", freq: 990, duration: 0.2, wave: "triangle", gain: 0.3, delay: 0.2 },
      ],
    },
  },
  // Raiders released: a low horn bray.
  wave: {
    id: "wave",
    bus: "sfx",
    gain: 0.75,
    positional: false,
    synth: {
      voices: [
        { kind: "tone", freq: 110, duration: 0.5, wave: "sawtooth", gain: 0.4 },
        { kind: "tone", freq: 165, duration: 0.5, wave: "sawtooth", gain: 0.25 },
      ],
    },
  },
  // A raider reaches the keep and costs a life: a dull wooden knock with a low groan.
  leak: {
    id: "leak",
    bus: "sfx",
    gain: 0.85,
    falloff: WORLD_FALLOFF,
    synth: {
      voices: [
        { kind: "noise", duration: 0.3, filterFreq: 420, filterType: "lowpass", gain: 0.55 },
        { kind: "tone", freq: 90, slideTo: 55, duration: 0.3, wave: "square", gain: 0.4 },
      ],
    },
  },
  // A raider falls to tower fire: a short high pop that drops away.
  kill: {
    id: "kill",
    bus: "sfx",
    gain: 0.5,
    falloff: WORLD_FALLOFF,
    synth: {
      voices: [
        { kind: "tone", freq: 480, slideTo: 300, duration: 0.12, wave: "square", gain: 0.3 },
        { kind: "noise", duration: 0.08, filterFreq: 3000, filterType: "highpass", gain: 0.2 },
      ],
    },
  },
  // The keep falls: a descending minor figure.
  defeat: {
    id: "defeat",
    bus: "sfx",
    gain: 0.8,
    positional: false,
    synth: {
      voices: [
        { kind: "tone", freq: 330, duration: 0.2, wave: "triangle", gain: 0.5 },
        { kind: "tone", freq: 247, duration: 0.2, wave: "triangle", gain: 0.5, delay: 0.16 },
        { kind: "tone", freq: 165, duration: 0.26, wave: "triangle", gain: 0.5, delay: 0.32 },
      ],
    },
  },
  // Final wave cleared with the keep standing: a bright rising arpeggio.
  victory: {
    id: "victory",
    bus: "sfx",
    gain: 0.8,
    positional: false,
    synth: {
      voices: [
        { kind: "tone", freq: 523, duration: 0.14, wave: "triangle", gain: 0.45 },
        { kind: "tone", freq: 659, duration: 0.14, wave: "triangle", gain: 0.45, delay: 0.12 },
        { kind: "tone", freq: 784, duration: 0.14, wave: "triangle", gain: 0.45, delay: 0.24 },
        { kind: "tone", freq: 1046, duration: 0.2, wave: "triangle", gain: 0.45, delay: 0.36 },
      ],
    },
  },
};
