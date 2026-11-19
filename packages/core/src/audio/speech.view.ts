import { hashString } from "@jgengine/core/random/rng";
import type { SpeakOptions } from "@jgengine/core/audio/radioPlayback";

export interface SpeechVoiceLike {
  name: string;
  lang: string;
}

export interface SpeechUtteranceLike {
  text: string;
  voice: SpeechVoiceLike | null;
  volume: number;
  pitch: number;
  rate: number;
  lang: string;
}

export interface SpeechSynthesisLike {
  speak(utterance: SpeechUtteranceLike): void;
  cancel(): void;
  getVoices(): readonly SpeechVoiceLike[];
}

export interface SpeechStats {
  available: boolean;
  voices: number;
  spoken: number;
  dropped: number;
  last: string | null;
}

/** Text-to-speech on the browser's synthesiser with stable per-key voice choice and a silent fallback. */
export interface SpeechChannel {
  speak(text: string, options: SpeakOptions | undefined, volume: number): void;
  stop(): void;
  stats(): SpeechStats;
}

type UtteranceCtor = new (text: string) => SpeechUtteranceLike;

function resolveSynth(): { synth: SpeechSynthesisLike; Utterance: UtteranceCtor } | null {
  const scope = globalThis as unknown as { speechSynthesis?: SpeechSynthesisLike; SpeechSynthesisUtterance?: UtteranceCtor };
  if (scope.speechSynthesis === undefined || scope.SpeechSynthesisUtterance === undefined) return null;
  return { synth: scope.speechSynthesis, Utterance: scope.SpeechSynthesisUtterance };
}

export function pickSpeechVoice(voices: readonly SpeechVoiceLike[], options: SpeakOptions = {}): SpeechVoiceLike | null {
  const lang = (options.lang ?? "en").toLowerCase();
  const matching = voices.filter((voice) => voice.lang.toLowerCase().startsWith(lang));
  const pool = matching.length > 0 ? matching : voices;
  if (pool.length === 0) return null;
  const hint = options.name?.toLowerCase();
  if (hint !== undefined) {
    const named = pool.find((voice) => voice.name.toLowerCase().includes(hint));
    if (named !== undefined) return named;
  }
  const sorted = [...pool].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return sorted[hashString(options.voiceKey ?? options.name ?? "") % sorted.length]!;
}

/**
 * Speech for radio DJs, callers and announcers. Lines queue on the synthesiser; `stop` cancels the
 * queue. Without a synthesiser or a single voice (headless Chrome, tests, some Linux browsers) a line
 * is counted as dropped and nothing throws, so the game's on-screen text is the fallback.
 */
export function createSpeechChannel(
  backend: { synth: SpeechSynthesisLike; Utterance: UtteranceCtor } | null = resolveSynth(),
): SpeechChannel {
  const stats: SpeechStats = { available: false, voices: 0, spoken: 0, dropped: 0, last: null };
  return {
    speak(text, options, volume) {
      stats.last = text;
      if (backend === null) {
        stats.dropped += 1;
        return;
      }
      let voices: readonly SpeechVoiceLike[] = [];
      try {
        voices = backend.synth.getVoices();
      } catch {
        voices = [];
      }
      stats.voices = voices.length;
      const voice = pickSpeechVoice(voices, options);
      stats.available = voice !== null;
      if (voice === null || volume <= 0) {
        stats.dropped += 1;
        return;
      }
      try {
        const utterance = new backend.Utterance(text);
        utterance.voice = voice;
        utterance.lang = voice.lang;
        utterance.volume = Math.max(0, Math.min(1, volume));
        utterance.pitch = Math.max(0, Math.min(2, options?.pitch ?? 1));
        utterance.rate = Math.max(0.1, Math.min(10, options?.rate ?? 1));
        backend.synth.speak(utterance);
        stats.spoken += 1;
      } catch {
        stats.dropped += 1;
      }
    },
    stop() {
      try {
        backend?.synth.cancel();
      } catch {
        // A synthesiser torn down mid-page has nothing left to cancel.
      }
    },
    stats: () => ({ ...stats }),
  };
}
