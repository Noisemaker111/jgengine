import type { SynthPatch } from "@jgengine/core/audio/synth";

/**
 * Vice Isle driving sound bank (#1051) — pure serialisable synth patches the shell realises on Web
 * Audio (and renders offline for the retained loops). `engine_loop` and `tire_squeal` are the two
 * live loops driven per-tick via `ctx.game.audio.setLoop` (rate = rpm, gain = throttle / slip); the
 * rest are one-shots fired on gear changes and impacts. Kept small and genre-agnostic in flavour.
 */
export const SFX_PATCHES: Record<string, SynthPatch> = {
  // Retained loop: a low sawtooth rumble + harmonic, pitched by rpm via playbackRate.
  engine_loop: {
    voices: [
      { kind: "tone", freq: 68, duration: 0.5, gain: 0.5, wave: "sawtooth" },
      { kind: "tone", freq: 136, duration: 0.5, gain: 0.22, wave: "square" },
      { kind: "noise", duration: 0.5, filterFreq: 220, gain: 0.12, decay: 1 },
    ],
  },
  // Retained loop: filtered noise squeal, held at gain 0 until the tyres actually break away.
  tire_squeal: {
    voices: [
      { kind: "noise", duration: 0.4, filterFreq: 2600, gain: 0.5, decay: 1, filterType: "bandpass" },
      { kind: "tone", freq: 1200, duration: 0.4, gain: 0.16, wave: "sawtooth", slideTo: 1020 },
    ],
  },
  crash_soft: {
    voices: [
      { kind: "noise", duration: 0.25, filterFreq: 420, gain: 0.5, decay: 0.85 },
      { kind: "tone", freq: 92, duration: 0.18, gain: 0.3, wave: "square", slideTo: 52 },
    ],
  },
  crash_hard: {
    voices: [
      { kind: "noise", duration: 0.5, filterFreq: 300, gain: 0.7, decay: 0.85 },
      { kind: "noise", duration: 0.35, filterFreq: 2700, gain: 0.4, decay: 0.55, filterType: "highpass" },
      { kind: "tone", freq: 72, duration: 0.42, gain: 0.4, wave: "sawtooth", slideTo: 40 },
    ],
  },
  prop_thunk: {
    voices: [
      { kind: "noise", duration: 0.18, filterFreq: 720, gain: 0.4, decay: 0.7 },
      { kind: "tone", freq: 150, duration: 0.12, gain: 0.2, wave: "triangle", slideTo: 90 },
    ],
  },
  ped_thump: {
    voices: [
      { kind: "noise", duration: 0.2, filterFreq: 300, gain: 0.4, decay: 0.8 },
      { kind: "tone", freq: 70, duration: 0.14, gain: 0.24, wave: "square", slideTo: 46 },
    ],
  },
  shift_click: {
    voices: [{ kind: "tone", freq: 1500, duration: 0.05, gain: 0.09, wave: "square" }],
  },
};

/** Ids the shell realises as retained, pitch/gain-controlled loops rather than one-shots. */
export const LOOP_SOUND_IDS = ["engine_loop", "tire_squeal"] as const;
