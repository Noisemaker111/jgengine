import type { SoundDef } from "@jgengine/core/audio/audioFalloff";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { session } from "./session";
import { park } from "./park";
import { ContextMap } from "@jgengine/core/runtime/contextIdentity";

/**
 * Procedural cues for the haunt: minor intervals, slow detuned bells, breathy noise. Each id is
 * played from the code path that accepted the action (or the night/milestone event), so a cue never
 * fires for a rejected click. Synth patches need no asset files.
 */
export const HAUNT_SOUNDS = {
  // Something set down in the dark: a dull wooden knock with a breath of dust.
  place: {
    id: "place",
    bus: "sfx",
    gain: 0.8,
    falloff: { minDistance: 40, maxDistance: 160, curve: "linear" },
    synth: {
      voices: [
        { kind: "tone", freq: 220, slideTo: 165, duration: 0.14, wave: "triangle", gain: 0.5 },
        { kind: "noise", duration: 0.06, filterFreq: 900, filterType: "bandpass", gain: 0.25 },
      ],
    },
  },
  // Torn down for a refund: two cold glassy notes, a minor third apart.
  sell: {
    id: "sell",
    bus: "sfx",
    gain: 0.75,
    falloff: { minDistance: 40, maxDistance: 160, curve: "linear" },
    synth: {
      voices: [
        { kind: "tone", freq: 880, duration: 0.12, wave: "sine", gain: 0.35 },
        { kind: "tone", freq: 1046, duration: 0.18, wave: "sine", gain: 0.3, delay: 0.07 },
      ],
    },
  },
  // A refused build: a low knell, a tritone down.
  denied: {
    id: "denied",
    bus: "sfx",
    gain: 0.8,
    synth: {
      voices: [
        { kind: "tone", freq: 185, duration: 0.16, wave: "triangle", gain: 0.4 },
        { kind: "tone", freq: 131, duration: 0.24, wave: "triangle", gain: 0.4, delay: 0.1 },
      ],
    },
  },
  // A dial turned (a toll, a scare yield): one music-box tick.
  ticket: {
    id: "ticket",
    bus: "sfx",
    gain: 0.55,
    synth: {
      voices: [{ kind: "tone", freq: 1245, duration: 0.07, wave: "sine", gain: 0.35 }],
    },
  },
  // A scare prop jolts someone: a stab of two clashing notes and a hiss.
  scare: {
    id: "scare",
    bus: "sfx",
    gain: 0.7,
    falloff: { minDistance: 20, maxDistance: 110, curve: "linear" },
    synth: {
      voices: [
        { kind: "tone", freq: 466, slideTo: 440, duration: 0.22, wave: "sawtooth", gain: 0.18 },
        { kind: "tone", freq: 494, slideTo: 466, duration: 0.22, wave: "sawtooth", gain: 0.18 },
        { kind: "noise", duration: 0.12, filterFreq: 3200, filterType: "bandpass", gain: 0.2 },
      ],
    },
  },
  // One of the living flees screaming: a rising, falling shriek of filtered noise.
  scream: {
    id: "scream",
    bus: "sfx",
    gain: 0.6,
    falloff: { minDistance: 25, maxDistance: 140, curve: "linear" },
    synth: {
      voices: [
        { kind: "tone", freq: 880, slideTo: 1480, duration: 0.25, wave: "triangle", gain: 0.22 },
        { kind: "tone", freq: 1480, slideTo: 990, duration: 0.3, wave: "triangle", gain: 0.2, delay: 0.22 },
        { kind: "noise", duration: 0.4, filterFreq: 2600, filterType: "bandpass", gain: 0.15 },
      ],
    },
  },
  // Dusk: the gate creaks and a cracked bell rings twice.
  gates: {
    id: "gates",
    bus: "sfx",
    gain: 0.8,
    synth: {
      voices: [
        { kind: "tone", freq: 330, duration: 0.5, wave: "sine", gain: 0.4 },
        { kind: "tone", freq: 349, duration: 0.45, wave: "sine", gain: 0.25, delay: 0.12 },
        { kind: "noise", duration: 0.2, filterFreq: 500, filterType: "bandpass", gain: 0.15 },
      ],
    },
  },
  // Noon's settlement: a falling minor arpeggio.
  settle: {
    id: "settle",
    bus: "sfx",
    gain: 0.8,
    synth: {
      voices: [
        { kind: "tone", freq: 659, duration: 0.25, wave: "triangle", gain: 0.35 },
        { kind: "tone", freq: 523, duration: 0.25, wave: "triangle", gain: 0.35, delay: 0.08 },
        { kind: "tone", freq: 440, duration: 0.25, wave: "triangle", gain: 0.35, delay: 0.16 },
      ],
    },
  },
  // A ghost moves in or the rumor spreads: a shimmering run up a minor scale.
  milestone: {
    id: "milestone",
    bus: "sfx",
    gain: 0.8,
    synth: {
      voices: [
        { kind: "tone", freq: 440, duration: 0.3, wave: "sine", gain: 0.35 },
        { kind: "tone", freq: 523, duration: 0.3, wave: "sine", gain: 0.35, delay: 0.07 },
        { kind: "tone", freq: 659, duration: 0.3, wave: "sine", gain: 0.35, delay: 0.14 },
        { kind: "tone", freq: 831, duration: 0.3, wave: "sine", gain: 0.35, delay: 0.21 },
      ],
    },
  },
  // A ghost paradise or a scenario won: a short organ chord.
  ribbon: {
    id: "ribbon",
    bus: "sfx",
    gain: 0.85,
    synth: {
      voices: [
        { kind: "tone", freq: 220, duration: 0.45, wave: "triangle", gain: 0.35 },
        { kind: "tone", freq: 262, duration: 0.45, wave: "triangle", gain: 0.3, delay: 0.04 },
        { kind: "tone", freq: 330, duration: 0.45, wave: "triangle", gain: 0.3, delay: 0.08 },
      ],
    },
  },
  // The haunt fading, or an exorcist: three falling notes.
  bankrupt: {
    id: "bankrupt",
    bus: "sfx",
    gain: 0.8,
    synth: {
      voices: [
        { kind: "tone", freq: 311, duration: 0.18, wave: "triangle", gain: 0.4 },
        { kind: "tone", freq: 233, duration: 0.18, wave: "triangle", gain: 0.4, delay: 0.15 },
        { kind: "tone", freq: 175, duration: 0.22, wave: "triangle", gain: 0.4, delay: 0.3 },
      ],
    },
  },
  // The night bed under the haunt: wind over the pier and the sea beneath it, looped while it runs.
  moan: {
    id: "moan",
    bus: "sfx",
    loop: true,
    positional: false,
    synth: {
      voices: [
        { kind: "noise", duration: 2, filterFreq: 420, gain: 0.5, sustain: 2 },
        { kind: "noise", duration: 2, filterFreq: 900, filterType: "bandpass", gain: 0.18, sustain: 2 },
      ],
    },
  },
} satisfies Record<string, SoundDef>;

/** Loudness of the night bed while the haunt is running. */
const BED_GAIN = 0.3;
// Last gain sent to the bed loop, per runtime context (absent until the loop has started).
const bedGains = new ContextMap<number>();

/**
 * Keep the night bed in step with the haunt: it starts with the first run, and is muted while the
 * game is paused, faded, or showing the ghost-paradise screen. Cheap to call every tick; it only
 * touches the audio loop when the wanted level changes.
 */
export function syncAmbience(ctx: GameContext): void {
  if (!session.started) return;
  const previous = bedGains.get(ctx);
  if (previous === undefined) ctx.game.audio.loop("moan", "moan");
  const w = park.of(ctx);
  const audible = w.fact("park.game_over") !== true && !ctx.time.isPaused() && !(w.fact("park.won") === true && w.fact("park.win_dismissed") !== true);
  const gain = audible ? BED_GAIN : 0;
  bedGains.set(ctx, gain);
  if (gain !== previous) ctx.game.audio.setLoop("moan", { gain });
}
