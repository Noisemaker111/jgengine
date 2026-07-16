import type { AudioEngine } from "./audioEngine";

type AudioPlayPayload = { sound: string; at?: readonly [number, number, number] };
type AudioMusicPayload = { theme: string | null; transpose?: number };

/** Minimal event bus the shell wires to the audio engine. @internal */
export type AudioEventBus = {
  on(event: "audio.play", handler: (payload: AudioPlayPayload) => void): () => void;
  on(event: "audio.music", handler: (payload: AudioMusicPayload) => void): () => void;
  on(event: "audio.resume", handler: () => void): () => void;
};

/**
 * Subscribe game audio events to the shell audio engine.
 * Returns a single unsubscribe that tears all three listeners down.
 * @internal
 */
export function attachAudioEventWire(
  events: AudioEventBus,
  audioEngine: Pick<AudioEngine, "playOneShot" | "playMusic" | "resume">,
): () => void {
  const offPlay = events.on("audio.play", ({ sound, at }) => {
    audioEngine.playOneShot(sound, at === undefined ? undefined : { x: at[0], y: at[1], z: at[2] });
  });
  const offMusic = events.on("audio.music", ({ theme, transpose }) => {
    audioEngine.playMusic(theme, transpose === undefined ? undefined : { transpose });
  });
  const offResume = events.on("audio.resume", () => audioEngine.resume());
  return () => {
    offPlay();
    offMusic();
    offResume();
  };
}
