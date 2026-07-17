import type { AudioEmitterHandle, AudioEngine, Vec3 } from "./audioEngine";

type AudioPlayPayload = { sound: string; at?: readonly [number, number, number] };
type AudioMusicPayload = { theme: string | null; transpose?: number };
type AudioLoopStartPayload = { id: string; sound: string; at?: readonly [number, number, number] };
type AudioLoopSetPayload = { id: string; rate?: number; gain?: number; at?: readonly [number, number, number] };
type AudioLoopStopPayload = { id: string };

/** Minimal event bus the shell wires to the audio engine, including retained id-keyed loops (#1051). @internal */
export type AudioEventBus = {
  on(event: "audio.play", handler: (payload: AudioPlayPayload) => void): () => void;
  on(event: "audio.music", handler: (payload: AudioMusicPayload) => void): () => void;
  on(event: "audio.resume", handler: () => void): () => void;
  on(event: "audio.loopStart", handler: (payload: AudioLoopStartPayload) => void): () => void;
  on(event: "audio.loopSet", handler: (payload: AudioLoopSetPayload) => void): () => void;
  on(event: "audio.loopStop", handler: (payload: AudioLoopStopPayload) => void): () => void;
};

function toVec(at: readonly [number, number, number] | undefined): Vec3 | undefined {
  return at === undefined ? undefined : { x: at[0], y: at[1], z: at[2] };
}

/**
 * Subscribe game audio events to the shell audio engine. Manages the retained-loop registry
 * (`audio.loopStart`/`audio.loopSet`/`audio.loopStop`), keyed by stable id. Returns a single
 * unsubscribe that tears every listener down and stops any loops still playing.
 * @internal
 */
export function attachAudioEventWire(
  events: AudioEventBus,
  audioEngine: Pick<AudioEngine, "playOneShot" | "playLoop" | "playMusic" | "resume">,
): () => void {
  const loops = new Map<string, { sound: string; handle: AudioEmitterHandle }>();

  const offPlay = events.on("audio.play", ({ sound, at }) => {
    audioEngine.playOneShot(sound, toVec(at));
  });
  const offMusic = events.on("audio.music", ({ theme, transpose }) => {
    audioEngine.playMusic(theme, transpose === undefined ? undefined : { transpose });
  });
  const offResume = events.on("audio.resume", () => audioEngine.resume());

  const offLoopStart = events.on("audio.loopStart", ({ id, sound, at }) => {
    const existing = loops.get(id);
    if (existing !== undefined) {
      // Same sound: idempotent — keep the running source so a per-tick re-issue never clicks.
      if (existing.sound === sound) return;
      existing.handle.stop();
      loops.delete(id);
    }
    const handle = audioEngine.playLoop(sound, toVec(at));
    if (handle !== null) loops.set(id, { sound, handle });
  });
  const offLoopSet = events.on("audio.loopSet", ({ id, rate, gain, at }) => {
    const entry = loops.get(id);
    // Unknown id: a live update may race a stop — silently drop it.
    if (entry === undefined) return;
    if (rate !== undefined) entry.handle.setRate(rate);
    if (gain !== undefined) entry.handle.setGain(gain);
    if (at !== undefined) entry.handle.setPosition({ x: at[0], y: at[1], z: at[2] });
  });
  const offLoopStop = events.on("audio.loopStop", ({ id }) => {
    const entry = loops.get(id);
    if (entry === undefined) return;
    entry.handle.stop();
    loops.delete(id);
  });

  return () => {
    offPlay();
    offMusic();
    offResume();
    offLoopStart();
    offLoopSet();
    offLoopStop();
    for (const { handle } of loops.values()) handle.stop();
    loops.clear();
  };
}
