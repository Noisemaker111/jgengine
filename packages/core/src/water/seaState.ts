import { seededRng } from "../random/rng";

const GRAVITY = 9.81;
const SEA_DENSITY = 1025;

/** A sea spectrum by significant height and peak period; `peakEnhancement` 1 is Pierson–Moskowitz, 3.3 the mean JONSWAP sea. */
export interface SeaStateSpectrum {
  /** Significant wave height `Hs = 4√m0`, m. */
  significantHeight: number;
  /** Peak period `Tp`, s. */
  peakPeriod: number;
  /** JONSWAP peak enhancement `γ` (default `1`, Pierson–Moskowitz). */
  peakEnhancement?: number;
}

/** One regular deep-water component: `η = a·cos(k·(x·cos θ + z·sin θ) − ω·t + φ)` on the XZ plane. */
export interface WaveFieldComponent {
  /** Amplitude, m. */
  amplitude: number;
  /** Circular frequency, rad/s. */
  frequency: number;
  /** Wavenumber `ω²/g`, rad/m. */
  wavenumber: number;
  /** Heading the wave travels toward, rad on the XZ plane (`0` = +X, `π/2` = +Z). */
  direction: number;
  /** Phase, rad. */
  phase: number;
}

/**
 * A sea state as plain data: a sum of regular components on a still level. The boat (`boatDynamics` `sea`) and the
 * drawn water (`WaterSurfaceConfig.field`) read the same object, so a hull rises on the wave the player sees.
 */
export interface WaveField {
  components: readonly WaveFieldComponent[];
  /** Still-water level, m. */
  level: number;
  /** Peak circular frequency of the spectrum the field was drawn from, rad/s. */
  peakFrequency: number;
  density: number;
  gravity: number;
}

/**
 * Spectral density `S(ω)`, m²·s, of a Pierson–Moskowitz (`γ = 1`) or JONSWAP sea (DNV-RP-C205 form, `σ` 0.07 below the
 * peak and 0.09 above it).
 * @capability sea-state Pierson–Moskowitz and JONSWAP wave spectra
 */
export function seaSpectrumDensity(spectrum: SeaStateSpectrum, omega: number): number {
  if (omega <= 0) return 0;
  const wp = (2 * Math.PI) / spectrum.peakPeriod;
  const hs = spectrum.significantHeight;
  const pm = (5 / 16) * hs * hs * wp ** 4 * omega ** -5 * Math.exp(-1.25 * (wp / omega) ** 4);
  const gamma = spectrum.peakEnhancement ?? 1;
  if (gamma === 1) return pm;
  const sigma = omega <= wp ? 0.07 : 0.09;
  return (1 - 0.287 * Math.log(gamma)) * pm * gamma ** Math.exp(-((omega - wp) ** 2) / (2 * sigma * sigma * wp * wp));
}

/** How {@link createWaveField} samples a spectrum. */
export interface WaveFieldOptions {
  /** Seed for every phase, frequency jitter and heading; same seed, same sea. */
  seed: string | number;
  /** Component count (default `32`). */
  components?: number;
  /** Mean heading the sea travels toward, rad on the XZ plane (default `0`, along +X). */
  direction?: number;
  /** Directional spreading exponent `s` of `cos^(2s)`; omit for long-crested waves. */
  spreading?: number;
  /** Still-water level, m (default `0`). */
  level?: number;
  density?: number;
  gravity?: number;
}

/**
 * Samples a spectrum into a deterministic wave field: frequencies in equal bands from 0.5ωp to 4ωp, each jittered within
 * its band, amplitudes `√(2·S(ω)·Δω)`, seeded phases, and with `spreading` each heading drawn from `cos^(2s)` about the
 * mean. Components come out largest first, so a renderer that draws only the first few draws the ones that matter.
 * @capability sea-state seeded wave field from a Pierson–Moskowitz or JONSWAP spectrum, shared by boats and the drawn ocean
 */
export function createWaveField(spectrum: SeaStateSpectrum, options: WaveFieldOptions): WaveField {
  const random = seededRng(options.seed);
  const count = Math.max(1, Math.floor(options.components ?? 32));
  const gravity = options.gravity ?? GRAVITY;
  const wp = (2 * Math.PI) / spectrum.peakPeriod;
  const low = 0.5 * wp;
  const band = (4 * wp - low) / count;
  const mean = options.direction ?? 0;
  const spreading = options.spreading;
  const components: WaveFieldComponent[] = [];
  for (let i = 0; i < count; i += 1) {
    const frequency = low + (i + random()) * band;
    const amplitude = Math.sqrt(2 * seaSpectrumDensity(spectrum, frequency) * band);
    let direction = mean;
    if (spreading !== undefined) {
      for (let tries = 0; tries < 64; tries += 1) {
        const theta = (random() - 0.5) * Math.PI;
        if (random() <= Math.cos(theta) ** (2 * spreading)) {
          direction = mean + theta;
          break;
        }
      }
    }
    components.push({ amplitude, frequency, wavenumber: (frequency * frequency) / gravity, direction, phase: 2 * Math.PI * random() });
  }
  components.sort((a, b) => b.amplitude - a.amplitude);
  return { components, level: options.level ?? 0, peakFrequency: wp, density: options.density ?? SEA_DENSITY, gravity };
}

/**
 * One regular wave as a {@link WaveField}: amplitude, m, and period, s, travelling toward `direction` on the XZ plane.
 * @capability sea-state regular deep-water wave field
 */
export function regularWaveField(amplitude: number, period: number, direction = 0, options: { phase?: number; level?: number; density?: number; gravity?: number } = {}): WaveField {
  const gravity = options.gravity ?? GRAVITY;
  const frequency = (2 * Math.PI) / period;
  return {
    components: [{ amplitude, frequency, wavenumber: (frequency * frequency) / gravity, direction, phase: options.phase ?? 0 }],
    level: options.level ?? 0,
    peakFrequency: frequency,
    density: options.density ?? SEA_DENSITY,
    gravity,
  };
}

/**
 * Surface height, m, of a wave field at a point and time (still level plus every component).
 * @capability sea-state wave field surface height
 */
export function waveFieldHeight(field: WaveField, x: number, z: number, time: number): number {
  let eta = field.level;
  for (const c of field.components) eta += c.amplitude * Math.cos(c.wavenumber * (x * Math.cos(c.direction) + z * Math.sin(c.direction)) - c.frequency * time + c.phase);
  return eta;
}

/** Significant wave height of a field, m: `4·√(Σa²/2)`. */
export function waveFieldSignificantHeight(field: WaveField): number {
  let variance = 0;
  for (const c of field.components) variance += 0.5 * c.amplitude * c.amplitude;
  return 4 * Math.sqrt(variance);
}
