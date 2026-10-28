import * as THREE from "three";

import { bakeSurfaceMaterial, type SurfaceMaterialMaps, type SurfaceMaterialSpec } from "./surfaceMaterialGenerator";

const BAKE_CACHE_LIMIT = 12;
const baked = new Map<string, SurfaceMaterialMaps>();

/**
 * Bake a surface material once per spec and detail level and share it: a world that names the
 * same sand twice, or remounts its terrain, pays for one bake. Keeps the last few specs.
 * @capability surface-material-generator seeded tileable PBR ground and nature materials (sand, grass, soil, mud, rock, gravel, bark, snow)
 */
export function bakeSurfaceMaterialShared(spec: SurfaceMaterialSpec, detail = 1): SurfaceMaterialMaps {
  const key = `${detail}|${spec.preset ?? ""}|${spec.seed ?? ""}|${JSON.stringify(spec.params ?? {})}`;
  const hit = baked.get(key);
  if (hit !== undefined) {
    baked.delete(key);
    baked.set(key, hit);
    return hit;
  }
  const maps = bakeSurfaceMaterial(spec, { detail });
  baked.set(key, maps);
  for (const oldest of baked.keys()) {
    if (baked.size <= BAKE_CACHE_LIMIT) break;
    baked.delete(oldest);
  }
  return maps;
}

function configure<T extends THREE.Texture>(texture: T, srgb: boolean): T {
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/** Baked surfaces stacked as array-texture layers, one layer per material, in the order given. */
export interface SurfaceMaterialArrayTextures {
  /** sRGB albedo, height in alpha. */
  albedo: THREE.DataArrayTexture;
  /** Normal x/y, roughness, AO. */
  surface: THREE.DataArrayTexture;
  /** Each layer's mean linear albedo. */
  means: readonly THREE.Color[];
  dispose(): void;
}

/**
 * Stack baked surface materials into two array textures, so a shader samples any of them through
 * two samplers. Every map must share one size. The caller owns the textures.
 * @capability surface-material-generator seeded tileable PBR ground and nature materials (sand, grass, soil, mud, rock, gravel, bark, snow)
 */
export function surfaceMaterialArrayTextures(layers: readonly SurfaceMaterialMaps[]): SurfaceMaterialArrayTextures {
  const first = layers[0];
  if (first === undefined) throw new Error("surfaceMaterialArrayTextures needs at least one baked material");
  const size = first.size;
  const texels = size * size * 4;
  const albedo = new Uint8Array(texels * layers.length);
  const surface = new Uint8Array(texels * layers.length);
  layers.forEach((maps, index) => {
    if (maps.size !== size) throw new Error(`Surface material layers must share one size: ${maps.size} after ${size}`);
    albedo.set(maps.albedo, index * texels);
    surface.set(maps.surface, index * texels);
  });
  const albedoTexture = configure(new THREE.DataArrayTexture(albedo, size, size, layers.length), true);
  const surfaceTexture = configure(new THREE.DataArrayTexture(surface, size, size, layers.length), false);
  return {
    albedo: albedoTexture,
    surface: surfaceTexture,
    means: layers.map((maps) => new THREE.Color(maps.meanLinear[0], maps.meanLinear[1], maps.meanLinear[2])),
    dispose() {
      albedoTexture.dispose();
      surfaceTexture.dispose();
    },
  };
}

/** A baked surface as the maps a stock `MeshStandardMaterial` reads. */
export interface SurfaceMaterialStandardMaps {
  /** sRGB albedo. */
  map: THREE.DataTexture;
  /** Tangent-space normal map. */
  normalMap: THREE.DataTexture;
  /** glTF-style packed map: AO in red, roughness in green; set as both `aoMap` and `roughnessMap`. */
  ormMap: THREE.DataTexture;
  dispose(): void;
}

/**
 * Unpack a baked surface into standard-material maps (albedo, normal, AO + roughness), for meshes
 * and previews that use a stock material. The caller owns the textures.
 * @capability surface-material-generator seeded tileable PBR ground and nature materials (sand, grass, soil, mud, rock, gravel, bark, snow)
 */
export function surfaceMaterialStandardMaps(maps: SurfaceMaterialMaps): SurfaceMaterialStandardMaps {
  const { size } = maps;
  const count = size * size;
  const color = new Uint8Array(count * 4);
  const normal = new Uint8Array(count * 4);
  const orm = new Uint8Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    const o = i * 4;
    color[o] = maps.albedo[o] ?? 0;
    color[o + 1] = maps.albedo[o + 1] ?? 0;
    color[o + 2] = maps.albedo[o + 2] ?? 0;
    color[o + 3] = 255;
    const nx = (maps.surface[o] ?? 128) / 127.5 - 1;
    const ny = (maps.surface[o + 1] ?? 128) / 127.5 - 1;
    normal[o] = maps.surface[o] ?? 128;
    // Rows run along +v with no flip, so the baked tilt is already in the texture's tangent frame.
    normal[o + 1] = maps.surface[o + 1] ?? 128;
    normal[o + 2] = Math.round((Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * 0.5 + 0.5) * 255);
    normal[o + 3] = 255;
    orm[o] = maps.surface[o + 3] ?? 255;
    orm[o + 1] = maps.surface[o + 2] ?? 230;
    orm[o + 2] = 0;
    orm[o + 3] = 255;
  }
  const map = configure(new THREE.DataTexture(color, size, size), true);
  const normalMap = configure(new THREE.DataTexture(normal, size, size), false);
  const ormMap = configure(new THREE.DataTexture(orm, size, size), false);
  return {
    map,
    normalMap,
    ormMap,
    dispose() {
      map.dispose();
      normalMap.dispose();
      ormMap.dispose();
    },
  };
}
