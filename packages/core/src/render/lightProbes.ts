import { hexToRgb, mixHex } from "./color";

/**
 * Baked irradiance volume: a grid of second-order (9-coefficient, RGB) spherical-harmonic probes
 * over a box region, sampled at runtime for ambient lighting. It is the datum an interior has that
 * a hemisphere light cannot: a room's fill is its own, not the sky's, and it varies across the space.
 *
 * Serializable and pure; the bake is deterministic heuristics (sky visibility, authored lamps and
 * bounce colours), not a path tracer.
 */

/** SH coefficients per channel for the second band — 3 bands, real basis. */
export const SH_COEFFICIENTS = 9;
/** Floats stored per probe: {@link SH_COEFFICIENTS} × RGB. */
export const PROBE_STRIDE = SH_COEFFICIENTS * 3;

/** One irradiance volume authored on a scene document. */
export interface IrradianceVolume {
  id: string;
  /** World-space centre of the grid. */
  center: readonly [number, number, number];
  /** World-space extent of the grid. */
  size: readonly [number, number, number];
  /** Probe count per axis; at least 1. */
  resolution: readonly [number, number, number];
  /**
   * `PROBE_STRIDE` floats per probe, row-major (x fastest, then y, then z). Absent until baked, so a
   * freshly authored volume renders nothing rather than a fabricated ambient.
   */
  samples?: readonly number[];
}

/** Authored bake inputs stored beside the samples so a volume can be re-baked without the editor. */
export interface IrradianceBakeSettings {
  /** How much sky reaches the region: 0 fully enclosed, 1 fully open. */
  skyVisibility: number;
  /** Radiance above the horizon for an open region. Default the sky's own horizon colour. */
  skyColor?: string;
  /** Radiance below the horizon (ground bounce). */
  groundColor?: string;
  /** Fill colour of an enclosed region's ceiling; keeps a room from baking to black. */
  ceilingColor?: string;
  /** Fill colour of an enclosed region's floor. */
  floorColor?: string;
  /** Multiplier on the enclosed fill. Default 1. */
  fillIntensity?: number;
  /** Authored lamps folded into the bake. */
  lights?: readonly { position: readonly [number, number, number]; color?: string; intensity?: number; distance?: number }[];
}

const SH_BAND_0 = 0.282095;
const SH_BAND_1 = 0.488603;
const SH_BAND_2_0 = 1.092548;
const SH_BAND_2_1 = 0.315392;
const SH_BAND_2_2 = 0.546274;

/**
 * Real-basis SH values for a unit direction, into `out` (length 9):
 * `[Y00, Y1-1, Y10, Y11, Y2-2, Y2-1, Y20, Y21, Y22]`.
 * @internal
 */
export function shDirection(x: number, y: number, z: number, out: Float64Array | number[]): void {
  out[0] = SH_BAND_0;
  out[1] = SH_BAND_1 * y;
  out[2] = SH_BAND_1 * z;
  out[3] = SH_BAND_1 * x;
  out[4] = SH_BAND_2_0 * x * y;
  out[5] = SH_BAND_2_0 * y * z;
  out[6] = SH_BAND_2_1 * (3 * z * z - 1);
  out[7] = SH_BAND_2_0 * x * z;
  out[8] = SH_BAND_2_2 * (x * x - y * y);
}

/** Fibonacci sphere direction `index` of `count`, in the renderer's Y-up frame. */
function sphereDirection(index: number, count: number): [number, number, number] {
  const y = 1 - (2 * (index + 0.5)) / count;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = index * 2.399963229728653;
  return [Math.cos(theta) * radius, y, Math.sin(theta) * radius];
}

function scaledRgb(color: string, scale: number): [number, number, number] {
  const [r, g, b] = hexToRgb(color);
  return [(r / 255) * scale, (g / 255) * scale, (b / 255) * scale];
}

/** World-space position of probe `(ix, iy, iz)`; the outer probes sit on the box faces.
 * @internal
 */
export function probePosition(
  volume: Pick<IrradianceVolume, "center" | "size" | "resolution">,
  ix: number,
  iy: number,
  iz: number,
): [number, number, number] {
  const [nx, ny, nz] = volume.resolution;
  const t = (index: number, count: number) => (count <= 1 ? 0.5 : index / (count - 1));
  return [
    volume.center[0] + (t(ix, nx) - 0.5) * volume.size[0],
    volume.center[1] + (t(iy, ny) - 0.5) * volume.size[1],
    volume.center[2] + (t(iz, nz) - 0.5) * volume.size[2],
  ];
}

/** Everything a bake needs for one volume: where the grid sits, how much sky reaches it, and what fills the dark. */
export interface IrradianceBakeInput {
  /** Stable volume id, copied onto the baked volume. */
  id: string;
  center: readonly [number, number, number];
  size: readonly [number, number, number];
  resolution: readonly [number, number, number];
  settings: IrradianceBakeSettings;
  /** Direction samples per probe. Default 64. */
  samples?: number;
}

/**
 * Bakes an irradiance volume from authored inputs: sky radiance where the region is open, an
 * authored ceiling/floor fill where it is enclosed, plus inverse-square lamp radiance. Each probe
 * projects its directional radiance into L2 SH, so ambient varies across the grid and keeps a lit
 * side instead of flattening to one number.
 * @capability light-probes bake an irradiance volume from authored sky, fill and lamp inputs
 */
export function bakeIrradianceVolume(input: IrradianceBakeInput): IrradianceVolume {
  const { settings } = input;
  const count = Math.max(8, Math.min(256, Math.floor(input.samples ?? 64)));
  const [nx, ny, nz] = input.resolution.map((value) => Math.max(1, Math.floor(value))) as [number, number, number];
  const visibility = Math.max(0, Math.min(1, settings.skyVisibility));
  const fill = Math.max(0, settings.fillIntensity ?? 1);
  const sky = settings.skyColor ?? "#9ec4e8";
  const ground = settings.groundColor ?? "#4c4a42";
  const ceiling = settings.ceilingColor ?? "#8d8a80";
  const floor = settings.floorColor ?? "#4a4438";
  const lamps = settings.lights ?? [];
  const samples = new Array<number>(PROBE_STRIDE * nx * ny * nz).fill(0);
  const basis = new Float64Array(SH_COEFFICIENTS);
  const accum = new Float64Array(PROBE_STRIDE);

  for (let iz = 0; iz < nz; iz += 1) {
    for (let iy = 0; iy < ny; iy += 1) {
      for (let ix = 0; ix < nx; ix += 1) {
        const position = probePosition({ center: input.center, size: input.size, resolution: [nx, ny, nz] }, ix, iy, iz);
        accum.fill(0);
        for (let s = 0; s < count; s += 1) {
          const [dx, dy, dz] = sphereDirection(s, count);
          shDirection(dx, dy, dz, basis);
          const radiance = radianceIn(position, dx, dy, dz, { visibility, fill, sky, ground, ceiling, floor, lamps });
          for (let band = 0; band < SH_COEFFICIENTS; band += 1) {
            const weighted = basis[band]! * (4 * Math.PI) / count;
            accum[band * 3] += radiance[0] * weighted;
            accum[band * 3 + 1] += radiance[1] * weighted;
            accum[band * 3 + 2] += radiance[2] * weighted;
          }
        }
        const offset = ((iz * ny + iy) * nx + ix) * PROBE_STRIDE;
        for (let index = 0; index < PROBE_STRIDE; index += 1) samples[offset + index] = accum[index]!;
      }
    }
  }

  return { id: input.id, center: [...input.center], size: [...input.size], resolution: [nx, ny, nz], samples };
}

interface RadianceInputs {
  visibility: number;
  fill: number;
  sky: string;
  ground: string;
  ceiling: string;
  floor: string;
  lamps: NonNullable<IrradianceBakeSettings["lights"]>;
}

function radianceIn(
  position: readonly [number, number, number],
  dx: number,
  dy: number,
  dz: number,
  inputs: RadianceInputs,
): [number, number, number] {
  const open = inputs.visibility;
  const enclosed = 1 - inputs.visibility;
  let color: string;
  let scale: number;
  if (dy >= 0) {
    // Above the horizon an open probe sees sky; an enclosed one sees its own ceiling.
    color = mixHex(inputs.ceiling, inputs.sky, open);
    scale = 0.55 + 0.45 * dy;
  } else {
    // Below the horizon: ground bounce outside, floor bounce inside.
    color = mixHex(inputs.floor, inputs.ground, open);
    scale = 0.55 + 0.45 * -dy;
  }
  scale *= enclosed * inputs.fill + open;
  const radiance: [number, number, number] = scaledRgb(color, scale);
  for (const lamp of inputs.lamps) {
    const lx = lamp.position[0] - position[0];
    const ly = lamp.position[1] - position[1];
    const lz = lamp.position[2] - position[2];
    const distanceSquared = lx * lx + ly * ly + lz * lz;
    if (distanceSquared < 1e-4) continue;
    const reach = lamp.distance ?? 0;
    if (reach > 0 && distanceSquared > reach * reach) continue;
    const distance = Math.sqrt(distanceSquared);
    const facing = (dx * lx + dy * ly + dz * lz) / distance;
    if (facing <= 0) continue;
    const falloff = (lamp.intensity ?? 1) / (distanceSquared + 1) * Math.pow(facing, 6);
    const lampRadiant = scaledRgb(lamp.color ?? "#ffd6a0", falloff);
    radiance[0] += lampRadiant[0];
    radiance[1] += lampRadiant[1];
    radiance[2] += lampRadiant[2];
  }
  return radiance;
}

/**
 * The volume that governs a world position: the one whose box contains it, else the nearest by
 * centre. A scene usually authors one volume per interior plus one for the exterior shell.
 * @internal
 */
export function selectIrradianceVolume(
  volumes: readonly IrradianceVolume[],
  position: readonly [number, number, number],
): IrradianceVolume | undefined {
  let nearest: IrradianceVolume | undefined;
  let nearestDistance = Infinity;
  for (const volume of volumes) {
    if (volume.samples === undefined) continue;
    const dx = Math.abs(position[0] - volume.center[0]) - volume.size[0] / 2;
    const dy = Math.abs(position[1] - volume.center[1]) - volume.size[1] / 2;
    const dz = Math.abs(position[2] - volume.center[2]) - volume.size[2] / 2;
    const outside = Math.max(dx, dy, dz);
    if (outside <= 0) return volume;
    const distance = Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0));
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = volume;
    }
  }
  return nearest;
}

/**
 * Trilinearly samples the volume's SH at a world position, writing {@link PROBE_STRIDE} floats into
 * `out`. Positions outside the grid clamp to its faces, so a probe volume never pops to black at its
 * edge. Returns false when the volume has no baked samples.
 * @internal
 */
export function sampleIrradianceVolume(volume: IrradianceVolume, position: readonly [number, number, number], out: Float32Array): boolean {
  const samples = volume.samples;
  if (samples === undefined || samples.length < PROBE_STRIDE) return false;
  const [nx, ny, nz] = volume.resolution;
  const axis = (value: number, center: number, size: number, count: number) => {
    if (count <= 1 || size === 0) return { low: 0, high: 0, t: 0 };
    const normalized = ((value - center) / size + 0.5) * (count - 1);
    const clamped = Math.max(0, Math.min(count - 1, normalized));
    const low = Math.floor(clamped);
    return { low, high: Math.min(count - 1, low + 1), t: clamped - low };
  };
  const x = axis(position[0], volume.center[0], volume.size[0], nx);
  const y = axis(position[1], volume.center[1], volume.size[1], ny);
  const z = axis(position[2], volume.center[2], volume.size[2], nz);

  out.fill(0);
  const weights: [number, number, number][] = [];
  for (const [ix, wx] of [[x.low, 1 - x.t], [x.high, x.t]] as const) {
    for (const [iy, wy] of [[y.low, 1 - y.t], [y.high, y.t]] as const) {
      for (const [iz, wz] of [[z.low, 1 - z.t], [z.high, z.t]] as const) {
        const weight = wx * wy * wz;
        if (weight <= 0) continue;
        weights.push([ix, iy, iz]);
        const offset = ((iz * ny + iy) * nx + ix) * PROBE_STRIDE;
        for (let index = 0; index < PROBE_STRIDE; index += 1) out[index]! += (samples[offset + index] ?? 0) * weight;
      }
    }
  }
  return weights.length > 0;
}

/**
 * Radiance along a direction from the SH, `Σ coeff·basis` clamped at zero. Used by tests and by
 * tooling that previews a volume without a renderer.
 * @internal
 */
export function radianceAlong(sh: ArrayLike<number>, normal: readonly [number, number, number]): [number, number, number] {
  const basis = new Float64Array(SH_COEFFICIENTS);
  shDirection(normal[0], normal[1], normal[2], basis);
  const rgb: [number, number, number] = [0, 0, 0];
  for (let band = 0; band < SH_COEFFICIENTS; band += 1) {
    rgb[0] += (sh[band * 3] ?? 0) * basis[band]!;
    rgb[1] += (sh[band * 3 + 1] ?? 0) * basis[band]!;
    rgb[2] += (sh[band * 3 + 2] ?? 0) * basis[band]!;
  }
  return [Math.max(0, rgb[0]), Math.max(0, rgb[1]), Math.max(0, rgb[2])];
}

