import type { SoundDef } from "@jgengine/core/audio/audioFalloff";

/**
 * Procedural cues for the run's physical moments. Each id is the impact kind `impactBursts` already
 * emits on an accepted simulation transition, so sound and particles can never disagree about what
 * happened. Synth patches need no asset files and stay inside the game's industrial palette.
 */
export const DRIFT_SOUNDS: Record<string, SoundDef> = {
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
