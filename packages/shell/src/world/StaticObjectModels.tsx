import { useFrame, useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import { useGameContext } from "@jgengine/react/provider";
import { sharedGltfLoader } from "../render/modelLoad";
import { IsolatedModelPart } from "../render/SceneModels";
import { measureLocalBounds, reportMeasuredBounds } from "../render/measureBounds";
import { measureLocalCollisionTriangles, reportMeasuredCollisionMesh } from "../render/measureCollisionMesh";
import { buildScatterModelSources, disposeScatterModelSources, type ScatterModelSource } from "../scatter/scatterModels";
import { useRenderVisibility } from "../visibility/CullingProvider";
import { CAMERA_POST_FRAME_PRIORITY } from "../camera/cameraRigs";
import { canInstanceStaticScene, incompatibleStaticObjectIds, isCompatibleStaticObject, syncStaticObjectSource, type StaticObjectBatch } from "./staticObjectBatches";

function ObjectSource({ source, objects, batch }: { source: ScatterModelSource; objects: readonly SceneObject[]; batch: StaticObjectBatch }) {
  const ctx = useGameContext();
  const visibility = useRenderVisibility();
  const ref = useRef<THREE.InstancedMesh>(null);
  const scratch = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    const mesh = ref.current;
    return () => { mesh?.dispose(); };
  }, [objects.length, source]);
  useFrame(() => {
    if (ref.current !== null) syncStaticObjectSource(ref.current, source, objects, (id) => {
      const object = ctx.scene.object.get(id);
      return object !== null && object.catalogId === batch.objects[0]!.catalogId &&
        isCompatibleStaticObject(object, batch.model, ctx.scene.object.catalog(id)) ? object : null;
    }, visibility.current, scratch);
  }, CAMERA_POST_FRAME_PRIORITY + 0.1);
  return <instancedMesh ref={ref} args={[source.geometry, source.material, objects.length]} castShadow={source.castShadow} receiveShadow={source.receiveShadow} dispose={null} />;
}

function LoadedStaticObjects({ batch, single }: { batch: StaticObjectBatch; single: (object: SceneObject) => ReactNode }) {
  const ctx = useGameContext();
  const [excluded, setExcluded] = useState<readonly string[]>([]);
  const fallbackObjects = useRef(new Map<string, SceneObject>());
  useFrame(() => {
    const next = incompatibleStaticObjectIds(batch, ctx.scene.object.get, ctx.scene.object.catalog, excluded, fallbackObjects.current);
    if (next !== excluded) setExcluded(next);
  });
  const objects = useMemo(() => batch.objects.filter((object) => !excluded.includes(object.instanceId)), [batch, excluded]);
  const gltf = useLoader(sharedGltfLoader, batch.model.url);
  const supported = useMemo(() => canInstanceStaticScene(gltf.scene, gltf.animations), [gltf]);
  const harvested = useMemo(() => supported ? buildScatterModelSources(gltf.scene, batch.model) : null, [supported, gltf, batch.model]);
  useEffect(() => () => { if (harvested !== null) disposeScatterModelSources(harvested.root); }, [harvested]);
  useEffect(() => {
    if (harvested === null) return;
    const root = new THREE.Group();
    for (const source of harvested.sources) {
      const mesh = new THREE.Mesh(source.geometry, source.material);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(source.localMatrix);
      root.add(mesh);
    }
    const key = batch.objects[0]!.catalogId;
    if (batch.model.dims?.maxY === undefined) {
      const bounds = measureLocalBounds(root);
      if (bounds !== null) reportMeasuredBounds(ctx, "object", key, bounds);
    }
    const triangles = measureLocalCollisionTriangles(root);
    if (triangles !== null) reportMeasuredCollisionMesh(ctx, "object", key, triangles);
  }, [ctx, harvested, batch]);
  if (harvested === null) return <>{batch.objects.map(single)}</>;
  return <>
    {harvested.sources.map((source, index) => objects.length === 0 ? null : <ObjectSource key={index} source={source} objects={objects} batch={batch} />)}
    {excluded.map((id) => { const live = ctx.scene.object.get(id); return live === null ? null : single(live); })}
  </>;
}

/** Render compatible authored props as shared model draws, preserving unsupported models. @internal */
export function StaticObjectModels({ batch, single }: { batch: StaticObjectBatch; single: (object: SceneObject) => ReactNode }) {
  return <IsolatedModelPart model={batch.model} seam="object"><LoadedStaticObjects batch={batch} single={single} /></IsolatedModelPart>;
}
