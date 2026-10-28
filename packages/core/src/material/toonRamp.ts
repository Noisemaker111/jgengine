// @skill jgengine-world
/**
 * A cel-shading ramp: how diffuse light (0 facing away .. 1 facing the light) maps to brightness. A
 * game builds its toon look from one, and the draw side turns it into a toon material's gradient.
 * @capability toon-ramp cel-shading ramp a toon material reads: flat light bands with an optional soft edge
 */
export interface ToonRamp {
  /** Flat light steps, 2..8. */
  bands: number;
  /** 0 hard band edges .. 1 edges blended across a whole band. */
  softness: number;
  /** Brightness of the darkest band, 0..1. */
  shadow: number;
}

/** Texels across a ramp texture: enough for 8 bands with blended edges. */
export const TOON_RAMP_TEXELS = 64;

/** A ramp with every value clamped to its range. */
export function normalizeToonRamp(ramp: ToonRamp): ToonRamp {
  return {
    bands: Math.max(2, Math.min(8, Math.round(ramp.bands))),
    softness: Math.max(0, Math.min(1, ramp.softness)),
    shadow: Math.max(0, Math.min(1, ramp.shadow)),
  };
}

/** A stable key for a ramp, for caching the material built from it. */
export function toonRampKey(ramp: ToonRamp): string {
  const { bands, softness, shadow } = normalizeToonRamp(ramp);
  return `${bands}/${softness.toFixed(3)}/${shadow.toFixed(3)}`;
}

/**
 * The ramp as {@link TOON_RAMP_TEXELS} brightness bytes, dark to light: band k of n sits at
 * shadow + (1 - shadow) · k / (n - 1), and `softness` blends each step into the next.
 */
export function toonRampTexels(ramp: ToonRamp): Uint8Array {
  const { bands, softness, shadow } = normalizeToonRamp(ramp);
  const out = new Uint8Array(TOON_RAMP_TEXELS);
  const level = (band: number): number => shadow + ((1 - shadow) * band) / (bands - 1);
  for (let i = 0; i < TOON_RAMP_TEXELS; i += 1) {
    const x = ((i + 0.5) / TOON_RAMP_TEXELS) * bands;
    const band = Math.min(bands - 1, Math.floor(x));
    const within = x - band;
    const edge = softness * 0.5;
    let value = level(band);
    // Blend across the top of a band into the next one, so a soft ramp has no hard step.
    if (edge > 0 && band < bands - 1 && within > 1 - edge) {
      const t = (within - (1 - edge)) / edge;
      value += (level(band + 1) - value) * t * 0.5;
    }
    if (edge > 0 && band > 0 && within < edge) {
      const t = 1 - within / edge;
      value += (level(band - 1) - value) * t * 0.5;
    }
    out[i] = Math.round(Math.max(0, Math.min(1, value)) * 255);
  }
  return out;
}
