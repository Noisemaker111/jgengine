import type { SoundDef } from "@jgengine/core/audio/audioFalloff";

/**
 * Procedural cues for the run's physical moments. Each id is the impact kind `impactBursts` already
 * emits on an accepted simulation transition, so sound and particles can never disagree about what
 * happened. Synth patches need no asset files and stay inside the game's industrial palette.
 */
export const DRIFT_SOUNDS: Record<string, SoundDef> = {
  // A shelf grab: the price-scanner beep, two quick bright tones.
  grab: {
    id: "grab",
    bus: "sfx",
    gain: 0.55,
    synth: {
      voices: [
        { kind: "tone", freq: 1320, duration: 0.07, wave: "square", gain: 0.5 },
        { kind: "tone", freq: 1760, duration: 0.09, wave: "square", gain: 0.4, delay: 0.08 },
      ],
    },
  },
  // A power-up fired: a rising whoosh with a hiss.
  power: {
    id: "power",
    bus: "sfx",
    gain: 0.75,
    synth: {
      voices: [
        { kind: "tone", freq: 220, slideTo: 880, duration: 0.35, wave: "sawtooth", gain: 0.45 },
        { kind: "noise", duration: 0.4, filterFreq: 2400, filterType: "highpass", gain: 0.35 },
      ],
    },
  },
  // A style trick banked: a small register "cha-ching".
  trick: {
    id: "trick",
    bus: "sfx",
    gain: 0.5,
    synth: {
      voices: [
        { kind: "tone", freq: 988, duration: 0.08, wave: "triangle", gain: 0.5 },
        { kind: "tone", freq: 1319, duration: 0.18, wave: "triangle", gain: 0.45, delay: 0.07 },
      ],
    },
  },
  // Dense metal-on-dirt thud: the plow pushing through a crushed-car wall.
  plow: {
    id: "plow",
    bus: "sfx",
    gain: 0.9,
    synth: {
      voices: [
        { kind: "tone", freq: 92, slideTo: 46, duration: 0.42, wave: "triangle", gain: 0.9 },
        { kind: "noise", duration: 0.34, filterFreq: 620, filterType: "lowpass", gain: 0.55 },
      ],
    },
  },
  // Suspension landing: a short low bump with a dirt scrape tail.
  landing: {
    id: "landing",
    bus: "sfx",
    gain: 0.7,
    synth: {
      voices: [
        { kind: "tone", freq: 110, slideTo: 60, duration: 0.2, wave: "sine", gain: 0.8 },
        { kind: "noise", duration: 0.22, filterFreq: 900, filterType: "bandpass", gain: 0.35 },
      ],
    },
  },
  // Gate contact that refuses to give: a short clank, two steps of pitch so it reads as rejected.
  blocked: {
    id: "blocked",
    bus: "sfx",
    gain: 0.8,
    synth: {
      voices: [
        { kind: "tone", freq: 220, duration: 0.12, wave: "square", gain: 0.45 },
        { kind: "tone", freq: 165, duration: 0.18, wave: "square", gain: 0.4, delay: 0.07 },
      ],
    },
  },
  // Armor save fires: bright two-note chime that says "you survived the clip".
  armor: {
    id: "armor",
    bus: "sfx",
    gain: 0.85,
    synth: {
      voices: [
        { kind: "tone", freq: 660, duration: 0.22, wave: "triangle", gain: 0.5 },
        { kind: "tone", freq: 990, duration: 0.34, wave: "triangle", gain: 0.45, delay: 0.09 },
      ],
    },
  },
};
