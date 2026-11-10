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

export interface RequiredTerrainMaterialInput {
  /** The resolved detail whose declared maps are required (`missing === "fail"`). */
  detail: ResolvedTerrainDetail | undefined;
  paint: TerrainPaintTextures | undefined;
  surfaces: TerrainSurfaceTextures | undefined;
}

/**
 * The draw-side form of the suspending `useRecoverableTexture` terrain path:
 * a `missing === "fail"` detail's declared maps must all answer before the
 * textured material exists — nothing draws until then, matching the old
 * Suspense boundary. Any load failure reports through `onFail` so the owning
 * presentation can run its retry flow; `sync` returns the current material (or
 * `undefined` while pending/failed) and kicks whichever stage is pending.
 * @internal
 */
export function createRequiredTerrainMaterialDriver(
  getInput: () => RequiredTerrainMaterialInput,
  onChange?: () => void,
  onFail?: (error: unknown) => void,
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
    let failed = false;
    const textures: Partial<Record<keyof TerrainDetailMaterialTextures, THREE.Texture>> = {};
    const loader = new ImageTextureLoader();
    const fail = (error: unknown) => {
      if (disposed || gen !== generation || failed) return;
      failed = true;
      for (const texture of Object.values(textures)) texture?.dispose();
      loadedTextures = undefined;
      onFail?.(error);
    };
    for (const [role, url] of roles) {
      loader.load(url, (texture) => {
        if (disposed || gen !== generation) {
          texture.dispose();
          return;
        }
        texture.colorSpace = role === "color" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;
        textures[role] = texture;
        pending -= 1;
        if (pending === 0 && !failed) {
          loadedTextures = textures as TerrainDetailMaterialTextures;
          loadedKey = key;
          onChange?.();
        }
      }, undefined, fail);
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
    if (!ready || detail === undefined) {
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
    if (!stale) return material;
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
