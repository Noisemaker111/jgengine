import type { SoundDef } from "@jgengine/core/audio/audioFalloff";

/** Original mechanical cues, realized and mixed by the shared Web Audio engine. */
export const audio = {
  buses: { sfx: { id: "sfx", gain: 0.35 } },
  sounds: {
    rail: { id: "rail", bus: "sfx", synth: { voices: [{ kind: "tone", freq: 160, slideTo: 80, duration: 0.35, wave: "triangle" }] } },
    shot: { id: "shot", bus: "sfx", synth: { voices: [{ kind: "noise", duration: 0.12, filterFreq: 1800 }, { kind: "tone", freq: 110, slideTo: 45, duration: 0.1 }] } },
    reload: { id: "reload", bus: "sfx", synth: { voices: [{ kind: "noise", duration: 0.05, filterFreq: 2600 }, { kind: "noise", duration: 0.05, filterFreq: 1200, delay: 0.16 }] } },
    banked: { id: "banked", bus: "sfx", synth: { voices: [{ kind: "tone", freq: 440, duration: 0.16 }, { kind: "tone", freq: 660, duration: 0.22, delay: 0.12 }] } },
    terminal: { id: "terminal", bus: "sfx", synth: { voices: [{ kind: "tone", freq: 320, duration: 0.06, wave: "triangle" }] } },
    // Retained, non-positional station bed: a low flat roar plus a sub hum under the pumps and press.
    bed: { id: "bed", bus: "sfx", loop: true, positional: false, synth: { voices: [
      { kind: "noise", duration: 2, filterFreq: 240, gain: 0.5, sustain: 2 },
      { kind: "tone", freq: 52, duration: 2, wave: "triangle", gain: 0.35, sustain: 2 },
    ] } },
    // Low-air escalation: two falling chirps, repeated by the game while the tank is nearly empty.
    lowAir: { id: "lowAir", bus: "sfx", synth: { voices: [
      { kind: "tone", freq: 740, duration: 0.16, wave: "triangle" },
      { kind: "tone", freq: 560, duration: 0.2, wave: "triangle", delay: 0.2 },
    ] } },
    // The Fitter raising its rifle: a slow rising motor whine with a scrape of noise.
    windup: { id: "windup", bus: "sfx", synth: { voices: [
      { kind: "tone", freq: 90, slideTo: 190, duration: 0.7, wave: "triangle" },
      { kind: "noise", duration: 0.7, filterFreq: 520, gain: 0.4 },
    ] } },
  } satisfies Record<string, SoundDef>,
};
