import type { AudioEngine, AudioLevel } from "./audioEngine";

/** The read-only handle a capture script or devtools uses to prove the mix is producing sound. */
export interface AudioProbe {
  /** Master RMS and peak since the last read, `0..1`. Non-zero RMS means audio reached the output. */
  measure(): AudioLevel;
  /** Master gain after volume and mute. */
  masterLevel(): number;
  /** One bus's effective gain after its volume and mute. */
  busLevel(busId: string): number;
}

declare global {
  interface Window {
    __jgengineAudio?: AudioProbe;
  }
}

/**
 * Publish the audio engine's own level readout on `window.__jgengineAudio`, so a headless capture can
 * state a measured RMS instead of guessing from a screenshot. Reads only; it never plays or changes a bus.
 *
 * @capability audio-probe read the live master RMS/peak and bus gains from a running page for capture and diagnostics
 */
export function installAudioProbe(engine: AudioEngine): () => void {
  if (typeof window === "undefined") return () => undefined;
  const probe: AudioProbe = {
    measure: () => engine.measure(),
    masterLevel: () => engine.masterLevel(),
    busLevel: (busId) => engine.busLevel(busId),
  };
  window.__jgengineAudio = probe;
  return () => {
    if (window.__jgengineAudio === probe) delete window.__jgengineAudio;
  };
}
