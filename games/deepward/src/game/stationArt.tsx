/** @jsxImportSource @jgengine/core/ui/jsx */
import { useMemo } from '@jgengine/core/ui/jsx';
import { CylinderGeometry, BoxGeometry, Group, InstancedMesh, MeshStandardMaterial, type BufferGeometry } from 'three';
import type { EngineDraw, EngineFrameState } from '@jgengine/core/frame/engineLoop.draw';
import { EngineDrawMount } from '@jgengine/core/frame/useEngineDraw.draw';
import { composeInstance, uploadInstances } from '@jgengine/core/instancing/instanceUpload.draw';
import { editorLayers, type Place } from '../world';
import { applyStationSurface, stationSurfaceTextured } from './stationSurface';
import { stationModelReplacements } from './stationModels';
import { surfaceMaterialParams, type IndustrialSurface } from './industrialMaterials';

type StationPart = (typeof editorLayers.volumes)[number];

/** Original station parts are editor-owned volumes; only their material/shape drives batching. */
export function StationStructure({ place }: { place: Place }) {
 const batches = useMemo(() => {
  const replacements = stationModelReplacements(place);
  const grouped = new Map<string, StationPart[]>();
  for (const part of editorLayers.volumes) {
   if (part.kind !== 'deepward-structure' || part.meta?.["place"] !== place) continue;
   if (part.label && replacements.has(part.label)) continue;
   const key = `${part.shape}:${String(part.meta["surface"])}:${part.color}`;
   const list=grouped.get(key)??[]; list.push(part);grouped.set(key,list);
  }
  return [...grouped.values()];
 }, [place]);
 return <>{batches.map((parts, index) => <StationBatch key={index} parts={parts} />)}</>;
}

function stationBatchDraw(parts: readonly StationPart[]): EngineDraw {
 const group = new Group();
 const first = parts[0]!;
 const surface = first.meta?.["surface"] as IndustrialSurface;
 let mesh: InstancedMesh | null = null;
 let geometry: BufferGeometry | null = null;
 let material: MeshStandardMaterial | null = null;
 return {
  mount(state: EngineFrameState) {
   geometry = first.shape === 'box' ? new BoxGeometry(1, 1, 1) : new CylinderGeometry(1, 1, 1, 16);
   material = new MeshStandardMaterial(surfaceMaterialParams(surface, first.color, surface === "lamp" ? 0.8 : 0));
   if (first.shape === 'box' && stationSurfaceTextured(surface)) {
    applyStationSurface(material, surface);
   }
   mesh = new InstancedMesh(geometry, material, parts.length);
   mesh.castShadow = true;
   mesh.receiveShadow = true;
   uploadInstances(mesh, { count: parts.length, at: (i, out) => {
    const p = parts[i]!;
    const scale: [number, number, number] = p.shape === 'box' && p.halfExtents ? [p.halfExtents.x * 2, p.halfExtents.y * 2, p.halfExtents.z * 2] : [p.radius ?? 1, p.height ?? 1, p.radius ?? 1];
    composeInstance(out, [p.center.x, p.center.y, p.center.z], [Number(p.meta?.["turnX"] ?? 0), Number(p.meta?.["turn"] ?? 0), Number(p.meta?.["turnZ"] ?? 0)], scale);
   }});
   group.add(mesh);
   state.scene.add(group);
  },
  dispose(state: EngineFrameState) {
   state.scene.remove(group);
   group.clear();
   mesh = null;
   geometry?.dispose();
   geometry = null;
   material?.dispose();
   material = null;
  },
 };
}

export function StationBatch({ parts }: { parts: StationPart[] }) {
 return <EngineDrawMount create={() => stationBatchDraw(parts)} deps={[parts]} />;
}
