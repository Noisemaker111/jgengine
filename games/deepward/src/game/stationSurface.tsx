/** @jsxImportSource @jgengine/core/ui/jsx */
import { RepeatWrapping, SRGBColorSpace, TextureLoader, type MeshStandardMaterial, type Texture } from 'three';
import type { IndustrialSurface } from './industrialMaterials';

/** Surfaces whose box parts swap the flat material for the imported PBR maps. */
export const STATION_TEXTURED_SURFACES: readonly IndustrialSurface[] = ['paint', 'printed', 'floor'];

export function stationSurfaceTextured(surface: IndustrialSurface): boolean {
  return STATION_TEXTURED_SURFACES.includes(surface);
}

const textureLoads = new Map<string, Promise<Texture>>();

function loadStationTexture(url: string): Promise<Texture> {
  let pending = textureLoads.get(url);
  if (pending === undefined) {
    pending = new Promise((resolve, reject) => {
      new TextureLoader().load(url, resolve, undefined, reject);
    });
    textureLoads.set(url, pending);
    pending.catch(() => textureLoads.delete(url));
  }
  return pending;
}

/**
 * Original imported maps retain metre-scale detail on editor-sized instanced boxes.
 * Applies the maps and instancing UV scale onto `material` once they decode; the flat
 * material stays visible meanwhile, matching the old Suspense fallback.
 */
export function applyStationSurface(material: MeshStandardMaterial, surface: IndustrialSurface): void {
  const family = surface === 'floor' ? 'station-floor' : 'station-enamel';
  const tile = surface === 'floor' ? 1 : 1.2;
  material.normalScale.set(0.22, 0.22);
  void Promise.all([
    loadStationTexture(`/models/imported/deepward/surfaces/${family}-color.png`),
    loadStationTexture(`/models/imported/deepward/surfaces/${family}-roughness.png`),
    loadStationTexture(`/models/imported/deepward/surfaces/${family}-normal.png`),
  ]).then(([map, roughnessMap, normalMap]) => {
    for (const texture of [map, roughnessMap, normalMap]) {
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.anisotropy = 4;
    }
    map.colorSpace = SRGBColorSpace;
    material.map = map;
    material.roughnessMap = roughnessMap;
    material.normalMap = normalMap;
    const scaleUv = (shader: { vertexShader: string }) => {
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
#ifdef USE_INSTANCING
 vec3 stationExtent=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
 vec2 stationRepeat=(abs(normal.x)>0.5?stationExtent.zy:abs(normal.y)>0.5?stationExtent.xz:stationExtent.xy)/${tile.toFixed(1)};
 #ifdef USE_MAP
  vMapUv*=stationRepeat;
 #endif
 #ifdef USE_ROUGHNESSMAP
  vRoughnessMapUv*=stationRepeat;
 #endif
 #ifdef USE_NORMALMAP
  vNormalMapUv*=stationRepeat;
 #endif
#endif`);
    };
    material.onBeforeCompile = scaleUv;
    material.customProgramCacheKey = () => `deepward-original-surface-${tile}`;
    material.needsUpdate = true;
  }).catch(() => {});
}
