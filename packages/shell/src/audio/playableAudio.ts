import type { AudioBusDef, SoundDef } from "@jgengine/core/audio/audioFalloff";
import { withFeedbackCueSounds } from "@jgengine/core/audio/feedbackCues";
import { withUiCueSounds, type UiCueOverrides } from "@jgengine/core/audio/uiCues";
import { resolveUiKit } from "@jgengine/react/uiKits";

import type { PlayableGame } from "../registry";

/** A playable's sound catalog and buses with the default UI and gameplay feedback cues merged in. @internal */
export interface ResolvedPlayableAudio {
  sounds: Record<string, SoundDef>;
  buses: Record<string, AudioBusDef> | undefined;
}

const cache = new WeakMap<PlayableGame, ResolvedPlayableAudio>();

/** The game's `audio.uiCues` over its UI kit's cue sounds: the kit sets the sound, the game still wins. @internal */
export function kitCueOverrides(playable: PlayableGame): UiCueOverrides | undefined {
  const overrides = playable.audio?.uiCues;
  if (overrides === false || playable.uiKit === undefined) return overrides;
  return { ...resolveUiKit(playable.uiKit).sounds, ...overrides };
}

/** Resolve once per playable so the engine, the volume bridge and the settings rows share one bus list. @internal */
export function resolvePlayableAudio(playable: PlayableGame): ResolvedPlayableAudio {
  let resolved = cache.get(playable);
  if (resolved === undefined) {
    const ui = withUiCueSounds(playable.audio?.sounds, playable.audio?.buses, kitCueOverrides(playable));
    resolved = withFeedbackCueSounds(ui.sounds, ui.buses, playable.audio?.feedbackCues);
    cache.set(playable, resolved);
  }
  return resolved;
}
