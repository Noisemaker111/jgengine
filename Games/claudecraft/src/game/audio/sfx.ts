import type { SynthPatch } from "@jgengine/core/audio/synth";

export const SFX_PATCHES: Record<string, SynthPatch> = {
  melee_hit: {
    voices: [
      { kind: "noise", duration: 0.12, filterFreq: 900, gain: 0.3 },
      { kind: "tone", freq: 130, duration: 0.08, gain: 0.16, wave: "triangle" },
    ],
  },
  melee_crit: {
    voices: [
      { kind: "noise", duration: 0.12, filterFreq: 900, gain: 0.5 },
      { kind: "tone", freq: 130, duration: 0.08, gain: 0.3, wave: "triangle" },
      { kind: "noise", duration: 0.2, filterFreq: 2400, gain: 0.2, decay: 0.6, filterType: "highpass" },
    ],
  },
  melee_miss: {
    voices: [{ kind: "noise", duration: 0.16, filterFreq: 1800, gain: 0.12, decay: 0.8, filterType: "bandpass" }],
  },
  hit_taken: {
    voices: [
      { kind: "noise", duration: 0.1, filterFreq: 500, gain: 0.25 },
      { kind: "tone", freq: 80, duration: 0.1, gain: 0.2, wave: "square" },
    ],
  },
  fire: {
    voices: [
      { kind: "noise", duration: 0.45, filterFreq: 700, gain: 0.32, decay: 0.8 },
      { kind: "tone", freq: 160, duration: 0.35, gain: 0.2, wave: "sawtooth", slideTo: 60 },
    ],
  },
  frost: {
    voices: [
      { kind: "noise", duration: 0.35, filterFreq: 4500, gain: 0.18, decay: 0.7, filterType: "highpass" },
      { kind: "tone", freq: 1300, duration: 0.3, gain: 0.12, slideTo: 700 },
      { kind: "tone", freq: 1750, duration: 0.25, gain: 0.08, delay: 0.04, slideTo: 900 },
    ],
  },
  arcane: {
    voices: [
      { kind: "tone", freq: 620, duration: 0.22, gain: 0.14, slideTo: 850 },
      { kind: "tone", freq: 930, duration: 0.22, gain: 0.1, delay: 0.05, slideTo: 1240 },
    ],
  },
  cast_start: {
    voices: [{ kind: "tone", freq: 300, duration: 0.2, gain: 0.06, slideTo: 420 }],
  },
  level_up: {
    voices: [
      { kind: "tone", freq: 392, duration: 0.5, gain: 0.18, wave: "triangle" },
      { kind: "tone", freq: 523, duration: 0.5, gain: 0.18, wave: "triangle", delay: 0.09 },
      { kind: "tone", freq: 659, duration: 0.5, gain: 0.18, wave: "triangle", delay: 0.18 },
      { kind: "tone", freq: 784, duration: 0.5, gain: 0.18, wave: "triangle", delay: 0.27 },
      { kind: "tone", freq: 1046, duration: 0.5, gain: 0.18, wave: "triangle", delay: 0.36 },
      { kind: "noise", duration: 0.8, filterFreq: 5000, gain: 0.06, decay: 0.95, filterType: "highpass" },
    ],
  },
  quest_accept: {
    voices: [
      { kind: "tone", freq: 660, duration: 0.18, gain: 0.14, wave: "triangle" },
      { kind: "tone", freq: 880, duration: 0.25, gain: 0.14, wave: "triangle", delay: 0.1 },
    ],
  },
  ready_check: {
    voices: [
      { kind: "tone", freq: 784, duration: 0.16, gain: 0.16, wave: "triangle" },
      { kind: "tone", freq: 988, duration: 0.16, gain: 0.16, wave: "triangle", delay: 0.12 },
      { kind: "tone", freq: 1319, duration: 0.28, gain: 0.16, wave: "triangle", delay: 0.24 },
    ],
  },
  quest_done: {
    voices: [
      { kind: "tone", freq: 523, duration: 0.35, gain: 0.16, wave: "triangle" },
      { kind: "tone", freq: 659, duration: 0.35, gain: 0.16, wave: "triangle", delay: 0.12 },
      { kind: "tone", freq: 784, duration: 0.35, gain: 0.16, wave: "triangle", delay: 0.24 },
    ],
  },
  coin: {
    voices: [
      { kind: "tone", freq: 2200, duration: 0.1, gain: 0.12, wave: "square" },
      { kind: "tone", freq: 2800, duration: 0.14, gain: 0.1, wave: "square", delay: 0.05 },
    ],
  },
  loot_item: {
    voices: [{ kind: "noise", duration: 0.12, filterFreq: 1200, gain: 0.14, decay: 0.8, filterType: "bandpass" }],
  },
  death: {
    voices: [
      { kind: "tone", freq: 220, duration: 1.4, gain: 0.22, wave: "sawtooth", slideTo: 55 },
      { kind: "noise", duration: 1.2, filterFreq: 300, gain: 0.18, decay: 0.95 },
    ],
  },
  aggro: {
    voices: [
      { kind: "tone", freq: 140, duration: 0.3, gain: 0.14, wave: "sawtooth", slideTo: 90 },
      { kind: "noise", duration: 0.25, filterFreq: 600, gain: 0.12, decay: 0.8 },
    ],
  },
  drink: {
    voices: [
      { kind: "tone", freq: 460, duration: 0.12, gain: 0.08, slideTo: 280 },
      { kind: "tone", freq: 460, duration: 0.12, gain: 0.08, delay: 0.25, slideTo: 280 },
      { kind: "tone", freq: 460, duration: 0.12, gain: 0.08, delay: 0.5, slideTo: 280 },
    ],
  },
  eat: {
    voices: [
      { kind: "noise", duration: 0.1, filterFreq: 800, gain: 0.1, decay: 0.8, filterType: "bandpass" },
      { kind: "noise", duration: 0.1, filterFreq: 800, gain: 0.1, decay: 0.8, filterType: "bandpass", delay: 0.3 },
    ],
  },
  click: {
    voices: [{ kind: "tone", freq: 1400, duration: 0.05, gain: 0.08, wave: "square" }],
  },
  error: {
    voices: [{ kind: "tone", freq: 220, duration: 0.15, gain: 0.1, wave: "square", slideTo: 180 }],
  },
  sheep: {
    voices: [{ kind: "tone", freq: 620, duration: 0.4, gain: 0.13, wave: "sawtooth", slideTo: 520 }],
  },
  bag_open: {
    voices: [
      { kind: "noise", duration: 0.09, filterFreq: 1400, gain: 0.16, decay: 0.7 },
      { kind: "tone", freq: 660, duration: 0.05, gain: 0.06, wave: "triangle", delay: 0.03 },
    ],
  },
  bag_close: {
    voices: [
      { kind: "noise", duration: 0.08, filterFreq: 900, gain: 0.14, decay: 0.7 },
      { kind: "tone", freq: 440, duration: 0.05, gain: 0.06, wave: "triangle", delay: 0.01 },
    ],
  },
  whisper: {
    voices: [
      { kind: "tone", freq: 1175, duration: 0.09, gain: 0.09 },
      { kind: "tone", freq: 1568, duration: 0.12, gain: 0.07, delay: 0.07 },
    ],
  },
  duel_challenge: {
    voices: [
      { kind: "tone", freq: 196, duration: 0.35, gain: 0.2, wave: "sawtooth" },
      { kind: "tone", freq: 294, duration: 0.45, gain: 0.2, wave: "sawtooth", delay: 0.18 },
    ],
  },
  duel_countdown_tick: {
    voices: [{ kind: "tone", freq: 880, duration: 0.07, gain: 0.12, wave: "square" }],
  },
  duel_start: {
    voices: [
      { kind: "tone", freq: 220, duration: 0.7, gain: 0.28, wave: "triangle", slideTo: 110 },
      { kind: "noise", duration: 0.4, filterFreq: 3000, gain: 0.14, decay: 0.5, filterType: "highpass" },
    ],
  },
  duel_end: {
    voices: [
      { kind: "tone", freq: 392, duration: 0.18, gain: 0.18, wave: "triangle" },
      { kind: "tone", freq: 523, duration: 0.3, gain: 0.18, wave: "triangle", delay: 0.12 },
    ],
  },
  fiesta_word_0: {
    voices: [
      { kind: "tone", freq: 523, duration: 0.16, gain: 0.2, wave: "square" },
      { kind: "tone", freq: 784.5, duration: 0.22, gain: 0.16, wave: "triangle", delay: 0.05 },
    ],
  },
  fiesta_word_1: {
    voices: [
      { kind: "tone", freq: 587, duration: 0.16, gain: 0.2, wave: "square" },
      { kind: "tone", freq: 880.5, duration: 0.22, gain: 0.16, wave: "triangle", delay: 0.05 },
    ],
  },
  fiesta_word_2: {
    voices: [
      { kind: "tone", freq: 659, duration: 0.16, gain: 0.2, wave: "square" },
      { kind: "tone", freq: 988.5, duration: 0.22, gain: 0.16, wave: "triangle", delay: 0.05 },
      { kind: "tone", freq: 1318, duration: 0.3, gain: 0.14, wave: "triangle", delay: 0.1 },
      { kind: "noise", duration: 0.35, filterFreq: 5200, gain: 0.1, decay: 0.7, filterType: "highpass" },
    ],
  },
  fiesta_word_3: {
    voices: [
      { kind: "tone", freq: 784, duration: 0.16, gain: 0.2, wave: "square" },
      { kind: "tone", freq: 1176, duration: 0.22, gain: 0.16, wave: "triangle", delay: 0.05 },
      { kind: "tone", freq: 1568, duration: 0.3, gain: 0.14, wave: "triangle", delay: 0.1 },
      { kind: "noise", duration: 0.35, filterFreq: 5200, gain: 0.1, decay: 0.7, filterType: "highpass" },
    ],
  },
  fiesta_score_ping: {
    voices: [{ kind: "tone", freq: 740, duration: 0.08, gain: 0.12, wave: "square" }],
  },
  fiesta_score_ping_mine: {
    voices: [
      { kind: "tone", freq: 1320, duration: 0.08, gain: 0.12, wave: "square" },
      { kind: "tone", freq: 1760, duration: 0.12, gain: 0.1, wave: "square", delay: 0.05 },
    ],
  },
  fiesta_wave: {
    voices: [
      { kind: "tone", freq: 523, duration: 0.4, gain: 0.18, wave: "triangle" },
      { kind: "tone", freq: 659, duration: 0.4, gain: 0.18, wave: "triangle", delay: 0.08 },
      { kind: "tone", freq: 784, duration: 0.4, gain: 0.18, wave: "triangle", delay: 0.16 },
      { kind: "tone", freq: 1046, duration: 0.4, gain: 0.18, wave: "triangle", delay: 0.24 },
      { kind: "noise", duration: 0.6, filterFreq: 5000, gain: 0.08, filterType: "highpass" },
    ],
  },
  fiesta_augment: {
    voices: [
      { kind: "tone", freq: 660, duration: 0.25, gain: 0.16, slideTo: 1100 },
      { kind: "tone", freq: 990, duration: 0.3, gain: 0.12, delay: 0.06, slideTo: 1480 },
      { kind: "noise", duration: 0.4, filterFreq: 6000, gain: 0.07, decay: 0.85, filterType: "highpass" },
    ],
  },
  fiesta_down: {
    voices: [{ kind: "tone", freq: 440, duration: 0.3, gain: 0.16, wave: "sawtooth", slideTo: 180 }],
  },
  fiesta_revive: {
    voices: [
      { kind: "tone", freq: 523, duration: 0.12, gain: 0.14, wave: "triangle", slideTo: 784 },
      { kind: "tone", freq: 784, duration: 0.18, gain: 0.12, wave: "triangle", delay: 0.08 },
    ],
  },
};
