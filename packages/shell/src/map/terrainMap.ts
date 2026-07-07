import { isRegionField, type RegionField } from "@jgengine/core/world/regions";
import type { TerrainField } from "@jgengine/core/world/terrain";

export interface MapBakeBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface BakeTerrainMapOptions {
  resolution?: number;
  landLow?: readonly [number, number, number];
  landHigh?: readonly [number, number, number];
  water?: readonly [number, number, number];
}

export interface BakedMap {
  url: string;
  bounds: MapBakeBounds;
}

function mix(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const DEFAULT_LAND_LOW: readonly [number, number, number] = [46, 74, 45];
const DEFAULT_LAND_HIGH: readonly [number, number, number] = [180, 172, 128];
const DEFAULT_WATER: readonly [number, number, number] = [28, 74, 108];

/**
 * Bake a top-down image of a `TerrainField` (or `RegionField`) over `bounds`
 * for the react `Minimap` / `WorldMap` background. Runs in the browser via a
 * 2D canvas; renderer-side, so it lives in the shell.
 */
export function bakeTerrainMap(
  field: TerrainField,
  bounds: MapBakeBounds,
  options: BakeTerrainMapOptions = {},
): BakedMap | null {
  const res = options.resolution ?? 160;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = res;
  canvas.height = res;
  const context = canvas.getContext("2d");
  if (context === null) return null;

  const region: RegionField | null = isRegionField(field) ? field : null;
  const waterLevel = field.waterLevel ?? Number.NEGATIVE_INFINITY;
  const worldW = bounds.maxX - bounds.minX;
  const worldD = bounds.maxZ - bounds.minZ;
  const landLow = options.landLow ?? DEFAULT_LAND_LOW;
  const landHigh = options.landHigh ?? DEFAULT_LAND_HIGH;
  const water = options.water ?? DEFAULT_WATER;

  const heights = new Float32Array(res * res);
  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;
  for (let py = 0; py < res; py += 1) {
    for (let px = 0; px < res; px += 1) {
      const worldX = bounds.minX + ((px + 0.5) / res) * worldW;
      const worldZ = bounds.minZ + ((py + 0.5) / res) * worldD;
      const height = field.sampleHeight(worldX, worldZ);
      heights[py * res + px] = height;
      if (height < minHeight) minHeight = height;
      if (height > maxHeight) maxHeight = height;
    }
  }
  const span = maxHeight - minHeight || 1;

  const image = context.createImageData(res, res);
  for (let py = 0; py < res; py += 1) {
    for (let px = 0; px < res; px += 1) {
      const index = py * res + px;
      const height = heights[index]!;
      const normalized = (height - minHeight) / span;
      let color: [number, number, number];
      if (height < waterLevel) {
        color = [...water];
      } else if (region !== null) {
        const worldX = bounds.minX + ((px + 0.5) / res) * worldW;
        const worldZ = bounds.minZ + ((py + 0.5) / res) * worldD;
        const sample = region.sampleRegion(worldX, worldZ);
        const shade = 0.55 + normalized * 0.5;
        color = [
          Math.min(255, sample.tint[0] * 255 * shade),
          Math.min(255, sample.tint[1] * 255 * shade),
          Math.min(255, sample.tint[2] * 255 * shade),
        ];
      } else {
        color = mix(landLow, landHigh, normalized);
      }
      const offset = index * 4;
      image.data[offset] = color[0];
      image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2];
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return { url: canvas.toDataURL("image/png"), bounds };
}
