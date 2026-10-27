import { Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import { InstancedMesh } from 'three';
import { composeInstance, uploadInstances } from '@jgengine/core/instancing/instanceUpload.draw';
import { editorLayers, type Place } from '../world';
import { StationSurface } from './stationSurface';
import { stationModelReplacements } from './stationModels';
import { surfaceMaterial, type IndustrialSurface } from './industrialMaterials';

/** Original station parts are editor-owned volumes; only their material/shape drives batching. */
export function StationStructure({ place }: { place: Place }) {
 const groups = useMemo(() => {
  const replacements = stationModelReplacements(place);
  const batches = new Map<string, (typeof editorLayers.volumes)[number][]>();
  for (const part of editorLayers.volumes) {
   if (part.kind !== 'deepward-structure' || part.meta?.["place"] !== place) continue;
   if (part.label && replacements.has(part.label)) continue;
   const key = `${part.shape}:${String(part.meta["surface"])}:${part.color}`;
   const list=batches.get(key)??[]; list.push(part);batches.set(key,list);
  }
  return [...batches.entries()];
 }, [place]);
 return <>{groups.map(([id, parts]) => <StationBatch key={id} parts={parts} />)}</>;
}
export function StationBatch({parts}:{parts:(typeof editorLayers.volumes)[number][]}) {
 const ref=useRef<InstancedMesh>(null), first=parts[0]!;
 const surface=first.meta?.["surface"] as IndustrialSurface;
 useLayoutEffect(()=>{
  const mesh=ref.current;if(!mesh)return;
  uploadInstances(mesh,{count:parts.length,at:(i,out)=>{
   const p=parts[i]!;
   const scale:[number,number,number]=p.shape==='box' && p.halfExtents?[p.halfExtents.x*2,p.halfExtents.y*2,p.halfExtents.z*2]:[p.radius??1,p.height??1,p.radius??1];
   composeInstance(out,[p.center.x,p.center.y,p.center.z],[Number(p.meta?.["turnX"]??0),Number(p.meta?.["turn"]??0),Number(p.meta?.["turnZ"]??0)],scale);
  }});
 },[parts]);
 return <instancedMesh ref={ref} args={[undefined,undefined,parts.length]} castShadow receiveShadow>
  {first.shape==='box'?<boxGeometry args={[1,1,1]}/>:<cylinderGeometry args={[1,1,1,16]}/>}
  {first.shape==='box' && ['paint','printed','floor'].includes(String(surface))
   ? <Suspense fallback={<meshStandardMaterial {...surfaceMaterial(surface,first.color)} />}><StationSurface surface={surface} color={first.color} /></Suspense>
   : <meshStandardMaterial {...surfaceMaterial(surface,first.color,surface === "lamp" ? 0.8 : 0)} /> }
 </instancedMesh>;
}
