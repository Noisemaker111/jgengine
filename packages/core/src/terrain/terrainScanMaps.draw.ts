import type { SurfaceMaterialMaps } from "../material/surfaceMaterialGenerator";
import type { TerrainMaterialMaps } from "../world/features";
import type { ResolvedTerrainSurfaces } from "./terrain";

/** Largest edge a scan is packed at; ambientCG 1K archives are 1024 square. */
export const TERRAIN_SCAN_SIZE = 1024;

/** Decoded RGBA bytes of each map of one scan, all `size` square with row 0 at the top (image order). */
export interface TerrainScanPixels {
  size: number;
  color: ArrayLike<number>;
  normal?: ArrayLike<number> | undefined;
  roughness?: ArrayLike<number> | undefined;
  ao?: ArrayLike<number> | undefined;
  displacement?: ArrayLike<number> | undefined;
}

const FLAT = 128;
const DEFAULT_ROUGHNESS = 217;

function srgbToLinear(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Pack a scan's maps into the surface-material layout the terrain shader reads: sRGB albedo with
 * height in alpha, and normal x/y, roughness and AO. Rows are flipped so row 0 is v = 0, matching
 * generated surfaces. A map the scan does not ship keeps a neutral value (flat normal, matte, unoccluded, mid height).
 * @internal
 */
export function packTerrainScan(pixels: TerrainScanPixels): SurfaceMaterialMaps {
  const { size } = pixels;
  const albedo = new Uint8Array(size * size * 4);
  const surface = new Uint8Array(size * size * 4);
  let r = 0;
  let g = 0;
  let b = 0;
  const stride = Math.max(1, Math.floor(size / 64));
  let sampled = 0;
  for (let y = 0; y < size; y += 1) {
    const src = (size - 1 - y) * size * 4;
    const dst = y * size * 4;
    for (let x = 0; x < size; x += 1) {
      const i = src + x * 4;
      const o = dst + x * 4;
      albedo[o] = pixels.color[i] ?? 0;
      albedo[o + 1] = pixels.color[i + 1] ?? 0;
      albedo[o + 2] = pixels.color[i + 2] ?? 0;
      albedo[o + 3] = pixels.displacement === undefined ? FLAT : pixels.displacement[i] ?? FLAT;
      surface[o] = pixels.normal === undefined ? FLAT : pixels.normal[i] ?? FLAT;
      surface[o + 1] = pixels.normal === undefined ? FLAT : pixels.normal[i + 1] ?? FLAT;
      surface[o + 2] = pixels.roughness === undefined ? DEFAULT_ROUGHNESS : pixels.roughness[i + 1] ?? DEFAULT_ROUGHNESS;
      surface[o + 3] = pixels.ao === undefined ? 255 : pixels.ao[i] ?? 255;
      if (x % stride === 0 && y % stride === 0) {
        r += srgbToLinear(albedo[o] ?? 0);
        g += srgbToLinear(albedo[o + 1] ?? 0);
        b += srgbToLinear(albedo[o + 2] ?? 0);
        sampled += 1;
      }
    }
  }
  return { kind: "soil", size, albedo, surface, meanLinear: [r / sampled, g / sampled, b / sampled] };
}

/**
 * Stable key for one scan's URLs, so a layer and a role naming the same scan share one array layer.
 * @internal
 */
export function terrainScanKey(maps: TerrainMaterialMaps): string {
  return [maps.color, maps.normal, maps.roughness ?? "", maps.ao ?? "", maps.displacement ?? ""].join("|");
}

async function decode(url: string, size: number): Promise<Uint8ClampedArray> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = url;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) throw new Error("2d canvas unavailable for terrain scan decode");
  context.drawImage(image, 0, 0, size, size);
  return context.getImageData(0, 0, size, size).data;
}

/**
 * Fetch and pack one scan at `size` square (a 1K scan on a low-quality tier asks for 512).
 * Rejects when a named map fails to load, so a bad URL is a visible error and not a grey ground.
 * @internal
 */
export async function loadTerrainScan(maps: TerrainMaterialMaps, size: number): Promise<SurfaceMaterialMaps> {
  const [color, normal, roughness, ao, displacement] = await Promise.all([
    decode(maps.color, size),
    decode(maps.normal, size),
    maps.roughness === undefined ? undefined : decode(maps.roughness, size),
    maps.ao === undefined ? undefined : decode(maps.ao, size),
    maps.displacement === undefined ? undefined : decode(maps.displacement, size),
  ]);
  return packTerrainScan({ size, color, normal, roughness, ao, displacement });
}

/**
 * Every distinct scan a terrain names, across its surface roles and paint layers.
 * @internal
 */
export function terrainScanRequests(
  surfaces: ResolvedTerrainSurfaces | undefined,
  paintScans: readonly (TerrainMaterialMaps | undefined)[],
): TerrainMaterialMaps[] {
  const found = new Map<string, TerrainMaterialMaps>();
  for (const layer of Object.values(surfaces ?? {})) if (layer?.scan !== undefined) found.set(terrainScanKey(layer.scan), layer.scan);
  for (const maps of paintScans) if (maps !== undefined) found.set(terrainScanKey(maps), maps);
  return [...found.values()];
}
