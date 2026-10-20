import type { AudioBusDef, SoundDef } from "./audioFalloff";
import type { NoticeTone } from "../game/notices";

/** Interface sound cues every game gets: press, hover, panel open/close, confirm, refusal, notification. */
export type UiCue = "click" | "hover" | "open" | "close" | "confirm" | "deny" | "notify";

/** Every {@link UiCue}, in a stable order. */
export const UI_CUES: readonly UiCue[] = ["click", "hover", "open", "close", "confirm", "deny", "notify"];

/** Bus the default UI cues mix through; the settings menu shows its volume. */
export const UI_CUE_BUS = "ui";

/** Catalog id a cue plays under: `ui.click`, `ui.deny`, ... A game sound with that id replaces the default. */
export function uiCueSoundId(cue: UiCue): string {
  return `ui.${cue}`;
}

/** The cue a notice of each tone plays when it appears. */
export const NOTICE_TONE_CUES: Readonly<Record<NoticeTone, UiCue>> = {
  info: "notify",
  success: "confirm",
  warn: "notify",
  deny: "deny",
};

function uiSound(cue: UiCue, def: Omit<SoundDef, "id" | "bus" | "positional">): SoundDef {
  return { id: uiCueSoundId(cue), bus: UI_CUE_BUS, positional: false, priority: 2, ...def };
}

/** Short, soft procedural patches: no samples to load, quiet enough to sit under game audio. */
export const DEFAULT_UI_CUE_SOUNDS: Readonly<Record<UiCue, SoundDef>> = {
  click: uiSound("click", {
    gain: 0.5,
    maxVoices: 2,
    synth: {
      voices: [
        { kind: "tone", wave: "triangle", freq: 1560, slideTo: 1120, duration: 0.05, gain: 0.32, attack: 0.002 },
        { kind: "noise", filterType: "highpass", filterFreq: 4200, duration: 0.018, gain: 0.08 },
      ],
    },
  }),
  hover: uiSound("hover", {
    gain: 0.35,
    maxVoices: 1,
    synth: { voices: [{ kind: "tone", wave: "sine", freq: 2240, duration: 0.03, gain: 0.12, attack: 0.002 }] },
  }),
  open: uiSound("open", {
    gain: 0.5,
    maxVoices: 2,
    synth: {
      voices: [
        { kind: "tone", wave: "triangle", freq: 523, duration: 0.09, gain: 0.26 },
        { kind: "tone", wave: "triangle", freq: 784, duration: 0.12, gain: 0.24, delay: 0.045 },
        { kind: "noise", filterType: "bandpass", filterFreq: 2400, duration: 0.08, gain: 0.04 },
      ],
    },
  }),
  close: uiSound("close", {
    gain: 0.5,
    maxVoices: 2,
    synth: {
      voices: [
        { kind: "tone", wave: "triangle", freq: 784, duration: 0.08, gain: 0.22 },
        { kind: "tone", wave: "triangle", freq: 523, duration: 0.11, gain: 0.22, delay: 0.04 },
      ],
    },
  }),
  confirm: uiSound("confirm", {
    gain: 0.5,
    maxVoices: 2,
    synth: {
      voices: [
        { kind: "tone", wave: "sine", freq: 659, duration: 0.12, gain: 0.26 },
        { kind: "tone", wave: "sine", freq: 831, duration: 0.12, gain: 0.24, delay: 0.06 },
        { kind: "tone", wave: "sine", freq: 988, duration: 0.22, gain: 0.24, delay: 0.12 },
      ],
    },
  }),
  deny: uiSound("deny", {
    gain: 0.55,
    maxVoices: 1,
    synth: {
      voices: [
        { kind: "tone", wave: "triangle", freq: 233, slideTo: 207, duration: 0.09, gain: 0.34, attack: 0.004 },
        { kind: "tone", wave: "triangle", freq: 185, slideTo: 164, duration: 0.15, gain: 0.34, delay: 0.085, attack: 0.004 },
        { kind: "noise", filterType: "lowpass", filterFreq: 900, duration: 0.05, gain: 0.08 },
      ],
    },
  }),
  notify: uiSound("notify", {
    gain: 0.45,
    maxVoices: 1,
    synth: {
      voices: [
        { kind: "tone", wave: "sine", freq: 1319, duration: 0.32, gain: 0.22 },
        { kind: "tone", wave: "sine", freq: 1976, duration: 0.24, gain: 0.08 },
        { kind: "tone", wave: "sine", freq: 1760, duration: 0.36, gain: 0.16, delay: 0.07 },
      ],
    },
  }),
};

/** Per-cue override: a replacement sound, or `false` to silence that cue. `false` for the whole map silences all. */
export type UiCueOverrides = false | Partial<Record<UiCue, SoundDef | false>>;

/**
 * Merge the default UI cue patches into a game's sound catalog. A game sound already named `ui.<cue>` wins,
 * then `overrides`, then the default. Adds the `ui` bus (gain 0.8) when the game did not declare one.
 *
 * @capability ui-sound-cues default procedural click/hover/open/close/confirm/deny/notify cues on a "ui" bus, overridable per game
 */
export function withUiCueSounds(
  sounds: Readonly<Record<string, SoundDef>> | undefined,
  buses: Readonly<Record<string, AudioBusDef>> | undefined,
  overrides?: UiCueOverrides,
): { sounds: Record<string, SoundDef>; buses: Record<string, AudioBusDef> | undefined } {
  if (overrides === false) return { sounds: { ...sounds }, buses: buses === undefined ? undefined : { ...buses } };
  const merged: Record<string, SoundDef> = {};
  let usesUiBus = false;
  for (const cue of UI_CUES) {
    const id = uiCueSoundId(cue);
    if (sounds?.[id] !== undefined) continue;
    const override = overrides?.[cue];
    if (override === false) continue;
    const def = override ?? DEFAULT_UI_CUE_SOUNDS[cue];
    merged[id] = { ...def, id };
    if (def.bus === UI_CUE_BUS) usesUiBus = true;
  }
  const nextBuses = usesUiBus && buses?.[UI_CUE_BUS] === undefined
    ? { ...buses, [UI_CUE_BUS]: { id: UI_CUE_BUS, gain: 0.8 } }
    : buses;
  return { sounds: { ...merged, ...sounds }, buses: nextBuses };
}
