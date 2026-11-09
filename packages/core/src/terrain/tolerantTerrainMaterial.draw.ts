import * as THREE from "three";

import type { ResolvedTerrainDetail } from "./terrain";
import { createTerrainDetailMaterial, type TerrainDetailMaterialTextures, type TerrainSurfaceTextures } from "./terrainDetailMaterial.draw";
import type { TerrainPaintTextures } from "./terrainSurfaces.draw";
import { ImageTextureLoader } from "@jgengine/core/material/imageTexture.draw";
import { terrainQuality } from "./terrainQuality.draw";
import type { TerrainMaterialMaps } from "@jgengine/core/world/features";

/** The map roles a detail material samples, in the order the loader starts them. */
function scanRoles(maps: TerrainMaterialMaps): readonly (readonly [keyof TerrainDetailMaterialTextures, string])[] {
  return [
    ["color", maps.color],
    ["normal", maps.normal],
    ...(maps.roughness === undefined ? [] : ([["roughness", maps.roughness]] as const)),
    ...(maps.ao === undefined ? [] : ([["ao", maps.ao]] as const)),
  ];
}

export interface TolerantTerrainMaterialInput {
  /** The resolved detail whose pulled scan may be missing; the caller filters `missing === "fail"`. */
  detail: ResolvedTerrainDetail | undefined;
  paint: TerrainPaintTextures | undefined;
  surfaces: TerrainSurfaceTextures | undefined;
}

/**
 * The draw-side form of `useTolerantDetailMaterial`: a pulled terrain scan that may be absent
 * loads tolerantly — every map must answer before the textured material replaces the procedural
 * one, and any failure keeps the procedural ground with a warning. `sync` returns the current
 * material (or `undefined`) and kicks whichever stage is pending.
 * @internal
 */
export function createTolerantTerrainMaterialDriver(
  getInput: () => TolerantTerrainMaterialInput,
  onChange?: () => void,
): { sync(): THREE.Material | undefined; dispose(): void } {
  let disposed = false;
  let generation = 0;
  let detail: ResolvedTerrainDetail | undefined;
  let paint: TerrainPaintTextures | undefined;
  let surfaces: TerrainSurfaceTextures | undefined;
  let inputsSeen = false;

  let loadKey = "";
  let loadedKey = "";
  let loadedTextures: TerrainDetailMaterialTextures | undefined;

  let material: THREE.Material | undefined;
  let materialDetail: ResolvedTerrainDetail | undefined;
  let materialPaint: TerrainPaintTextures | undefined;
  let materialSurfaces: TerrainSurfaceTextures | undefined;
  let materialQuality = "";

  const startLoads = (roles: readonly (readonly [keyof TerrainDetailMaterialTextures, string])[], key: string) => {
    const gen = ++generation;
    let pending = roles.length;
    const textures: Partial<Record<keyof TerrainDetailMaterialTextures, THREE.Texture>> = {};
    const loader = new ImageTextureLoader();
    for (const [role, url] of roles) {
      loader.load(url, (texture) => {
        if (disposed || gen !== generation) {
          texture.dispose();
          return;
        }
        texture.colorSpace = role === "color" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        textures[role] = texture;
        pending -= 1;
        if (pending === 0) {
          loadedTextures = textures as TerrainDetailMaterialTextures;
          loadedKey = key;
          onChange?.();
        }
      }, undefined, () => {
        if (disposed || gen !== generation) return;
        for (const texture of Object.values(textures)) texture?.dispose();
        console.warn(`[jgengine] terrain detail maps did not load (${url}) — keeping the procedural ground. Pull the game's asset packs (\`bun run provision\`) to restore them.`);
        loadedTextures = undefined;
        loadedKey = key;
        onChange?.();
      });
    }
  };

  const sync = (): THREE.Material | undefined => {
    if (disposed) return undefined;
    const next = getInput();
    if (!inputsSeen || next.detail !== detail || next.paint !== paint || next.surfaces !== surfaces) {
      detail = next.detail;
      paint = next.paint;
      surfaces = next.surfaces;
      inputsSeen = true;
    }
    const maps = detail?.material?.maps;
    const roles = maps === undefined ? [] : scanRoles(maps);
    const key = roles.map(([role, url]) => `${role}:${url}`).join("|");
    if (key !== loadKey) {
      loadKey = key;
      loadedTextures = undefined;
      if (roles.length > 0) startLoads(roles, key);
      else {
        loadedKey = key;
        onChange?.();
      }
    }
    const quality = terrainQuality();
    const ready = loadedKey === key && loadedTextures !== undefined && detail !== undefined;
    if (!ready) {
      if (material !== undefined) {
        material.dispose();
        material = undefined;
        materialDetail = undefined;
      }
      return undefined;
    }
    const stale =
      material === undefined ||
      materialDetail !== detail ||
      materialPaint !== paint ||
      materialSurfaces !== surfaces ||
      materialQuality !== quality;
    if (!stale || detail === undefined) return material;
    material?.dispose();
    const built = createTerrainDetailMaterial(detail, loadedTextures, { paint, quality, surfaces });
    material = built.material;
    materialDetail = detail;
    materialPaint = paint;
    materialSurfaces = surfaces;
    materialQuality = quality;
    return material;
  };

  return {
    sync,
    dispose(): void {
      disposed = true;
      generation += 1;
      material?.dispose();
      material = undefined;
      if (loadedTextures !== undefined) {
        for (const texture of Object.values(loadedTextures)) texture.dispose();
        loadedTextures = undefined;
      }
    },
  };
}
