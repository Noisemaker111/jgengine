import type { AudioBusDef, SoundDef } from "./audioFalloff";

/**
 * A gameplay moment the engine reacts to: taking or dealing a hit, a kill, a pickup, an objective,
 * a wave starting, or a refused action. The game names the moment; the engine owns the reaction.
 */
export type FeedbackCue = "hit" | "hurt" | "kill" | "pickup" | "objective" | "wave" | "deny";

/** Every {@link FeedbackCue}, in a stable order. */
export const FEEDBACK_CUES: readonly FeedbackCue[] = ["hit", "hurt", "kill", "pickup", "objective", "wave", "deny"];

/** Bus the default feedback cues mix through; the settings menu shows its volume and mute. */
export const FEEDBACK_CUE_BUS = "sfx";

/** Catalog id a cue plays under: `feel.hit`, `feel.kill`, ... A game sound with that id replaces the default. */
export function feedbackCueSoundId(cue: FeedbackCue): string {
  return `feel.${cue}`;
}

function feelSound(cue: FeedbackCue, def: Omit<SoundDef, "id" | "bus" | "positional">): SoundDef {
  return { id: feedbackCueSoundId(cue), bus: FEEDBACK_CUE_BUS, positional: false, priority: 5, ...def };
}

/**
 * Short procedural reactions - no samples to load, so every game has impact feedback without
 * authoring audio. Loud enough to read, quiet enough to sit under a weapon's own sound.
 */
export const DEFAULT_FEEDBACK_CUE_SOUNDS: Readonly<Record<FeedbackCue, SoundDef>> = {
  hit: feelSound("hit", {
    gain: 0.55,
    maxVoices: 4,
    synth: {
      voices: [
        { kind: "noise", filterType: "bandpass", filterFreq: 1800, duration: 0.05, gain: 0.3 },
        { kind: "tone", wave: "triangle", freq: 210, slideTo: 150, duration: 0.07, gain: 0.24, attack: 0.002 },
      ],
    },
  }),
  hurt: feelSound("hurt", {
    gain: 0.65,
    maxVoices: 2,
    synth: {
      voices: [
        { kind: "tone", wave: "triangle", freq: 165, slideTo: 110, duration: 0.16, gain: 0.32, attack: 0.003 },
        { kind: "noise", filterType: "lowpass", filterFreq: 900, duration: 0.1, gain: 0.14 },
      ],
    },
  }),
  kill: feelSound("kill", {
    gain: 0.6,
    maxVoices: 2,
    synth: {
      voices: [
        { kind: "noise", filterType: "lowpass", filterFreq: 1400, duration: 0.12, gain: 0.24 },
        { kind: "tone", wave: "sawtooth", freq: 330, slideTo: 220, duration: 0.14, gain: 0.18 },
        { kind: "tone", wave: "sine", freq: 110, slideTo: 78, duration: 0.2, gain: 0.22, delay: 0.03 },
      ],
    },
  }),
  pickup: feelSound("pickup", {
    gain: 0.5,
    maxVoices: 3,
    synth: {
      voices: [
        { kind: "tone", wave: "sine", freq: 880, duration: 0.09, gain: 0.2, attack: 0.003 },
        { kind: "tone", wave: "sine", freq: 1320, duration: 0.11, gain: 0.16, delay: 0.05, attack: 0.003 },
      ],
    },
  }),
  objective: feelSound("objective", {
    gain: 0.55,
    maxVoices: 1,
    synth: {
      voices: [
        { kind: "tone", wave: "triangle", freq: 523, duration: 0.14, gain: 0.22 },
        { kind: "tone", wave: "triangle", freq: 659, duration: 0.14, gain: 0.2, delay: 0.08 },
        { kind: "tone", wave: "triangle", freq: 784, duration: 0.26, gain: 0.2, delay: 0.16 },
      ],
    },
  }),
  wave: feelSound("wave", {
    gain: 0.6,
    maxVoices: 1,
    synth: {
      voices: [
        { kind: "tone", wave: "sawtooth", freq: 98, duration: 0.5, gain: 0.16, attack: 0.04, sustain: 0.24 },
        { kind: "tone", wave: "sawtooth", freq: 147, duration: 0.5, gain: 0.12, attack: 0.05, sustain: 0.24 },
        { kind: "noise", filterType: "lowpass", filterFreq: 600, duration: 0.45, gain: 0.12, decay: 1 },
      ],
    },
  }),
  deny: feelSound("deny", {
    gain: 0.5,
    maxVoices: 1,
    synth: {
      voices: [
        { kind: "tone", wave: "square", freq: 196, slideTo: 170, duration: 0.07, gain: 0.16, attack: 0.002 },
        { kind: "tone", wave: "square", freq: 155, slideTo: 130, duration: 0.1, gain: 0.16, delay: 0.07, attack: 0.002 },
      ],
    },
  }),
};

/** Per-cue override: a replacement sound, or `false` to silence that cue. `false` for the whole map silences all. */
export type FeedbackCueOverrides = false | Partial<Record<FeedbackCue, SoundDef | false>>;

/**
 * Merge the default feedback reactions into a game's sound catalog. A game sound already named
 * `feel.<cue>` wins, then `overrides`, then the default. Adds the `sfx` bus (gain 0.9) when the game
 * did not declare one, so the impact layer has its own volume and mute row.
 *
 * @capability feedback-cue-sounds default procedural hit/hurt/kill/pickup/objective/wave/deny reactions on an "sfx" bus, overridable per game
 */
export function withFeedbackCueSounds(
  sounds: Readonly<Record<string, SoundDef>> | undefined,
  buses: Readonly<Record<string, AudioBusDef>> | undefined,
  overrides?: FeedbackCueOverrides,
): { sounds: Record<string, SoundDef>; buses: Record<string, AudioBusDef> | undefined } {
  if (overrides === false) return { sounds: { ...sounds }, buses: buses === undefined ? undefined : { ...buses } };
  const merged: Record<string, SoundDef> = {};
  let usesBus = false;
  for (const cue of FEEDBACK_CUES) {
    const id = feedbackCueSoundId(cue);
    if (sounds?.[id] !== undefined) continue;
    const override = overrides?.[cue];
    if (override === false) continue;
    const def = override ?? DEFAULT_FEEDBACK_CUE_SOUNDS[cue];
    merged[id] = { ...def, id };
    if (def.bus === FEEDBACK_CUE_BUS) usesBus = true;
  }
  const nextBuses = usesBus && buses?.[FEEDBACK_CUE_BUS] === undefined
    ? { ...buses, [FEEDBACK_CUE_BUS]: { id: FEEDBACK_CUE_BUS, gain: 0.9 } }
    : buses;
  return { sounds: { ...merged, ...sounds }, buses: nextBuses };
}
