export type AudioBusId = string;

export type FalloffCurve = "linear" | "inverse" | "none";

export interface AudioFalloffConfig {
  /** Distance (world units) at/under which gain is 1. Default 1. */
  minDistance?: number;
  /** Distance at/beyond which gain is 0. Default 24. */
  maxDistance?: number;
  /** "linear" ramps 1→0 between min/max; "inverse" is an inverse-square-style rolloff clamped to the same range; "none" is always 1 (no distance attenuation). Default "linear". */
  curve?: FalloffCurve;
}

export interface AudioBusDef {
  id: AudioBusId;
  /** Bus volume multiplier, 0..1+. Default 1. */
  gain?: number;
}

export interface SoundDef {
  id: string;
  /** Playable source — a URL/data URI the shell's Web Audio glue fetches and decodes. */
  url: string;
  bus: AudioBusId;
  /** Base gain before bus/falloff multipliers. Default 1. */
  gain?: number;
  loop?: boolean;
  /** Positional emitters attenuate by distance from the listener; non-positional sounds (UI, music) play at flat gain. Default true. */
  positional?: boolean;
  falloff?: AudioFalloffConfig;
}

const DEFAULT_MIN_DISTANCE = 1;
const DEFAULT_MAX_DISTANCE = 24;

export function computeFalloffGain(distance: number, config: AudioFalloffConfig = {}): number {
  const curve = config.curve ?? "linear";
  if (curve === "none") return 1;
  const min = Math.max(0, config.minDistance ?? DEFAULT_MIN_DISTANCE);
  const max = Math.max(min + Number.EPSILON, config.maxDistance ?? DEFAULT_MAX_DISTANCE);
  const clamped = Math.max(0, distance);
  if (clamped <= min) return 1;
  if (clamped >= max) return 0;
  const t = (clamped - min) / (max - min);
  if (curve === "inverse") {
    const inv = min / clamped;
    const invAtMax = min / max;
    return Math.min(1, Math.max(0, (inv - invAtMax) / (1 - invAtMax)));
  }
  return 1 - t;
}

export function resolveEmitterGain(
  distance: number,
  sound: Pick<SoundDef, "gain" | "positional" | "falloff">,
  busGain: number,
): number {
  const base = sound.gain ?? 1;
  const spatial = sound.positional === false ? 1 : computeFalloffGain(distance, sound.falloff);
  return base * spatial * busGain;
}

export function distance3(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
