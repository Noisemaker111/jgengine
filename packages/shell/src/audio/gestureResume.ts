import type { AudioEngine } from "./audioEngine";

/**
 * Resume the audio context on the first real user gesture. Chrome keeps a freshly created
 * `AudioContext` suspended until the page sees a trusted input, so pressing a key, tapping or clicking
 * is the only moment sound may start; the engine then flushes any cue it held. One listener set per
 * game, removed on unmount.
 *
 * @capability gesture-resume unlock the audio context on the first pointer/key/touch gesture, so pre-gesture cues play instead of vanishing
 */
export function installGestureResume(
  engine: Pick<AudioEngine, "resume">,
  target: Pick<Document, "addEventListener" | "removeEventListener"> | null = typeof document === "undefined" ? null : document,
): () => void {
  if (target === null) return () => undefined;
  const resume = () => {
    engine.resume();
    detach();
  };
  const detach = () => {
    target.removeEventListener("pointerdown", resume, true);
    target.removeEventListener("keydown", resume, true);
    target.removeEventListener("touchstart", resume, true);
  };
  target.addEventListener("pointerdown", resume, true);
  target.addEventListener("keydown", resume, true);
  target.addEventListener("touchstart", resume, true);
  return detach;
}
