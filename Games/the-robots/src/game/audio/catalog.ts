import type { AudioBusDef, SoundDef } from "@jgengine/core/audio/audioFalloff";
import type { MusicTheme } from "@jgengine/core/audio/music";

import { MUSIC_THEMES } from "./music";
import { LOOP_SOUND_IDS, POSITIONAL_SOUND_IDS, SFX_PATCHES } from "./sfx";

const LOOP_IDS = new Set<string>(LOOP_SOUND_IDS);

/** Machine emitters carry a long way across open flats; foley and barks should not. */
const FALLOFF: Record<string, SoundDef["falloff"]> = {
  mach_hum: { minDistance: 4, maxDistance: 70, curve: "inverse" },
  gate_drone: { minDistance: 6, maxDistance: 90, curve: "inverse" },
  lamp_buzz: { minDistance: 1.5, maxDistance: 16, curve: "inverse" },
  elec_crackle: { minDistance: 1.5, maxDistance: 22, curve: "inverse" },
  bark_alert: { minDistance: 3, maxDistance: 55, curve: "linear" },
  bark_taunt: { minDistance: 3, maxDistance: 45, curve: "linear" },
  bark_idle: { minDistance: 2, maxDistance: 26, curve: "linear" },
  enemy_die: { minDistance: 3, maxDistance: 60, curve: "linear" },
  explosion: { minDistance: 6, maxDistance: 140, curve: "inverse" },
};

const sounds: Record<string, SoundDef> = {};
for (const [id, synth] of Object.entries(SFX_PATCHES)) {
  const positional = POSITIONAL_SOUND_IDS.has(id);
  sounds[id] = {
    id,
    synth,
    bus: id.startsWith("amb_") ? "ambient" : "sfx",
    positional,
    loop: LOOP_IDS.has(id),
    ...(positional && FALLOFF[id] !== undefined ? { falloff: FALLOFF[id] } : {}),
  };
}

export const audio: {
  sounds: Record<string, SoundDef>;
  buses: Record<string, AudioBusDef>;
  music: Record<string, MusicTheme>;
} = {
  sounds,
  buses: {
    sfx: { id: "sfx", gain: 0.55 },
    ambient: { id: "ambient", gain: 0.5 },
    music: { id: "music", gain: 0.3 },
  },
  music: MUSIC_THEMES,
};

/**
 * Placed-object catalog ids that hum, buzz, or arc on their own. This is what turns the props the
 * look passes lit into machinery the player can hear from across a zone.
 */
export const objectSounds: Record<string, string> = {
  water_tower: "mach_hum",
  new_u_station: "mach_hum",
  fast_travel: "mach_hum",
  street_lamp: "lamp_buzz",
  wreck: "elec_crackle",
  bus_wreck: "elec_crackle",
  reactor_gate: "gate_drone",
};
