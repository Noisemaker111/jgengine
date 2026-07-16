const n = (beat, midi, dur, vel, inst) => ({
    beat,
    midi,
    dur,
    vel,
    inst,
});
function chord(beat, midis, dur, vel, inst) {
    return midis.map((m) => n(beat, m, dur, vel, inst));
}
function arp(start, midis, reps, step, dur, vel, inst) {
    const out = [];
    for (let i = 0; i < reps; i += 1)
        out.push(n(start + i * step, midis[i % midis.length], dur, vel, inst));
    return out;
}
function pulse(start, midi, reps, step, dur, vel, inst) {
    const out = [];
    for (let i = 0; i < reps; i += 1)
        out.push(n(start + i * step, midi, dur, vel, inst));
    return out;
}
const C = 60;
const D = 62;
const E = 64;
const F = 65;
const G = 67;
const A = 69;
const town = {
    id: "town",
    bpm: 88,
    bars: 4,
    trim: 1.9,
    events: [
        ...chord(0, [C, E, G], 4, 0.5, "strings"),
        ...chord(4, [F, A, C + 12], 4, 0.5, "strings"),
        ...chord(8, [G, C + 12, E + 12], 4, 0.5, "strings"),
        ...chord(12, [C, E, G], 4, 0.5, "strings"),
        ...arp(0, [C + 12, E + 12, G + 12, E + 12], 8, 0.5, 0.45, 0.4, "harp"),
        ...arp(4, [F + 12, A + 12, C + 24, A + 12], 8, 0.5, 0.45, 0.4, "harp"),
        ...arp(8, [G + 12, D + 24, E + 24, D + 24], 8, 0.5, 0.45, 0.4, "harp"),
        ...arp(12, [C + 12, E + 12, G + 12, E + 12], 8, 0.5, 0.45, 0.4, "harp"),
        n(0, E + 12, 2, 0.5, "flute"),
        n(2, G + 12, 1.5, 0.5, "flute"),
        n(4, A + 12, 2, 0.5, "flute"),
        n(6, G + 12, 1.5, 0.45, "flute"),
        n(8, E + 12, 3, 0.5, "flute"),
        n(12, G + 12, 1.5, 0.45, "flute"),
        n(13.5, E + 12, 2.5, 0.5, "flute"),
    ],
};
const vale = {
    id: "vale",
    bpm: 100,
    bars: 4,
    trim: 2.0,
    events: [
        ...chord(0, [D - 12, D, A], 4, 0.45, "strings"),
        ...chord(4, [G - 12, G, D + 12], 4, 0.45, "strings"),
        ...chord(8, [A - 12, A, E + 12], 4, 0.45, "strings"),
        ...chord(12, [D - 12, D, A], 4, 0.45, "strings"),
        n(0, D + 12, 3, 0.6, "oboe"),
        n(3, F + 13, 1, 0.5, "oboe"),
        n(4, G + 12, 2.5, 0.6, "oboe"),
        n(7, A + 12, 1, 0.5, "oboe"),
        n(8, A + 12, 2, 0.6, "oboe"),
        n(10, G + 12, 2, 0.55, "oboe"),
        n(12, F + 13, 2, 0.55, "oboe"),
        n(14, D + 12, 2, 0.6, "oboe"),
        n(0, D, 4, 0.4, "horn"),
        n(8, A - 12, 4, 0.4, "horn"),
        ...pulse(0, D - 24, 16, 1, 0.4, 0.5, "frameDrum"),
    ],
};
const marsh = {
    id: "marsh",
    bpm: 64,
    bars: 4,
    trim: 2.2,
    events: [
        ...chord(0, [A - 24, A - 12, C], 8, 0.4, "pad"),
        ...chord(8, [F - 24, F - 12, A - 12], 8, 0.4, "pad"),
        ...chord(0, [A - 12, C, E], 8, 0.3, "choir"),
        ...chord(8, [F - 12, A - 12, C], 8, 0.3, "choir"),
        n(0, A, 3, 0.5, "oboe"),
        n(3, C + 12, 2, 0.45, "oboe"),
        n(6, A, 2, 0.4, "oboe"),
        n(9, G, 3, 0.45, "oboe"),
        n(12, F, 4, 0.5, "oboe"),
        ...pulse(0, A - 36, 4, 4, 1.5, 0.4, "bass"),
    ],
};
const peaks = {
    id: "peaks",
    bpm: 76,
    bars: 4,
    trim: 1.9,
    events: [
        n(0, A - 12, 4, 0.6, "horn"),
        n(4, E, 4, 0.6, "horn"),
        n(8, F, 4, 0.6, "horn"),
        n(12, E, 4, 0.6, "horn"),
        ...chord(0, [A - 12, C, E], 4, 0.4, "strings"),
        ...chord(4, [A - 12, C, E], 4, 0.4, "strings"),
        ...chord(8, [F - 12, A - 12, C], 4, 0.4, "strings"),
        ...chord(12, [E - 12, G, 71], 4, 0.4, "strings"),
        ...chord(0, [A, C + 12, E + 12], 8, 0.28, "choir"),
        ...chord(8, [F, A, C + 12], 8, 0.28, "choir"),
        n(0, A - 24, 1, 0.7, "timpani"),
        n(4, E - 12, 1, 0.6, "timpani"),
        n(8, F - 12, 1, 0.6, "timpani"),
        n(12, E - 12, 1, 0.7, "timpani"),
    ],
};
const battle = {
    id: "battle",
    bpm: 144,
    bars: 2,
    trim: 1.5,
    events: [
        ...pulse(0, A - 24, 8, 1, 0.4, 0.55, "warDrum"),
        ...arp(0, [A - 12, A - 12, C, A - 12], 8, 1, 0.22, 0.5, "stacc"),
        n(0, A - 36, 1, 0.6, "bass"),
        n(2, A - 36, 1, 0.5, "bass"),
        n(4, F - 36, 1, 0.6, "bass"),
        n(6, G - 36, 1, 0.55, "bass"),
        n(0, A, 1.5, 0.6, "brassStab"),
        n(3, C + 12, 1, 0.55, "brassStab"),
        n(4, F, 1.5, 0.6, "brassStab"),
        n(7, E, 1, 0.6, "brassStab"),
    ],
};
/** Per-zone procedural soundtrack. Keys are the theme ids `ctx.game.audio.music(id)` crossfades between. */
export const MUSIC_THEMES = {
    town: town,
    vale: vale,
    marsh: marsh,
    peaks: peaks,
    battle: battle,
};
