import type { AmbienceZoneDef } from "@jgengine/core/audio/ambience";
import type { AudioBusDef, SoundDef } from "@jgengine/core/audio/audioFalloff";
import type { AudioOcclusionConfig } from "@jgengine/core/audio/occlusion";
import type { MusicTheme } from "@jgengine/core/audio/music";

import { airAt } from "../world/air";
import { ZONES } from "../world/zones";
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

/**
 * Cues loud enough to be the loudest thing in the scene briefly clear the music and the beds, so a
 * launcher blast reads as an event rather than as part of the mix. Buses come back to the player's
 * own volume exactly; nothing here changes a saved setting.
 */
const DUCKING: Record<string, SoundDef["duck"]> = {
  explosion: { buses: ["music", "ambient"], amount: 0.45, seconds: 1.2 },
  gun_launcher: { buses: ["music", "ambient"], amount: 0.35, seconds: 0.9 },
  gun_shotgun: { buses: ["music", "ambient"], amount: 0.22, seconds: 0.5 },
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
    ...(DUCKING[id] !== undefined ? { duck: DUCKING[id] } : {}),
  };
}

/**
 * The industry bed is keyed to the authored zone volumes: the settled flats hum, Coretown carries a
 * refinery the player never reaches, and the Blight roars. `crossfade` is a walk of a few seconds, so
 * crossing a zone edge hands the bed over instead of cutting it.
 */
export const ambienceZones: AmbienceZoneDef[] = ZONES.map((zone) => ({
  id: zone.id,
  sound: "amb_industry",
  shape: { kind: "sphere", center: [zone.center.x, 0, zone.center.z], radius: zone.radius },
  crossfade: 24,
  gain: airAt(zone.id).industry,
}));

/** Retained machine emitters (hum, drone, buzz) go dull and quiet behind a wall; the budget keeps a busy block cheap. */
export const occlusion: AudioOcclusionConfig = {
  maxTestsPerTick: 6,
  intervalMs: 150,
  attenuation: 0.5,
  lowpassHz: 1100,
  maxDistance: 70,
};

export const audio: {
  sounds: Record<string, SoundDef>;
  buses: Record<string, AudioBusDef>;
  music: Record<string, MusicTheme>;
  zones: readonly AmbienceZoneDef[];
  occlusion: AudioOcclusionConfig;
} = {
  sounds,
  buses: {
    sfx: { id: "sfx", gain: 0.55 },
    ambient: { id: "ambient", gain: 0.5 },
    music: { id: "music", gain: 0.3 },
  },
  music: MUSIC_THEMES,
  zones: ambienceZones,
  occlusion,
};

/**
 * Placed-object catalog ids that hum, buzz, or arc on their own. This is what turns the props the
 * look passes lit into machinery the player can hear from across a zone.
 */
export const objectSounds: Record<string, string> = {
  water_tower: "mach_hum",
  rebuild_station: "mach_hum",
  fast_travel: "mach_hum",
  street_lamp: "lamp_buzz",
  wreck: "elec_crackle",
  bus_wreck: "elec_crackle",
  reactor_gate: "gate_drone",
};
