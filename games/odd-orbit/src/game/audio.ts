import type { SoundDef } from "@jgengine/core/audio/audioFalloff";

/**
 * Soft procedural cues for the household's everyday moments. Every id is played from an accepted
 * command or simulation transition (see `ctx.game.audio.play` call sites). Patches are short, sine
 * and triangle leaning, and stay under the gentle gain ceiling so the habitat reads as calm.
 */
export const ORBIT_SOUNDS: Record<string, SoundDef> = {
  // A rounded bloop as a furnishing settles onto the ground.
  place: {
    id: "place",
    bus: "sfx",
    gain: 0.7,
    synth: {
      voices: [
        { kind: "tone", freq: 523, slideTo: 659, duration: 0.18, wave: "sine", gain: 0.45 },
        { kind: "noise", duration: 0.1, filterFreq: 1400, filterType: "bandpass", gain: 0.12 },
      ],
    },
  },
  // Gentle falling pair: the household cannot afford it, or the spot is taken. Never harsh.
  denied: {
    id: "denied",
    bus: "sfx",
    positional: false,
    gain: 0.6,
    synth: {
      voices: [
        { kind: "tone", freq: 330, duration: 0.14, wave: "triangle", gain: 0.35 },
        { kind: "tone", freq: 247, duration: 0.2, wave: "triangle", gain: 0.3, delay: 0.09 },
      ],
    },
  },
  // A coin-return slide when a furnishing is sold back.
  sell: {
    id: "sell",
    bus: "sfx",
    gain: 0.6,
    synth: {
      voices: [{ kind: "tone", freq: 784, slideTo: 523, duration: 0.3, wave: "sine", gain: 0.4 }],
    },
  },
  // Two bright, soft dings for a ration purchase at the pantry.
  purchase: {
    id: "purchase",
    bus: "sfx",
    positional: false,
    gain: 0.6,
    synth: {
      voices: [
        { kind: "tone", freq: 698, duration: 0.12, wave: "sine", gain: 0.4 },
        { kind: "tone", freq: 880, duration: 0.2, wave: "triangle", gain: 0.35, delay: 0.06 },
      ],
    },
  },
  // A warm three-note rising chord when the emergency ration signal is accepted.
  relief: {
    id: "relief",
    bus: "sfx",
    positional: false,
    gain: 0.7,
    synth: {
      voices: [
        { kind: "tone", freq: 392, duration: 0.5, wave: "sine", gain: 0.35 },
        { kind: "tone", freq: 523, duration: 0.4, wave: "triangle", gain: 0.3, delay: 0.1 },
        { kind: "tone", freq: 659, duration: 0.3, wave: "sine", gain: 0.25, delay: 0.2 },
      ],
    },
  },
  // Completed shift: a small rising two-note chime.
  shift: {
    id: "shift",
    bus: "sfx",
    gain: 0.65,
    synth: {
      voices: [
        { kind: "tone", freq: 587, duration: 0.25, wave: "triangle", gain: 0.4 },
        { kind: "tone", freq: 880, duration: 0.3, wave: "sine", gain: 0.35, delay: 0.12 },
      ],
    },
  },
  // Harvest: a leafy rustle with two rising sparkles.
  harvest: {
    id: "harvest",
    bus: "sfx",
    gain: 0.6,
    synth: {
      voices: [
        { kind: "noise", duration: 0.22, filterFreq: 2200, filterType: "bandpass", gain: 0.18 },
        { kind: "tone", freq: 1047, duration: 0.2, wave: "sine", gain: 0.25, delay: 0.05 },
        { kind: "tone", freq: 1318, duration: 0.25, wave: "sine", gain: 0.2, delay: 0.12 },
      ],
    },
  },
  // Daily habitat bill settling at the day turn: a soft, low two-step tone.
  bill: {
    id: "bill",
    bus: "sfx",
    gain: 0.7,
    synth: {
      voices: [
        { kind: "tone", freq: 196, slideTo: 165, duration: 0.35, wave: "sine", gain: 0.4 },
        { kind: "tone", freq: 147, duration: 0.3, wave: "sine", gain: 0.3, delay: 0.14 },
      ],
    },
  },
  // Milestone bond between two members: a warm, slow three-note arpeggio.
  bond: {
    id: "bond",
    bus: "sfx",
    positional: false,
    gain: 0.65,
    synth: {
      voices: [
        { kind: "tone", freq: 523, duration: 0.35, wave: "sine", gain: 0.35 },
        { kind: "tone", freq: 659, duration: 0.35, wave: "sine", gain: 0.3, delay: 0.1 },
        { kind: "tone", freq: 784, duration: 0.35, wave: "triangle", gain: 0.25, delay: 0.2 },
      ],
    },
  },
};
