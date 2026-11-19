import type { AudioEngine } from "./audioEngine.view";

/** @capability gesture-resume unlock the audio context on the first pointer/key/touch gesture, so pre-gesture cues play instead of vanishing */
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
