export type SynthWave = "sine" | "square" | "sawtooth" | "triangle";

export type SynthFilter = "lowpass" | "highpass" | "bandpass";

export interface ToneVoice {
  kind: "tone";
  /** Start frequency in Hz. */
  freq: number;
  /** Total voice length in seconds (the decay spans this). */
  duration: number;
  gain?: number;
  wave?: SynthWave;
  /** Start offset in seconds from the cue trigger. Default 0. */
  delay?: number;
  /** When set, pitch ramps exponentially from `freq` to this Hz across `duration`. */
  slideTo?: number;
  /** Attack ramp in seconds. Default 0.012. */
  attack?: number;
  /**
   * Seconds held at full gain after the attack, before the decay to silence at `duration`.
   * Default 0 — a plain percussive decay. Set it to `duration` for a flat, sustained bed:
   * a looped buffer only reads as continuous if its amplitude does not fall across the loop,
   * so ambient hums and wind beds need this or they pulse once per loop.
   */
  sustain?: number;
}

export interface NoiseVoice {
  kind: "noise";
  /** Total voice length in seconds. */
  duration: number;
  /** Biquad cutoff/centre in Hz. */
  filterFreq: number;
  gain?: number;
  filterType?: SynthFilter;
  decay?: number;
  /** Start offset in seconds from the cue trigger. Default 0. */
  delay?: number;
  /**
   * Seconds held at full gain before the decay begins. Default 0. Set it to `duration` for a
   * flat noise bed (wind, rain, machine roar) that loops without pulsing.
   */
  sustain?: number;
}

export type SynthVoice = ToneVoice | NoiseVoice;

/**
 * A procedural sound cue: a set of voices triggered together, each with its own
 * `delay`, summed into one one-shot. Pure serialisable data — the shell realises
 * it on Web Audio, so the same catalog runs headless in tests with no `AudioContext`.
 */
export interface SynthPatch {
  voices: readonly SynthVoice[];
  gain?: number;
}

/** Total wall-clock length of a patch in seconds — the latest voice end across all voices. */
export function patchDuration(patch: SynthPatch): number {
  let end = 0;
  for (const voice of patch.voices) {
    end = Math.max(end, (voice.delay ?? 0) + voice.duration);
  }
  return end;
}
