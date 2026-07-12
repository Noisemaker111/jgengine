/** Oscillator waveform available to a pitched synth voice. */
export type SynthWave = "sine" | "square" | "sawtooth" | "triangle";

/** Biquad filter shape a noise voice is coloured through. */
export type SynthFilter = "lowpass" | "highpass" | "bandpass";

/**
 * A pitched oscillator voice: a 12ms linear attack to `gain`, then an
 * exponential decay to silence across `duration`, with an optional
 * exponential pitch slide from `freq` to `slideTo`.
 */
export interface ToneVoice {
  kind: "tone";
  /** Start frequency in Hz. */
  freq: number;
  /** Total voice length in seconds (the decay spans this). */
  duration: number;
  /** Peak gain before patch/bus scaling. Default 1. */
  gain?: number;
  /** Oscillator waveform. Default "sine". */
  wave?: SynthWave;
  /** Start offset in seconds from the cue trigger. Default 0. */
  delay?: number;
  /** When set, pitch ramps exponentially from `freq` to this Hz across `duration`. */
  slideTo?: number;
  /** Attack ramp in seconds. Default 0.012. */
  attack?: number;
}

/**
 * A filtered white-noise burst — impacts, whooshes, breath, crackle. Realised
 * from a shared 1s noise buffer at a randomised playback rate and start offset,
 * decaying exponentially to silence at `duration * decay`.
 */
export interface NoiseVoice {
  kind: "noise";
  /** Total voice length in seconds. */
  duration: number;
  /** Biquad cutoff/centre in Hz. */
  filterFreq: number;
  /** Peak gain before patch/bus scaling. Default 1. */
  gain?: number;
  /** Filter shape. Default "lowpass". */
  filterType?: SynthFilter;
  /** Fraction of `duration` over which the burst decays to silence. Default 0.9. */
  decay?: number;
  /** Start offset in seconds from the cue trigger. Default 0. */
  delay?: number;
}

/** One layered voice of a synth cue. */
export type SynthVoice = ToneVoice | NoiseVoice;

/**
 * A procedural sound cue: a set of voices triggered together, each with its own
 * `delay`, summed into one one-shot. Pure serialisable data — the shell realises
 * it on Web Audio, so the same catalog runs headless in tests with no `AudioContext`.
 */
export interface SynthPatch {
  voices: readonly SynthVoice[];
  /** Overall cue gain multiplier applied to every voice. Default 1. */
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
