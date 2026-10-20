import type { AudioBusDef, SoundDef } from "@jgengine/core/audio/audioFalloff";
import { withUiCueSounds } from "@jgengine/core/audio/uiCues";

import type { PlayableGame } from "../registry";

/** A playable's sound catalog and buses with the default UI cues merged in. @internal */
export interface ResolvedPlayableAudio {
  sounds: Record<string, SoundDef>;
  buses: Record<string, AudioBusDef> | undefined;
}

const cache = new WeakMap<PlayableGame, ResolvedPlayableAudio>();

/** Resolve once per playable so the engine, the volume bridge and the settings rows share one bus list. @internal */
export function resolvePlayableAudio(playable: PlayableGame): ResolvedPlayableAudio {
  let resolved = cache.get(playable);
  if (resolved === undefined) {
    resolved = withUiCueSounds(playable.audio?.sounds, playable.audio?.buses, playable.audio?.uiCues);
    cache.set(playable, resolved);
  }
  return resolved;
}
