import type { OceanEnvironmentDescriptor } from "../world/features";
import type { WaveField } from "./seaState";

export type WaterNormal = readonly [number, number, number];

export interface GerstnerWave {
  direction: readonly [number, number];
  wavelength: number;
  amplitude: number;
  steepness: number;
  speed: number;
  /** Phase offset, rad, added to the wave's travelling phase (default `0`). */
  phase?: number;
}

export interface WaterSurfaceConfig {
  level?: number;
  /** Scheduled base level as a function of time — tides, floods (#284.1). Wins over `level`/`setLevel` whenever set. */
  levelAt?: (time: number) => number;
  waveHeight?: number;
  waveScale?: number;
  waveSpeed?: number;
  waves?: number;
  choppiness?: number;
  /** Heading of the longest wave in degrees on the XZ plane (0 = +X); the rest fan out around it. Default 0. */
  direction?: number;
  /** Crest sharpness as a fraction (0..1) of the steepest no-loop Gerstner crest. Default 0.4. */
  steepness?: number;
  /**
   * A sea state (`createWaveField`) to draw and query instead of the synthesized waves: its components become the wave
   * set, largest first, with flat crests so the surface is exactly the field's, the one a `boatDynamics` hull given the
   * same field rides. `level` defaults to the field's.
   */
  field?: WaveField;
}

export interface WaterSurface {
  /** The current base level — the initial config value until `setLevel` replaces it. With a `levelAt` schedule, use `levelAtTime` instead. */
  readonly level: number;
  readonly waves: readonly GerstnerWave[];
  height(x: number, z: number, time: number): number;
  normal(x: number, z: number, time: number): WaterNormal;
  displace(x: number, z: number, time: number): readonly [number, number, number];
  /** Raise or drain the water at runtime (#284.1) — every `height`/`displace` consumer (buoyancy included) sees it immediately. Ignored while a `levelAt` schedule is set. */
  setLevel(level: number): void;
  /** The effective base level at `time`: the `levelAt` schedule when set, else the current `level`. */
  levelAtTime(time: number): number;
}

const GRAVITY = 9.81;
const TWO_PI = Math.PI * 2;
const AMPLITUDE_FALLOFF = 0.65;
const WAVELENGTH_FALLOFF = 0.65;
const DIRECTION_SPREAD = 0.62;

function resolveConfig(config: WaterSurfaceConfig): Required<Omit<WaterSurfaceConfig, "levelAt" | "field">> {
  return {
    level: config.level ?? config.field?.level ?? 0,
    waveHeight: config.waveHeight ?? 1.2,
    waveScale: config.waveScale ?? 18,
    waveSpeed: config.waveSpeed ?? 0.55,
    waves: config.waves ?? 4,
    choppiness: config.choppiness ?? 1,
    direction: config.direction ?? 0,
    steepness: Math.min(1, Math.max(0, config.steepness ?? 0.4)),
  };
}

/** The wave set a {@link waterSurface} with this config moves by: the CPU queries and the shell's drawn water read the same list. */
export function synthesizeWaves(config: WaterSurfaceConfig = {}): GerstnerWave[] {
  const field = config.field;
  if (field !== undefined) {
    // The field is a cosine sum; a Gerstner wave is a sine, so a quarter turn lines the two up.
    return [...field.components]
      .sort((a, b) => b.amplitude - a.amplitude)
      .map((c) => ({ direction: [Math.cos(c.direction), Math.sin(c.direction)] as const, wavelength: TWO_PI / c.wavenumber, amplitude: c.amplitude, steepness: 0, speed: c.frequency / c.wavenumber, phase: c.phase + Math.PI / 2 }));
  }
  const resolved = resolveConfig(config);
  const count = Math.max(0, Math.floor(resolved.waves));
  if (count === 0 || resolved.waveHeight <= 0) {
    return [];
  }

  let amplitudeSum = 0;
  for (let i = 0; i < count; i += 1) {
    amplitudeSum += AMPLITUDE_FALLOFF ** i;
  }
  const amplitudeUnit = resolved.waveHeight / amplitudeSum;

  const waves: GerstnerWave[] = [];
  for (let i = 0; i < count; i += 1) {
    const amplitude = amplitudeUnit * AMPLITUDE_FALLOFF ** i;
    const wavelength = resolved.waveScale * WAVELENGTH_FALLOFF ** i;
    const k = TWO_PI / wavelength;

    const angle = (resolved.direction * Math.PI) / 180 + DIRECTION_SPREAD * (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2);
    const direction: readonly [number, number] = [Math.cos(angle), Math.sin(angle)];

    const omega = Math.sqrt(GRAVITY * k) * resolved.waveSpeed;
    const speed = omega / k;

    const steepnessLimit = 1 / (k * amplitude * count);
    const steepness = Math.min(1, Math.max(0, resolved.steepness * steepnessLimit));

    waves.push({ direction, wavelength, amplitude, steepness, speed });
  }
  return waves;
}

export function waterSurface(config: WaterSurfaceConfig = {}): WaterSurface {
  const resolved = resolveConfig(config);
  let currentLevel = resolved.level;
  const levelAt = config.levelAt;
  const levelAtTime = (time: number): number => (levelAt !== undefined ? levelAt(time) : currentLevel);
  const choppiness = resolved.choppiness;
  const waves = synthesizeWaves(config);

  const height = (x: number, z: number, time: number): number => {
    let y = levelAtTime(time);
    for (const wave of waves) {
      const k = TWO_PI / wave.wavelength;
      const omega = wave.speed * k;
      const phase = k * (wave.direction[0] * x + wave.direction[1] * z) - omega * time + (wave.phase ?? 0);
      y += wave.amplitude * Math.sin(phase);
    }
    return y;
  };

  const displace = (x: number, z: number, time: number): readonly [number, number, number] => {
    let dx = x;
    let dz = z;
    let dy = levelAtTime(time);
    for (const wave of waves) {
      const k = TWO_PI / wave.wavelength;
      const omega = wave.speed * k;
      const phase = k * (wave.direction[0] * x + wave.direction[1] * z) - omega * time + (wave.phase ?? 0);
      const cosPhase = Math.cos(phase);
      const q = wave.steepness;
      dx += q * wave.amplitude * choppiness * wave.direction[0] * cosPhase;
      dz += q * wave.amplitude * choppiness * wave.direction[1] * cosPhase;
      dy += wave.amplitude * Math.sin(phase);
    }
    return [dx, dy, dz];
  };

  const normal = (x: number, z: number, time: number): WaterNormal => {
    let tx = 1;
    let ty = 0;
    let tz = 0;
    let bx = 0;
    let by = 0;
    let bz = 1;
    for (const wave of waves) {
      const k = TWO_PI / wave.wavelength;
      const omega = wave.speed * k;
      const phase = k * (wave.direction[0] * x + wave.direction[1] * z) - omega * time + (wave.phase ?? 0);
      const cosPhase = Math.cos(phase);
      const sinPhase = Math.sin(phase);
      const wa = k * wave.amplitude;
      const q = wave.steepness;
      const dxWave = wave.direction[0];
      const dzWave = wave.direction[1];

      tx += -q * dxWave * dxWave * wa * choppiness * sinPhase;
      ty += dxWave * wa * cosPhase;
      tz += -q * dxWave * dzWave * wa * choppiness * sinPhase;

      bx += -q * dxWave * dzWave * wa * choppiness * sinPhase;
      by += dzWave * wa * cosPhase;
      bz += -q * dzWave * dzWave * wa * choppiness * sinPhase;
    }

    let nx = by * tz - bz * ty;
    let ny = bz * tx - bx * tz;
    let nz = bx * ty - by * tx;
    const lengthSq = nx * nx + ny * ny + nz * nz;
    if (lengthSq === 0) {
      return [0, 1, 0];
    }
    const inv = 1 / Math.sqrt(lengthSq);
    nx *= inv;
    ny *= inv;
    nz *= inv;
    if (ny < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    return [nx, ny, nz];
  };

  return {
    get level() {
      return currentLevel;
    },
    waves,
    height,
    normal,
    displace,
    setLevel(nextLevel) {
      currentLevel = nextLevel;
    },
    levelAtTime,
  };
}

/** The wave config an `ocean()` descriptor describes, for the CPU surface and the drawn water alike. */
export function waterSurfaceConfigFromDescriptor(descriptor: OceanEnvironmentDescriptor, waves?: number): WaterSurfaceConfig {
  return {
    level: descriptor.level,
    ...(descriptor.levelAt === undefined ? {} : { levelAt: descriptor.levelAt }),
    waveHeight: descriptor.waveHeight,
    waveScale: descriptor.waveScale,
    waveSpeed: descriptor.waveSpeed,
    ...(waves === undefined ? {} : { waves }),
  };
}

export function waterSurfaceFromDescriptor(descriptor: OceanEnvironmentDescriptor, waves?: number): WaterSurface {
  return waterSurface(waterSurfaceConfigFromDescriptor(descriptor, waves));
}
