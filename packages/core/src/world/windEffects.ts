// @skill jgengine-world
/**
 * The physical terms a {@link windField} can carry, each its own effect with its own `strength`:
 * a mean speed that grows with height over the ground's roughness (the logarithmic law), and gusts
 * drawn from the along-wind turbulence spectrum, both as EN 1991-1-4 (Eurocode 1, wind actions)
 * gives them. `scripts/reference/environment/windProfile.ts` reproduces the published numbers.
 *
 * @capability wind-effects log-law wind profile and spectral gusts over a surface class, each a 0-upward strength dial
 */
import { hashUnit } from "../random/rng";

/** The ground a wind blows over, by EN 1991-1-4 Table 4.1 terrain category: sea (0), open grass (II), forest (III), city (IV). */
export type WindSurfaceClass = "openWater" | "grass" | "forest" | "city";

/** Roughness of one surface class: roughness length z₀ and the height below which the profile stops falling, both metres. */
export interface WindSurfaceRoughness {
  roughnessLengthM: number;
  minHeightM: number;
}

/** EN 1991-1-4 Table 4.1: z₀ and z_min per terrain category. */
export const WIND_SURFACE_ROUGHNESS: Readonly<Record<WindSurfaceClass, WindSurfaceRoughness>> = {
  openWater: { roughnessLengthM: 0.003, minHeightM: 1 },
  grass: { roughnessLengthM: 0.05, minHeightM: 2 },
  forest: { roughnessLengthM: 0.3, minHeightM: 5 },
  city: { roughnessLengthM: 1, minHeightM: 10 },
};

/**
 * The `profile` effect: mean speed scales with height as ln(z/z₀)/ln(z_ref/z₀), so `speed` is the mean at the reference
 * height. `strength` is an exponent on that ratio: `0` the same speed at every height, `1` the log law, past `1` a steeper
 * shear; finite, bounded and monotone over the sane range `0..4`.
 */
export interface WindProfileEffect {
  strength?: number;
  /** Height the field's `speed` is measured at, m. Default 10 (the meteorological standard). */
  referenceHeightM?: number;
}

/**
 * The `gusts` effect: along-wind gusts whose variance is (strength · I_v · U)² and whose spectrum is the EN 1991-1-4
 * Annex B form S_L(f_L) = 6.8 f_L / (1 + 10.2 f_L)^(5/3), carried downwind at the mean speed (Taylor's frozen
 * turbulence). `strength` `0` is no gusts, `1` the published intensity, past `1` gustier; the standard deviation is
 * linear in it, so it stays finite and monotone over the sane range `0..4`.
 */
export interface WindGustEffect {
  strength?: number;
  /** Turbulence intensity I_v; default the surface class's 1/ln(z/z₀) at each height (EN 1991-1-4 eq. 4.7, k_I = c₀ = 1). */
  intensity?: number;
  /** Turbulence length scale at 10 m, m; default EN 1991-1-4 eq. B.1 for the surface class. */
  scaleLengthM?: number;
  /** Spectral components summed; more is smoother and costs more per sample. Default 32. */
  components?: number;
}

/** The physical effects a wind field carries; one optional field on `WindFieldConfig`. Plain data. */
export interface WindEffects {
  /** Surface class the effects read their roughness from. Default `"grass"`. */
  surface?: WindSurfaceClass;
  /** Roughness length z₀ override, m. */
  roughnessLengthM?: number;
  /** Minimum height override, m. */
  minHeightM?: number;
  profile?: WindProfileEffect;
  gusts?: WindGustEffect;
}

function dial(value: number | undefined): number {
  if (value === undefined) return 1;
  if (!Number.isFinite(value) || value < 0) throw new Error(`wind effect strength must be finite and >= 0 (got ${value})`);
  return value;
}

/**
 * The roughness a set of effects resolves to.
 * @capability wind-effects log-law wind profile and spectral gusts over a surface class, each a 0-upward strength dial
 */
export function windRoughness(effects: Pick<WindEffects, "surface" | "roughnessLengthM" | "minHeightM">): WindSurfaceRoughness {
  const base = WIND_SURFACE_ROUGHNESS[effects.surface ?? "grass"];
  return { roughnessLengthM: effects.roughnessLengthM ?? base.roughnessLengthM, minHeightM: effects.minHeightM ?? base.minHeightM };
}

function clampHeight(heightM: number, roughness: WindSurfaceRoughness): number {
  const floor = Math.max(roughness.minHeightM, roughness.roughnessLengthM * 1.0001);
  return Number.isFinite(heightM) ? Math.min(1e5, Math.max(floor, heightM)) : floor;
}

/**
 * Mean speed at `heightM` over the mean speed at the reference height, raised to the profile strength.
 * @capability wind-effects log-law wind profile and spectral gusts over a surface class, each a 0-upward strength dial
 */
export function windProfileFactor(heightM: number, roughness: WindSurfaceRoughness, referenceHeightM = 10, strength = 1): number {
  const z0 = roughness.roughnessLengthM;
  const ratio = Math.log(clampHeight(heightM, roughness) / z0) / Math.log(clampHeight(referenceHeightM, roughness) / z0);
  return strength === 0 ? 1 : ratio ** strength;
}

/**
 * Turbulence intensity I_v(z) = 1 / ln(z/z₀) (EN 1991-1-4 eq. 4.7 with k_I = c₀ = 1).
 * @capability wind-effects log-law wind profile and spectral gusts over a surface class, each a 0-upward strength dial
 */
export function windTurbulenceIntensity(heightM: number, roughness: WindSurfaceRoughness): number {
  return 1 / Math.log(clampHeight(heightM, roughness) / roughness.roughnessLengthM);
}

/**
 * Turbulence length scale L(z) = 300 (z/200)^α, α = 0.67 + 0.05 ln z₀ (EN 1991-1-4 eq. B.1), metres.
 * @capability wind-effects log-law wind profile and spectral gusts over a surface class, each a 0-upward strength dial
 */
export function windTurbulenceScale(heightM: number, roughness: WindSurfaceRoughness): number {
  const alpha = 0.67 + 0.05 * Math.log(roughness.roughnessLengthM);
  return 300 * (clampHeight(heightM, roughness) / 200) ** alpha;
}

/**
 * The non-dimensional along-wind spectrum S_L(f_L) = n S(n)/σ² = 6.8 f_L / (1 + 10.2 f_L)^(5/3) (EN 1991-1-4 eq. B.2).
 * @capability wind-effects log-law wind profile and spectral gusts over a surface class, each a 0-upward strength dial
 */
export function windGustSpectrum(fL: number): number {
  return fL <= 0 ? 0 : (6.8 * fL) / (1 + 10.2 * fL) ** (5 / 3);
}

/**
 * Share of the gust variance below f_L: the closed-form integral of {@link windGustSpectrum}, 1 − (1 + 10.2 f_L)^(−2/3).
 * @capability wind-effects log-law wind profile and spectral gusts over a surface class, each a 0-upward strength dial
 */
export function windGustVarianceBelow(fL: number): number {
  return fL <= 0 ? 0 : 1 - (1 + 10.2 * fL) ** (-2 / 3);
}

/** A resolved gust synthesis: normalized frequencies f_L, amplitudes (σ = 1) and phases. */
export interface WindGustSynthesis {
  readonly frequencies: Float64Array;
  readonly amplitudes: Float64Array;
  readonly phases: Float64Array;
}

const LOW_SHARE = 0.002;
const HIGH_SHARE = 0.985;

function inverseShare(share: number): number {
  return ((1 - share) ** -1.5 - 1) / 10.2;
}

/**
 * Split the spectrum into `components` log-spaced bands covering 0.2%..98.5% of its variance, one cosine per band at the
 * band's geometric centre with the band's variance, renormalized so the sum has unit variance.
 * @capability wind-effects log-law wind profile and spectral gusts over a surface class, each a 0-upward strength dial
 */
export function windGustSynthesis(components: number, seed: string): WindGustSynthesis {
  const count = Math.max(4, Math.min(256, Math.round(components)));
  const lo = Math.log(inverseShare(LOW_SHARE));
  const hi = Math.log(inverseShare(HIGH_SHARE));
  const frequencies = new Float64Array(count);
  const amplitudes = new Float64Array(count);
  const phases = new Float64Array(count);
  let total = 0;
  for (let k = 0; k < count; k += 1) {
    const a = Math.exp(lo + ((hi - lo) * k) / count);
    const b = Math.exp(lo + ((hi - lo) * (k + 1)) / count);
    const share = windGustVarianceBelow(b) - windGustVarianceBelow(a);
    frequencies[k] = Math.sqrt(a * b);
    amplitudes[k] = share;
    phases[k] = 2 * Math.PI * hashUnit(`${seed}:gust:${k}`);
    total += share;
  }
  for (let k = 0; k < count; k += 1) amplitudes[k] = Math.sqrt((2 * (amplitudes[k] ?? 0)) / total);
  return { frequencies, amplitudes, phases };
}

/** The prepared effects a field samples each call. */
export interface PreparedWindEffects {
  readonly roughness: WindSurfaceRoughness;
  readonly referenceHeightM: number;
  readonly profileStrength: number;
  readonly gustStrength: number;
  readonly gustIntensity: number | undefined;
  readonly gustScaleLengthM: number | undefined;
  readonly synthesis: WindGustSynthesis | null;
  /** Mean speed at `heightM` for a field whose reference-height mean is `speed`. */
  meanAt(speed: number, heightM: number): number;
  /** Along-wind gust, m/s, at `heightM`, mean speed `mean`, time `t` and downwind distance `along`. */
  gustAt(mean: number, heightM: number, t: number, along: number): number;
}

/**
 * Resolve effects once for a field.
 * @internal
 */
export function prepareWindEffects(effects: WindEffects, seed: string): PreparedWindEffects {
  const roughness = windRoughness(effects);
  if (!(roughness.roughnessLengthM > 0) || !Number.isFinite(roughness.roughnessLengthM)) throw new Error("wind roughnessLengthM must be finite and > 0");
  if (!(roughness.minHeightM >= 0) || !Number.isFinite(roughness.minHeightM)) throw new Error("wind minHeightM must be finite and >= 0");
  const referenceHeightM = effects.profile?.referenceHeightM ?? 10;
  if (!(referenceHeightM > 0) || !Number.isFinite(referenceHeightM)) throw new Error("wind referenceHeightM must be finite and > 0");
  const profileStrength = effects.profile === undefined ? 0 : dial(effects.profile.strength);
  const gustStrength = effects.gusts === undefined ? 0 : dial(effects.gusts.strength);
  const gustIntensity = effects.gusts?.intensity;
  const gustScaleLengthM = effects.gusts?.scaleLengthM;
  const synthesis = gustStrength > 0 ? windGustSynthesis(effects.gusts?.components ?? 32, seed) : null;
  const meanAt = (speed: number, heightM: number): number => speed * windProfileFactor(heightM, roughness, referenceHeightM, profileStrength);
  const gustAt = (mean: number, heightM: number, t: number, along: number): number => {
    if (synthesis === null) return 0;
    const intensity = gustIntensity ?? windTurbulenceIntensity(heightM, roughness);
    const sigma = gustStrength * intensity * Math.abs(mean);
    if (sigma === 0) return 0;
    const scale = gustScaleLengthM === undefined ? windTurbulenceScale(heightM, roughness) : gustScaleLengthM * windTurbulenceScale(heightM, roughness) / windTurbulenceScale(10, roughness);
    // Frozen turbulence: the gust pattern is a function of (U t - x) carried downwind at the mean speed.
    const travel = (Math.abs(mean) * t - along) / scale;
    let sum = 0;
    for (let k = 0; k < synthesis.frequencies.length; k += 1) {
      sum += (synthesis.amplitudes[k] ?? 0) * Math.cos(2 * Math.PI * (synthesis.frequencies[k] ?? 0) * travel + (synthesis.phases[k] ?? 0));
    }
    return sigma * sum;
  };
  return { roughness, referenceHeightM, profileStrength, gustStrength, gustIntensity, gustScaleLengthM, synthesis, meanAt, gustAt };
}

const SURFACES: readonly string[] = Object.keys(WIND_SURFACE_ROUGHNESS);

/**
 * Throw on effects an authored document must not persist: unknown keys or surface, a negative or non-finite number.
 * @capability wind-effects log-law wind profile and spectral gusts over a surface class, each a 0-upward strength dial
 */
export function validateWindEffects(value: WindEffects): void {
  const record = (input: unknown, keys: readonly string[], label: string): Record<string, unknown> => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error(`${label} must be an object`);
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(input)) {
      if (!keys.includes(key)) throw new Error(`${label} has unknown key "${key}"`);
      out[key] = entry;
    }
    return out;
  };
  const number = (input: unknown, label: string): void => {
    if (input === undefined) return;
    if (typeof input !== "number" || !Number.isFinite(input) || input < 0 || input > 1e6) throw new Error(`${label} must be a finite number in 0..1e6`);
  };
  const effects = record(value, ["surface", "roughnessLengthM", "minHeightM", "profile", "gusts"], "wind.effects");
  if (effects["surface"] !== undefined && !SURFACES.includes(String(effects["surface"]))) throw new Error(`wind.effects.surface must be one of ${SURFACES.join(", ")}`);
  number(effects["roughnessLengthM"], "wind.effects.roughnessLengthM");
  number(effects["minHeightM"], "wind.effects.minHeightM");
  if (effects["profile"] !== undefined) {
    const profile = record(effects["profile"], ["strength", "referenceHeightM"], "wind.effects.profile");
    number(profile["strength"], "wind.effects.profile.strength");
    number(profile["referenceHeightM"], "wind.effects.profile.referenceHeightM");
  }
  if (effects["gusts"] !== undefined) {
    const gusts = record(effects["gusts"], ["strength", "intensity", "scaleLengthM", "components"], "wind.effects.gusts");
    for (const key of ["strength", "intensity", "scaleLengthM", "components"]) number(gusts[key], `wind.effects.gusts.${key}`);
  }
  prepareWindEffects(value, "validate");
}
