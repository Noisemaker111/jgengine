/**
 * The short, quiet click a menu makes when the selection moves or is confirmed. Generated with an
 * oscillator instead of shipped as an audio file, so a game gets menu feedback without authoring a
 * sound and the whole thing unmounts with the screen.
 */

/** Which feedback sound to play. */
export type GameMenuSoundKind = "move" | "confirm" | "back";

/** The sound player's readable state: on/off, gain, and whether audio is actually running. */
export interface GameMenuSoundState {
  /** Whether the player will make sound. */
  enabled: boolean;
  /** Peak gain per tick. */
  volume: number;
  /** Whether an audio context exists and is running - what a test or a settings preview reads. */
  ready: boolean;
}

/** A menu sound player. Give it to `GameMenu`'s `sound` prop, or call its methods from your own menu. */
export interface GameMenuSound {
  /** Play one tick. A no-op when audio is unavailable or the browser blocked it. */
  play(kind: GameMenuSoundKind): void;
  /** Release the audio context. Safe to call twice. */
  dispose(): void;
  /** Read the player state without starting audio. */
  state(): GameMenuSoundState;
  /** Apply a saved player state - a settings toggle muting the menu without rebuilding it. */
  restore(next: GameMenuSoundState): void;
}

/** How {@link createGameMenuSound} is tuned. */
export interface GameMenuSoundConfig {
  /** Turn sound off entirely. Default true. */
  enabled?: boolean;
  /** Peak gain per tick. Default 0.045 — audible, never a jingle. */
  volume?: number;
}

const TONES: Record<GameMenuSoundKind, { frequency: number; ms: number; gain: number }> = {
  move: { frequency: 880, ms: 26, gain: 1 },
  confirm: { frequency: 1320, ms: 52, gain: 1.25 },
  back: { frequency: 587, ms: 40, gain: 0.9 },
};

/**
 * A tiny WebAudio click generator for menu feedback: one oscillator burst per tick, created on the
 * first play (so a browser autoplay policy does not log an error at mount) and reused after.
 *
 * @capability menu-sound generated click for menu move/confirm/back, no audio asset
 */
export function createGameMenuSound(config: GameMenuSoundConfig = {}): GameMenuSound {
  let enabled = config.enabled ?? true;
  let volume = config.volume ?? 0.045;
  let context: AudioContext | null = null;
  let broken = false;

  function ensure(): AudioContext | null {
    if (!enabled || broken) return null;
    if (context !== null) return context;
    const Ctor =
      typeof globalThis.AudioContext === "function"
        ? globalThis.AudioContext
        : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor === undefined) {
      broken = true;
      return null;
    }
    try {
      context = new Ctor();
      return context;
    } catch {
      broken = true;
      return null;
    }
  }

  return {
    play(kind) {
      const audio = ensure();
      if (audio === null) return;
      if (audio.state === "suspended") void audio.resume().catch(() => {});
      const tone = TONES[kind];
      const start = audio.currentTime;
      const end = start + tone.ms / 1000;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(tone.frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(tone.frequency * 1.18, end);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume * tone.gain, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(end + 0.01);
    },
    state() {
      return { enabled, volume, ready: context !== null && context.state === "running" };
    },
    restore(next) {
      enabled = next.enabled;
      volume = next.volume;
      if (!enabled) this.dispose();
    },
    dispose() {
      const audio = context;
      context = null;
      if (audio !== null) void audio.close().catch(() => {});
    },
  };
}



