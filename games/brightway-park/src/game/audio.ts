import type { SoundDef } from "@jgengine/core/audio/audioFalloff";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { session } from "./session";
import { park } from "./park";

/**
 * Procedural cues for the park's bright, friendly moments. Each id is played from the code path
 * that accepted the action (or the day/milestone event), so a cue never fires for a rejected click.
 * Synth patches need no asset files and keep to a light, music-box palette.
 */
export const BRIGHTWAY_SOUNDS: Record<string, SoundDef> = {
  // A ride or stall set down on the grass: a soft wooden plop with a little air.
  place: {
    id: "place",
    bus: "sfx",
    gain: 0.8,
    falloff: { minDistance: 40, maxDistance: 160, curve: "linear" },
    synth: {
      voices: [
        { kind: "tone", freq: 520, slideTo: 780, duration: 0.12, wave: "triangle", gain: 0.5 },
        { kind: "noise", duration: 0.05, filterFreq: 2400, filterType: "bandpass", gain: 0.25 },
      ],
    },
  },
  // Demolish for a refund: a quick coin clink, two bright notes.
  sell: {
    id: "sell",
    bus: "sfx",
    gain: 0.8,
    falloff: { minDistance: 40, maxDistance: 160, curve: "linear" },
    synth: {
      voices: [
        { kind: "tone", freq: 1320, duration: 0.1, wave: "triangle", gain: 0.4 },
        { kind: "tone", freq: 1760, duration: 0.16, wave: "triangle", gain: 0.35, delay: 0.06 },
      ],
    },
  },
  // A rejected build (not enough cash, or no room): a soft, friendly two-step "nope".
  denied: {
    id: "denied",
    bus: "sfx",
    gain: 0.8,
    synth: {
      voices: [
        { kind: "tone", freq: 196, duration: 0.14, wave: "triangle", gain: 0.4 },
        { kind: "tone", freq: 147, duration: 0.2, wave: "triangle", gain: 0.4, delay: 0.1 },
      ],
    },
  },
  // Ticket price nudged up or down: a tiny ticket-machine tick.
  ticket: {
    id: "ticket",
    bus: "sfx",
    gain: 0.6,
    synth: {
      voices: [{ kind: "tone", freq: 1046, duration: 0.07, wave: "sine", gain: 0.4 }],
    },
  },
  // Gates open for the day: a two-bell chime.
  gates: {
    id: "gates",
    bus: "sfx",
    gain: 0.8,
    synth: {
      voices: [
        { kind: "tone", freq: 784, duration: 0.5, wave: "sine", gain: 0.45 },
        { kind: "tone", freq: 1175, duration: 0.45, wave: "sine", gain: 0.3, delay: 0.12 },
      ],
    },
  },
  // Midnight settlement: a rising three-note arpeggio.
  settle: {
    id: "settle",
    bus: "sfx",
    gain: 0.8,
    synth: {
      voices: [
        { kind: "tone", freq: 523, duration: 0.25, wave: "triangle", gain: 0.35 },
        { kind: "tone", freq: 659, duration: 0.25, wave: "triangle", gain: 0.35, delay: 0.08 },
        { kind: "tone", freq: 784, duration: 0.25, wave: "triangle", gain: 0.35, delay: 0.16 },
      ],
    },
  },
  // A milestone unlock: a little sparkle run up the glockenspiel.
  milestone: {
    id: "milestone",
    bus: "sfx",
    gain: 0.8,
    synth: {
      voices: [
        { kind: "tone", freq: 784, duration: 0.3, wave: "sine", gain: 0.35 },
        { kind: "tone", freq: 988, duration: 0.3, wave: "sine", gain: 0.35, delay: 0.07 },
        { kind: "tone", freq: 1319, duration: 0.3, wave: "sine", gain: 0.35, delay: 0.14 },
        { kind: "tone", freq: 1568, duration: 0.3, wave: "sine", gain: 0.35, delay: 0.21 },
      ],
    },
  },
  // Blue ribbon awarded: a short bright fanfare.
  ribbon: {
    id: "ribbon",
    bus: "sfx",
    gain: 0.85,
    synth: {
      voices: [
        { kind: "tone", freq: 523, duration: 0.12, wave: "triangle", gain: 0.4 },
        { kind: "tone", freq: 659, duration: 0.12, wave: "triangle", gain: 0.4, delay: 0.1 },
        { kind: "tone", freq: 784, duration: 0.38, wave: "triangle", gain: 0.45, delay: 0.2 },
      ],
    },
  },
  // Bankruptcy: three falling, gentle notes so the defeat stays light.
  bankrupt: {
    id: "bankrupt",
    bus: "sfx",
    gain: 0.8,
    synth: {
      voices: [
        { kind: "tone", freq: 392, duration: 0.18, wave: "triangle", gain: 0.4 },
        { kind: "tone", freq: 311, duration: 0.18, wave: "triangle", gain: 0.4, delay: 0.15 },
        { kind: "tone", freq: 233, duration: 0.22, wave: "triangle", gain: 0.4, delay: 0.3 },
      ],
    },
  },
  // Quiet seaside bed under the park: a soft wash of surf-like noise, looped while the park runs.
  sea: {
    id: "sea",
    bus: "sfx",
    loop: true,
    positional: false,
    synth: {
      voices: [
        { kind: "noise", duration: 2, filterFreq: 700, gain: 0.5, sustain: 2 },
        { kind: "noise", duration: 2, filterFreq: 1400, filterType: "bandpass", gain: 0.2, sustain: 2 },
      ],
    },
  },
};

/** Loudness of the sea bed while the park is open and running. */
const SEA_GAIN = 0.3;
// Last gain sent to the sea loop, per runtime context (absent until the loop has started).
const seaGains = new WeakMap<GameContext, number>();

/**
 * Keep the sea bed in step with the park: it starts with the first run, and is muted while the
 * game is paused, bankrupt, or showing the blue-ribbon screen. Cheap to call every tick; it only
 * touches the audio loop when the wanted level changes.
 */
export function syncAmbience(ctx: GameContext): void {
  if (!session.started) return;
  const previous = seaGains.get(ctx);
  if (previous === undefined) ctx.game.audio.loop("sea", "sea");
  const w = park.of(ctx);
  const audible = w.fact("park.game_over") !== true && !ctx.time.isPaused() && !(w.fact("park.won") === true && w.fact("park.win_dismissed") !== true);
  const gain = audible ? SEA_GAIN : 0;
  seaGains.set(ctx, gain);
  if (gain !== previous) ctx.game.audio.setLoop("sea", { gain });
}
