import type { OceanEnvironmentDescriptor } from "./features";

export type WaterNormal = readonly [number, number, number];

export interface GerstnerWave {
  direction: readonly [number, number];
  wavelength: number;
  amplitude: number;
  steepness: number;
  speed: number;
}

export interface WaterSurfaceConfig {
  level?: number;
  waveHeight?: number;
  waveScale?: number;
  waveSpeed?: number;
  waves?: number;
  choppiness?: number;
}

export interface WaterSurface {
  readonly level: number;
  readonly waves: readonly GerstnerWave[];
  height(x: number, z: number, time: number): number;
  normal(x: number, z: number, time: number): WaterNormal;
  displace(x: number, z: number, time: number): readonly [number, number, number];
}

const GRAVITY = 9.81;
const TWO_PI = Math.PI * 2;
const AMPLITUDE_FALLOFF = 0.65;
const WAVELENGTH_FALLOFF = 0.65;
const DIRECTION_SPREAD = 0.62;

function resolveConfig(config: WaterSurfaceConfig): Required<WaterSurfaceConfig> {
  return {
    level: config.level ?? 0,
    waveHeight: config.waveHeight ?? 1.2,
    waveScale: config.waveScale ?? 18,
    waveSpeed: config.waveSpeed ?? 0.55,
    waves: config.waves ?? 4,
    choppiness: config.choppiness ?? 1,
  };
}

export function synthesizeWaves(config: WaterSurfaceConfig = {}): GerstnerWave[] {
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

    const angle = DIRECTION_SPREAD * (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2);
    const direction: readonly [number, number] = [Math.cos(angle), Math.sin(angle)];

    const omega = Math.sqrt(GRAVITY * k) * resolved.waveSpeed;
    const speed = omega / k;

    const steepnessLimit = 1 / (k * amplitude * count);
    const steepness = Math.min(1, Math.max(0, 0.4 * steepnessLimit));

    waves.push({ direction, wavelength, amplitude, steepness, speed });
  }
  return waves;
}

export function waterSurface(config: WaterSurfaceConfig = {}): WaterSurface {
  const resolved = resolveConfig(config);
  const level = resolved.level;
  const choppiness = resolved.choppiness;
  const waves = synthesizeWaves(config);

  const height = (x: number, z: number, time: number): number => {
    let y = level;
    for (const wave of waves) {
      const k = TWO_PI / wave.wavelength;
      const omega = wave.speed * k;
      const phase = k * (wave.direction[0] * x + wave.direction[1] * z) - omega * time;
      y += wave.amplitude * Math.sin(phase);
    }
    return y;
  };

  const displace = (x: number, z: number, time: number): readonly [number, number, number] => {
    let dx = x;
    let dz = z;
    let dy = level;
    for (const wave of waves) {
      const k = TWO_PI / wave.wavelength;
      const omega = wave.speed * k;
      const phase = k * (wave.direction[0] * x + wave.direction[1] * z) - omega * time;
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
      const phase = k * (wave.direction[0] * x + wave.direction[1] * z) - omega * time;
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

  return { level, waves, height, normal, displace };
}

export function waterSurfaceFromDescriptor(
  descriptor: OceanEnvironmentDescriptor,
  waves?: number,
): WaterSurface {
  return waterSurface({
    level: descriptor.level,
    waveHeight: descriptor.waveHeight,
    waveScale: descriptor.waveScale,
    waveSpeed: descriptor.waveSpeed,
    ...(waves === undefined ? {} : { waves }),
  });
}
