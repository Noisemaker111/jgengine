import { MUSIC_THEMES } from "./music";
import { SFX_PATCHES } from "./sfx";
const sounds = {};
for (const [id, synth] of Object.entries(SFX_PATCHES)) {
    sounds[id] = { id, synth, bus: "sfx", positional: false };
}
export const audio = {
    sounds,
    buses: {
        sfx: { id: "sfx", gain: 0.32 },
        music: { id: "music", gain: 0.9 },
    },
    music: MUSIC_THEMES,
};
