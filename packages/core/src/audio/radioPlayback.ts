import type { Radio, RadioCue } from "./radio";

/** How one radio voice id should sound when spoken by the browser's speech synthesiser. */
export interface RadioVoice {
  /** Substring of a preferred system voice name ("Daniel", "Female"); unmatched picks one by id. */
  name?: string;
  /** BCP 47 language prefix the voice must match. Default "en". */
  lang?: string;
  /** 0..2, default 1. */
  pitch?: number;
  /** 0.1..10, default 1. */
  rate?: number;
}

/** Spoken-line options carried to the shell's speech channel. */
export interface SpeakOptions extends RadioVoice {
  /** Stable key the shell hashes to pick the same system voice every time (a DJ keeps their voice). */
  voiceKey?: string;
}

/** The audio surface radio playback drives; `ctx.game.audio` satisfies it. */
export interface RadioAudioSink {
  music(theme: string | null, transpose?: number, options?: { offset?: number }): void;
  speak(text: string, options?: SpeakOptions): void;
  stopSpeech(): void;
}

/** Turns a {@link Radio}'s cues into music and speech. */
export interface RadioPlayback {
  /** Advance the radio `dt` seconds and play what the tuned station puts on air. Does nothing while paused. */
  tick(dt: number): void;
  /** Silence the radio without moving its clock (game paused). */
  pause(): void;
  /** Pick the tuned station back up at its offset. */
  resume(): void;
  paused(): boolean;
  /** Lines spoken so far (handy for a debug readout). */
  spoken(): number;
  /** The last cue played, for a debug readout. */
  last(): RadioCue | null;
  /** Playback's own state (paused, lines spoken); the radio itself snapshots separately. */
  snapshot(): RadioPlaybackSnapshot;
  /** Put a snapshot back. Restoring an unpaused playback re-cues the tuned station at its offset. */
  restore(next: RadioPlaybackSnapshot): void;
}

/** Serializable playback state from {@link RadioPlayback.snapshot}. */
export interface RadioPlaybackSnapshot {
  paused: boolean;
  spoken: number;
}

/**
 * Plays a radio through a game's audio seam with one call per tick: songs and beds as music themes
 * started at the station's offset (so a retune lands mid-song), lines through speech in the voice
 * mapped from their voice id. Pausing stops music and speech but not the radio's state; resuming
 * re-cues the current segment. Speech is best effort: with no system voice the shell drops it and the
 * HUD's now-playing line still carries the words.
 */
export function createRadioPlayback(
  radio: Radio,
  sink: RadioAudioSink,
  options: { voices?: Readonly<Record<string, RadioVoice>> } = {},
): RadioPlayback {
  const voices = options.voices ?? {};
  let isPaused = false;
  let spoken = 0;
  let last: RadioCue | null = null;

  function play(cue: RadioCue): void {
    last = cue;
    if (cue.kind === "off") {
      sink.stopSpeech();
      sink.music(null);
      return;
    }
    if (cue.kind === "segment") {
      sink.stopSpeech();
      if (cue.segment.theme === null) sink.music(null);
      else sink.music(cue.segment.theme, cue.segment.transpose === 0 ? undefined : cue.segment.transpose, { offset: cue.offset });
      return;
    }
    const voiceId = cue.line.voice;
    const voice = voiceId === null ? undefined : voices[voiceId];
    sink.speak(cue.line.text, { ...voice, ...(voiceId === null ? {} : { voiceKey: voiceId }) });
    spoken += 1;
  }

  return {
    tick(dt) {
      if (isPaused) return;
      for (const cue of radio.tick(dt)) play(cue);
    },
    pause() {
      if (isPaused) return;
      isPaused = true;
      radio.tick(0);
      sink.stopSpeech();
      sink.music(null);
    },
    resume() {
      if (!isPaused) return;
      isPaused = false;
      radio.cueCurrent();
      for (const cue of radio.tick(0)) play(cue);
    },
    paused: () => isPaused,
    spoken: () => spoken,
    last: () => last,
    snapshot: () => ({ paused: isPaused, spoken }),
    restore(next) {
      spoken = next.spoken;
      last = null;
      isPaused = next.paused;
      sink.stopSpeech();
      sink.music(null);
      if (isPaused) return;
      radio.cueCurrent();
      for (const cue of radio.tick(0)) play(cue);
    },
  };
}
