import { MARINE_GRAVITY, SEA_WATER_DENSITY, type HullWater } from "./hullHydrostatics";

export interface SeaSpectrum {
  significantHeight: number;
  peakPeriod: number;
  peakEnhancement?: number;
}

/** @capability ocean-waves Pierson–Moskowitz and JONSWAP wave spectra */
export function waveSpectrum(spectrum: SeaSpectrum, omega: number): number {
  if (omega <= 0) return 0;
  const wp = (2 * Math.PI) / spectrum.peakPeriod;
  const hs = spectrum.significantHeight;
  const pm = (5 / 16) * hs * hs * wp ** 4 * omega ** -5 * Math.exp(-1.25 * (wp / omega) ** 4);
  const gamma = spectrum.peakEnhancement ?? 1;
  if (gamma === 1) return pm;
  const sigma = omega <= wp ? 0.07 : 0.09;
  return (1 - 0.287 * Math.log(gamma)) * pm * gamma ** Math.exp(-((omega - wp) ** 2) / (2 * sigma * sigma * wp * wp));
}

/** @capability ocean-waves spectral moments of a sea spectrum */
export function spectralMoment(spectrum: SeaSpectrum, order: number, steps = 4000): number {
  const wp = (2 * Math.PI) / spectrum.peakPeriod;
  const low = 0.2 * wp;
  const high = 6 * wp;
  const h = (high - low) / steps;
  let sum = 0;
  for (let i = 0; i <= steps; i += 1) {
    const w = low + i * h;
    const weight = i === 0 || i === steps ? 1 : i % 2 === 1 ? 4 : 2;
    sum += weight * w ** order * waveSpectrum(spectrum, w);
  }
  return (sum * h) / 3;
}

export interface WaveComponent {
  amplitude: number;
  /** Circular frequency, rad/s. */
  frequency: number;
  wavenumber: number;
  direction: number;
  phase: number;
}

export interface OceanSea {
  components: readonly WaveComponent[];
  density: number;
  gravity: number;
}

export interface IrregularSeaOptions {
  /** Uniform `0..1` draws (e.g. `seededRng(seed)`); every phase and frequency jitter comes from here. */
  random: () => number;
  components?: number;
  direction?: number;
  spreading?: number;
  density?: number;
  gravity?: number;
}

/** @capability ocean-waves regular deep-water wave */
export function regularSea(amplitude: number, period: number, direction = 0, phase = 0, density = SEA_WATER_DENSITY, gravity = MARINE_GRAVITY): OceanSea {
  const frequency = (2 * Math.PI) / period;
  return { components: [{ amplitude, frequency, wavenumber: (frequency * frequency) / gravity, direction, phase }], density, gravity };
}

/**
 * Samples a spectrum into a deterministic irregular sea: frequencies in equal bands from 0.5ωp to 4ωp, each jittered
 * within its band so the record does not repeat, amplitudes `√(2·S(ω)·Δω)`, random phases, and with `spreading` each
 * component given a heading drawn from `cos^(2s)` about the mean.
 * @capability ocean-waves seeded irregular sea from a Pierson–Moskowitz or JONSWAP spectrum
 */
export function irregularSea(spectrum: SeaSpectrum, options: IrregularSeaOptions): OceanSea {
  const count = options.components ?? 128;
  const gravity = options.gravity ?? MARINE_GRAVITY;
  const wp = (2 * Math.PI) / spectrum.peakPeriod;
  const low = 0.5 * wp;
  const band = (4 * wp - low) / count;
  const mean = options.direction ?? 0;
  const spreading = options.spreading;
  const components: WaveComponent[] = [];
  for (let i = 0; i < count; i += 1) {
    const frequency = low + (i + options.random()) * band;
    const amplitude = Math.sqrt(2 * waveSpectrum(spectrum, frequency) * band);
    let direction = mean;
    if (spreading !== undefined) {
      // Rejection-sample the cos^(2s) lobe over |θ| < π/2.
      for (let tries = 0; tries < 64; tries += 1) {
        const theta = (options.random() - 0.5) * Math.PI;
        if (options.random() <= Math.cos(theta) ** (2 * spreading)) {
          direction = mean + theta;
          break;
        }
      }
    }
    components.push({ amplitude, frequency, wavenumber: (frequency * frequency) / gravity, direction, phase: 2 * Math.PI * options.random() });
  }
  return { components, density: options.density ?? SEA_WATER_DENSITY, gravity };
}

/** @capability ocean-waves sea surface elevation */
export function seaElevation(sea: OceanSea, x: number, y: number, time: number): number {
  let eta = 0;
  for (const c of sea.components) eta += c.amplitude * Math.cos(c.wavenumber * (x * Math.cos(c.direction) + y * Math.sin(c.direction)) - c.frequency * time + c.phase);
  return eta;
}

/**
 * The sea at one instant as {@link HullWater} for the hull integrator: submergence below the local surface and the
 * incident-wave (Froude–Krylov) pressure, hydrostatic plus each component's dynamic pressure decaying as `e^(k·z')`
 * with Wheeler stretching `z' = z − η`, so the pressure is zero on the moving surface. Integrating it over the wetted
 * hull gives buoyancy and the nonlinear Froude–Krylov wave force together.
 * @capability ocean-waves incident-wave pressure field for nonlinear Froude–Krylov forces
 */
export function seaWaterAt(sea: OceanSea, time: number): HullWater {
  const rhoG = sea.density * sea.gravity;
  return {
    submergence: (x, y, z) => seaElevation(sea, x, y, time) - z,
    pressure(x, y, z) {
      let eta = 0;
      let dynamic = 0;
      for (const c of sea.components) eta += c.amplitude * Math.cos(c.wavenumber * (x * Math.cos(c.direction) + y * Math.sin(c.direction)) - c.frequency * time + c.phase);
      const stretched = Math.min(0, z - eta);
      for (const c of sea.components) {
        const angle = c.wavenumber * (x * Math.cos(c.direction) + y * Math.sin(c.direction)) - c.frequency * time + c.phase;
        dynamic += c.amplitude * Math.exp(c.wavenumber * stretched) * Math.cos(angle);
      }
      return rhoG * (dynamic - z);
    },
  };
}
