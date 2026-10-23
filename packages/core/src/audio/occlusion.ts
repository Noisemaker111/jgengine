/**
 * Geometry occlusion for retained positional loops: a cheap line test between the listener and an
 * emitter behind blocking geometry, bounded so a busy scene can never turn audio into a raycast
 * pass. The shell runs the test against the scene's blockable colliders; the engine applies the
 * resulting attenuation and low-pass to the loop it already owns.
 * @capability audio-occlusion an emitter behind blocking world geometry is attenuated and darkened by a budgeted line test, and falls back to distance-only once the tick's budget is spent.
 */
export interface AudioOcclusionConfig {
  /** Geometry tests shared by every retained loop in one listener tick. Default 8; 0 keeps distance-only. */
  maxTestsPerTick?: number;
  /** Minimum milliseconds before the same loop is tested again. Default 150. */
  intervalMs?: number;
  /** Gain multiplier at full blockage; 1 disables attenuation. Default 0.55. */
  attenuation?: number;
  /** Low-pass cutoff at full blockage in Hz. Default 1200; a loop already darker keeps its own cutoff. */
  lowpassHz?: number;
  /** Loops farther than this from the listener are never tested. Default 60. */
  maxDistance?: number;
}

/** Defaults for {@link AudioOcclusionConfig}. */
export const AUDIO_OCCLUSION_DEFAULTS = {
  maxTestsPerTick: 8,
  intervalMs: 150,
  attenuation: 0.55,
  lowpassHz: 1200,
  maxDistance: 60,
} as const;

/** A fully specified occlusion policy, with every unset field replaced by its default. */
export interface ResolvedAudioOcclusionConfig {
  maxTestsPerTick: number;
  intervalMs: number;
  attenuation: number;
  lowpassHz: number;
  maxDistance: number;
}

function finite(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

/**
 * Fill in the occlusion defaults and clamp each field to a workable range: a finite test budget,
 * a non-negative retest interval and distance cap, and an attenuation in `0..1`.
 */
export function resolveOcclusionConfig(config: AudioOcclusionConfig | false = {}): ResolvedAudioOcclusionConfig {
  if (config === false) {
    return { ...AUDIO_OCCLUSION_DEFAULTS, maxTestsPerTick: 0 };
  }
  return {
    maxTestsPerTick: Math.max(0, Math.floor(finite(config.maxTestsPerTick, AUDIO_OCCLUSION_DEFAULTS.maxTestsPerTick))),
    intervalMs: Math.max(0, finite(config.intervalMs, AUDIO_OCCLUSION_DEFAULTS.intervalMs)),
    attenuation: Math.min(1, Math.max(0, finite(config.attenuation, AUDIO_OCCLUSION_DEFAULTS.attenuation))),
    lowpassHz: Math.max(10, finite(config.lowpassHz, AUDIO_OCCLUSION_DEFAULTS.lowpassHz)),
    maxDistance: Math.max(0, finite(config.maxDistance, AUDIO_OCCLUSION_DEFAULTS.maxDistance)),
  };
}
