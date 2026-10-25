import { useLoader } from '@react-three/fiber';
import { useCallback, useMemo } from 'react';
import { RepeatWrapping, SRGBColorSpace, TextureLoader, type MeshStandardMaterial } from 'three';
import { surfaceMaterial, type IndustrialSurface } from './industrialMaterials';

/** Original imported maps retain metre-scale detail on editor-sized instanced boxes. */
export function StationSurface({surface,color}:{surface:IndustrialSurface;color?:string}) {
 const family=surface==='floor'?'station-floor':'station-enamel';
 const tile=surface==='floor'?1:1.2;
 const textures=useLoader(TextureLoader,['color','roughness','normal'].map(role=>`/models/imported/deepward/surfaces/${family}-${role}.png`));
 const maps=useMemo(()=>{
  textures.forEach(texture=>{texture.wrapS=RepeatWrapping;texture.wrapT=RepeatWrapping;texture.anisotropy=4;});
  textures[0]!.colorSpace=SRGBColorSpace;
  return {map:textures[0]!,roughnessMap:textures[1]!,normalMap:textures[2]!};
 },[textures]);
 const scaleUv=useCallback< MeshStandardMaterial['onBeforeCompile'] >((shader)=>{
  shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
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
 },[tile]);
 return <meshStandardMaterial {...surfaceMaterial(surface,color)} {...maps} normalScale={[0.22,0.22]} onBeforeCompile={scaleUv} customProgramCacheKey={()=>`deepward-original-surface-${tile}`} />;
}
