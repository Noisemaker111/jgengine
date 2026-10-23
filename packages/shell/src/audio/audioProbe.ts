import type { AudioAmbienceState, AudioEngine, AudioLevel, AudioOcclusionStats } from "./audioEngine";

/** The read-only handle a capture script or devtools uses to prove the mix is producing sound. */
export interface AudioProbe {
  /** Master RMS and peak since the last read, `0..1`. Non-zero RMS means audio reached the output. */
  measure(): AudioLevel;
  /** Master gain after volume and mute. */
  masterLevel(): number;
  /** One bus's effective gain after its volume, mute and any active duck. */
  busLevel(busId: string): number;
  /** Current zone mix, so a capture can state which zone bed is audible and at what level. */
  ambience(): AudioAmbienceState;
  /** Cumulative geometry-occlusion cost, so a capture can state the measured per-test price. */
  occlusion(): AudioOcclusionStats;
}

declare global {
  interface Window {
    __jgengineAudio?: AudioProbe;
  }
}

/**
 * Publish the audio engine's own level, ambience and occlusion readouts on `window.__jgengineAudio`,
 * so a headless capture can state measured values instead of guessing from a screenshot. Reads only;
 * it never plays or changes a bus.
 *
 * @capability audio-probe read the live master RMS/peak, bus gains, ambience zone mix and occlusion cost from a running page for capture and diagnostics
 */
export function installAudioProbe(engine: AudioEngine): () => void {
  if (typeof window === "undefined") return () => undefined;
  const probe: AudioProbe = {
    measure: () => engine.measure(),
    masterLevel: () => engine.masterLevel(),
    busLevel: (busId) => engine.busLevel(busId),
    ambience: () => engine.ambience(),
    occlusion: () => engine.occlusionStats(),
  };
  window.__jgengineAudio = probe;
  return () => {
    if (window.__jgengineAudio === probe) delete window.__jgengineAudio;
  };
}
