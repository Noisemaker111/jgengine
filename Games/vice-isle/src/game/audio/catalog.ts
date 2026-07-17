import type { AudioBusDef, SoundDef } from "@jgengine/core/audio/audioFalloff";

import { LOOP_SOUND_IDS, SFX_PATCHES } from "./sfx";

const LOOP_IDS = new Set<string>(LOOP_SOUND_IDS);

const sounds: Record<string, SoundDef> = {};
for (const [id, synth] of Object.entries(SFX_PATCHES)) {
  sounds[id] = { id, synth, bus: "sfx", positional: false, loop: LOOP_IDS.has(id) };
}

/** The `defineGame({ audio })` catalog for Vice Isle — driving loops + impact one-shots (#1051). */
export const audio: {
  sounds: Record<string, SoundDef>;
  buses: Record<string, AudioBusDef>;
} = {
  sounds,
  buses: {
    sfx: { id: "sfx", gain: 0.5 },
  },
};
