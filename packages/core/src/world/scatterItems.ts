import type { Aabb } from "./geometry";
import type { RegionField, RegionSample } from "./regions";

/** One placeable class. `item` is an opaque id the caller maps to a mesh/entity. */
export interface ScatterLayer {
  item: string;
  density: number;
  minScale?: number;
  maxScale?: number;
  maxSlope?: number;
  aboveWaterOnly?: boolean;
}

export interface ScatterInstance {
  id: string;
  item: string;
  x: number;
  z: number;
  y: number;
  scale: number;
  rotation: number;
  regionId: string;
}

function hash(ix: number, iz: number, salt: number): number {
  let h = salt | 0;
  h = Math.imul(h ^ (ix | 0), 0x27d4eb2d);
  h = Math.imul(h ^ (iz | 0), 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967295;
}

const DEFAULT_MAX_SLOPE = 0.55;

/**
 * Deterministically place opaque items across `area`, grounded on a region field.
 * For each grid cell it asks `layersFor` which items may appear in that region and
 * rolls one against their densities. The engine never interprets `item` — a game
 * maps it to a mesh or entity. Content scatter (region-driven density) as opposed to
 * `scatter` in `./scatter`, which is renderer-free geometric point distribution.
 */
export function scatterItems<T>(
  field: RegionField<T>,
  area: Aabb,
  layersFor: (sample: RegionSample<T>) => readonly ScatterLayer[],
  options: { cell?: number; max?: number; saltKey?: number } = {},
): ScatterInstance[] {
  const cell = options.cell ?? 5;
  const max = options.max ?? 1400;
  const salt = field.seed ^ (options.saltKey ?? 0x5f3a);
  const out: ScatterInstance[] = [];
  for (let gx = Math.floor(area.minX / cell); gx <= Math.ceil(area.maxX / cell); gx += 1) {
    for (let gz = Math.floor(area.minZ / cell); gz <= Math.ceil(area.maxZ / cell); gz += 1) {
      const roll = hash(gx, gz, salt);
      const x = (gx + hash(gx, gz, salt ^ 0x11)) * cell;
      const z = (gz + hash(gx, gz, salt ^ 0x22)) * cell;
      const y = field.sampleHeight(x, z);
      const sample = field.sampleRegion(x, z);
      const layers = layersFor(sample);
      if (layers.length === 0) continue;
      let total = 0;
      for (const layer of layers) total += layer.density;
      if (roll > total) continue;
      let acc = 0;
      let chosen = layers[0]!;
      for (const layer of layers) {
        acc += layer.density;
        if (roll <= acc) {
          chosen = layer;
          break;
        }
      }
      if ((chosen.aboveWaterOnly ?? true) && y < field.seaLevel + 0.1) continue;
      if (1 - field.sampleNormal(x, z)[1] > (chosen.maxSlope ?? DEFAULT_MAX_SLOPE)) continue;
      const scaleRoll = hash(gx, gz, salt ^ 0x99);
      const min = chosen.minScale ?? 0.8;
      const maxScale = chosen.maxScale ?? 1.2;
      out.push({
        id: `${gx}:${gz}`,
        item: chosen.item,
        x,
        z,
        y,
        scale: min + scaleRoll * (maxScale - min),
        rotation: hash(gx, gz, salt ^ 0xabcd) * Math.PI * 2,
        regionId: sample.region.id,
      });
      if (out.length >= max) return out;
    }
  }
  return out;
}

/** Weighted pick from opaque entries; `roll` in [0, 1). Returns null when empty. */
export function pickWeighted<T>(entries: readonly { value: T; weight: number }[], roll: number): T | null {
  if (entries.length === 0) return null;
  let total = 0;
  for (const entry of entries) total += entry.weight;
  const pick = roll * total;
  let acc = 0;
  for (const entry of entries) {
    acc += entry.weight;
    if (pick <= acc) return entry.value;
  }
  return entries[entries.length - 1]!.value;
}
