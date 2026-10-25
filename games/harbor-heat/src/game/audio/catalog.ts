import type { AudioBusDef, SoundDef } from "@jgengine/core/audio/audioFalloff";

import type { MusicTheme } from "@jgengine/core/audio/music";

import { RADIO_THEMES } from "../radio/songs";
import { LOOP_SOUND_IDS, SFX_PATCHES } from "./sfx";

const LOOP_IDS = new Set<string>(LOOP_SOUND_IDS);

const sounds: Record<string, SoundDef> = {};
for (const [id, synth] of Object.entries(SFX_PATCHES)) {
  sounds[id] = { id, synth, bus: "sfx", positional: false, loop: LOOP_IDS.has(id) };
}

/** The `defineGame({ audio })` catalog for Harbor Heat — driving loops, impact one-shots, and the car radio's songs and voices. */
export const audio: {
  sounds: Record<string, SoundDef>;
  buses: Record<string, AudioBusDef>;
  music: Record<string, MusicTheme>;
  musicBus: string;
  speechBus: string;
} = {
  sounds,
  buses: {
    sfx: { id: "sfx", gain: 0.5 },
    radio: { id: "radio", gain: 0.8 },
  },
  music: RADIO_THEMES,
  musicBus: "radio",
  speechBus: "radio",
};
