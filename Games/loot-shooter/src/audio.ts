import type { AudioBusDef, SoundDef } from "@jgengine/core/audio/audioFalloff";

const DRONE_HUM_WAV = "data:audio/wav;base64,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";

export const buses: Record<string, AudioBusDef> = {
  sfx: { id: "sfx", gain: 1 },
  music: { id: "music", gain: 0.6 },
};

export const sounds: Record<string, SoundDef> = {
  drone_hum: {
    id: "drone_hum",
    url: DRONE_HUM_WAV,
    bus: "sfx",
    loop: true,
    positional: true,
    falloff: { minDistance: 2, maxDistance: 20, curve: "linear" },
  },
};

export const entitySounds: Record<string, string> = {
  drone_grunt: "drone_hum",
};
