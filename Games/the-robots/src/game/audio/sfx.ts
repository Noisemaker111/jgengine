import type { SynthPatch } from "@jgengine/core/audio/synth";

/**
 * Ferralon's procedural sound bank — pure serialisable patches the shell realises on Web Audio.
 *
 * Sustained voices (`sustain` equal to `duration`) are the ones rendered once and looped: they
 * hold full gain across the whole buffer so the loop seam is inaudible. Every looped tone
 * frequency is an integer multiple of 1/`duration` Hz so the buffer holds whole cycles.
 */
export const SFX_PATCHES: Record<string, SynthPatch> = {
  // ── Ambient beds ────────────────────────────────────────────────────────────
  // Two noise bands: a low body that carries the dust, and a thin high whistle that gives the
  // wind an edge. Gain is driven live per-tick from the gust curve, so this sits quiet by default.
  amb_wind: {
    gain: 0.9,
    voices: [
      { kind: "noise", duration: 2, sustain: 2, filterFreq: 380, gain: 0.5, decay: 1 },
      { kind: "noise", duration: 2, sustain: 2, filterFreq: 1900, gain: 0.1, decay: 1, filterType: "bandpass" },
    ],
  },
  // Far-off refinery roar the player never reaches — the sound of a world with more in it than
  // what is on screen. Non-positional, very low, and always under the wind.
  amb_industry: {
    gain: 0.5,
    voices: [
      { kind: "tone", freq: 29, duration: 4, sustain: 4, gain: 0.4, wave: "sine" },
      { kind: "tone", freq: 58, duration: 4, sustain: 4, gain: 0.14, wave: "triangle" },
      { kind: "noise", duration: 4, sustain: 4, filterFreq: 150, gain: 0.22, decay: 1 },
    ],
  },

  // ── Positional machine emitters ─────────────────────────────────────────────
  mach_hum: {
    gain: 0.8,
    voices: [
      { kind: "tone", freq: 50, duration: 2, sustain: 2, gain: 0.42, wave: "triangle" },
      { kind: "tone", freq: 100, duration: 2, sustain: 2, gain: 0.16, wave: "sine" },
      { kind: "noise", duration: 2, sustain: 2, filterFreq: 260, gain: 0.12, decay: 1 },
    ],
  },
  // A failing fixture, not a working one: mains buzz with the harmonic left ugly on purpose.
  lamp_buzz: {
    gain: 0.55,
    voices: [
      { kind: "tone", freq: 120, duration: 1, sustain: 1, gain: 0.2, wave: "sawtooth" },
      { kind: "tone", freq: 240, duration: 1, sustain: 1, gain: 0.07, wave: "square" },
    ],
  },
  elec_crackle: {
    gain: 0.5,
    voices: [
      { kind: "noise", duration: 1, sustain: 1, filterFreq: 3200, gain: 0.16, decay: 1, filterType: "bandpass" },
      { kind: "noise", duration: 1, sustain: 1, filterFreq: 620, gain: 0.08, decay: 1 },
    ],
  },
  gate_drone: {
    gain: 0.7,
    voices: [
      { kind: "tone", freq: 32, duration: 2, sustain: 2, gain: 0.5, wave: "sine" },
      { kind: "tone", freq: 48, duration: 2, sustain: 2, gain: 0.14, wave: "sawtooth" },
    ],
  },

  // ── Weapons ─────────────────────────────────────────────────────────────────
  // Ferralon guns are energy weapons: a hard noise transient for the mechanism, then a pitched
  // body sliding down fast. Family differences are body pitch, slide depth, and tail length.
  gun_pistol: {
    gain: 0.7,
    voices: [
      { kind: "noise", duration: 0.06, filterFreq: 4200, gain: 0.4, decay: 0.6, filterType: "highpass" },
      { kind: "tone", freq: 760, duration: 0.14, gain: 0.34, wave: "sawtooth", slideTo: 180 },
      { kind: "tone", freq: 210, duration: 0.1, gain: 0.16, wave: "square", slideTo: 90 },
    ],
  },
  gun_smg: {
    gain: 0.55,
    voices: [
      { kind: "noise", duration: 0.045, filterFreq: 5200, gain: 0.34, decay: 0.55, filterType: "highpass" },
      { kind: "tone", freq: 980, duration: 0.09, gain: 0.26, wave: "sawtooth", slideTo: 300 },
    ],
  },
  gun_shotgun: {
    gain: 0.85,
    voices: [
      { kind: "noise", duration: 0.28, filterFreq: 1500, gain: 0.6, decay: 0.75 },
      { kind: "noise", duration: 0.09, filterFreq: 6000, gain: 0.4, decay: 0.5, filterType: "highpass" },
      { kind: "tone", freq: 240, duration: 0.24, gain: 0.32, wave: "square", slideTo: 58 },
    ],
  },
  gun_sniper: {
    gain: 0.9,
    voices: [
      { kind: "noise", duration: 0.1, filterFreq: 3000, gain: 0.45, decay: 0.6, filterType: "highpass" },
      { kind: "tone", freq: 1400, duration: 0.3, gain: 0.34, wave: "sawtooth", slideTo: 120 },
      { kind: "tone", freq: 90, duration: 0.42, gain: 0.22, wave: "sine", slideTo: 44 },
    ],
  },
  gun_launcher: {
    gain: 0.9,
    voices: [
      { kind: "noise", duration: 0.34, filterFreq: 700, gain: 0.55, decay: 0.8 },
      { kind: "tone", freq: 180, duration: 0.3, gain: 0.36, wave: "sawtooth", slideTo: 46 },
    ],
  },
  reload_out: {
    gain: 0.6,
    voices: [
      { kind: "noise", duration: 0.09, filterFreq: 2400, gain: 0.3, decay: 0.7, filterType: "bandpass" },
      { kind: "tone", freq: 420, duration: 0.07, gain: 0.14, wave: "square", slideTo: 260 },
    ],
  },
  reload_in: {
    gain: 0.65,
    voices: [
      { kind: "noise", duration: 0.07, filterFreq: 1600, gain: 0.32, decay: 0.6 },
      { kind: "tone", freq: 300, duration: 0.09, gain: 0.18, wave: "square", slideTo: 640 },
    ],
  },

  // ── Impacts and damage ──────────────────────────────────────────────────────
  impact_metal: {
    gain: 0.7,
    voices: [
      { kind: "noise", duration: 0.13, filterFreq: 2800, gain: 0.4, decay: 0.65, filterType: "bandpass" },
      { kind: "tone", freq: 520, duration: 0.1, gain: 0.2, wave: "triangle", slideTo: 200 },
    ],
  },
  impact_crit: {
    gain: 0.85,
    voices: [
      { kind: "noise", duration: 0.16, filterFreq: 3600, gain: 0.45, decay: 0.6, filterType: "bandpass" },
      { kind: "tone", freq: 900, duration: 0.16, gain: 0.28, wave: "square", slideTo: 1500 },
      { kind: "tone", freq: 300, duration: 0.12, gain: 0.16, wave: "sawtooth", slideTo: 140 },
    ],
  },
  hurt_player: {
    gain: 0.8,
    voices: [
      { kind: "noise", duration: 0.24, filterFreq: 500, gain: 0.45, decay: 0.8 },
      { kind: "tone", freq: 170, duration: 0.2, gain: 0.3, wave: "sawtooth", slideTo: 70 },
    ],
  },
  shield_break: {
    gain: 0.8,
    voices: [
      { kind: "tone", freq: 1200, duration: 0.3, gain: 0.3, wave: "square", slideTo: 220 },
      { kind: "noise", duration: 0.3, filterFreq: 4000, gain: 0.3, decay: 0.7, filterType: "highpass" },
    ],
  },
  // A robot losing power: the servo whine falls away and the chassis hits the sand.
  enemy_die: {
    gain: 0.8,
    voices: [
      { kind: "tone", freq: 640, duration: 0.5, gain: 0.28, wave: "sawtooth", slideTo: 60 },
      { kind: "noise", duration: 0.3, filterFreq: 900, gain: 0.35, decay: 0.8, delay: 0.22 },
      { kind: "tone", freq: 90, duration: 0.24, gain: 0.3, wave: "square", slideTo: 38, delay: 0.24 },
    ],
  },
  explosion: {
    gain: 1,
    voices: [
      { kind: "noise", duration: 0.7, filterFreq: 460, gain: 0.7, decay: 0.85 },
      { kind: "noise", duration: 0.2, filterFreq: 5000, gain: 0.4, decay: 0.5, filterType: "highpass" },
      { kind: "tone", freq: 120, duration: 0.6, gain: 0.45, wave: "sawtooth", slideTo: 30 },
    ],
  },

  // ── Enemy barks ─────────────────────────────────────────────────────────────
  // Vocoder-ish chirps rather than voice: two square blips with opposite slides read as
  // "spotted you" and "come here" without a sample library.
  bark_alert: {
    gain: 0.6,
    voices: [
      { kind: "tone", freq: 420, duration: 0.1, gain: 0.26, wave: "square", slideTo: 780 },
      { kind: "tone", freq: 780, duration: 0.1, gain: 0.2, wave: "square", slideTo: 1020, delay: 0.11 },
    ],
  },
  bark_taunt: {
    gain: 0.55,
    voices: [
      { kind: "tone", freq: 300, duration: 0.14, gain: 0.24, wave: "sawtooth", slideTo: 180 },
      { kind: "tone", freq: 240, duration: 0.12, gain: 0.18, wave: "square", slideTo: 150, delay: 0.15 },
    ],
  },
  bark_idle: {
    gain: 0.4,
    voices: [{ kind: "tone", freq: 520, duration: 0.07, gain: 0.16, wave: "square", slideTo: 470 }],
  },

  // ── Movement and interaction ────────────────────────────────────────────────
  foot_a: {
    gain: 0.45,
    voices: [
      { kind: "noise", duration: 0.11, filterFreq: 900, gain: 0.32, decay: 0.7 },
      { kind: "tone", freq: 88, duration: 0.07, gain: 0.12, wave: "sine", slideTo: 54 },
    ],
  },
  foot_b: {
    gain: 0.45,
    voices: [
      { kind: "noise", duration: 0.1, filterFreq: 700, gain: 0.3, decay: 0.75 },
      { kind: "tone", freq: 74, duration: 0.07, gain: 0.12, wave: "sine", slideTo: 46 },
    ],
  },
  pickup: {
    gain: 0.6,
    voices: [
      { kind: "tone", freq: 660, duration: 0.09, gain: 0.2, wave: "sine", slideTo: 990 },
      { kind: "tone", freq: 990, duration: 0.1, gain: 0.14, wave: "sine", delay: 0.08 },
    ],
  },
  chest_open: {
    gain: 0.7,
    voices: [
      { kind: "noise", duration: 0.22, filterFreq: 1400, gain: 0.35, decay: 0.8 },
      { kind: "tone", freq: 180, duration: 0.3, gain: 0.2, wave: "triangle", slideTo: 420 },
    ],
  },
  levelup: {
    gain: 0.75,
    voices: [
      { kind: "tone", freq: 523, duration: 0.16, gain: 0.24, wave: "triangle" },
      { kind: "tone", freq: 659, duration: 0.16, gain: 0.24, wave: "triangle", delay: 0.12 },
      { kind: "tone", freq: 880, duration: 0.4, gain: 0.26, wave: "triangle", delay: 0.24 },
    ],
  },
};

/** Catalog ids the shell renders once and loops, rather than firing as one-shots. */
export const LOOP_SOUND_IDS = [
  "amb_wind",
  "amb_industry",
  "mach_hum",
  "lamp_buzz",
  "elec_crackle",
  "gate_drone",
] as const;

/** Ids that play from a world position and attenuate with listener distance. */
export const POSITIONAL_SOUND_IDS = new Set<string>([
  "mach_hum",
  "lamp_buzz",
  "elec_crackle",
  "gate_drone",
  "enemy_die",
  "bark_alert",
  "bark_taunt",
  "bark_idle",
  "impact_metal",
  "impact_crit",
  "explosion",
  "chest_open",
]);
