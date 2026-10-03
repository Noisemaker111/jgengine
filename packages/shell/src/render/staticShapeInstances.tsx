import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { ModelShadowMode } from "./modelRender";
import { AuthoredSurfaceMaterial, authoredSurfaceKey, type AuthoredSurfaceConfig, type SurfaceShape } from "./authoredSurfaceMaterial";
import { ModelFallbackBoundary } from "./SceneModels";
import { useDisposable } from "./useDisposable";

/** One editor-derived static primitive. A box spans one unit; a cylinder has unit radius and height before scale. */
export interface StaticShapeInstance {
  shape: SurfaceShape;
  position: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  scale: readonly [number, number, number];
  surface: AuthoredSurfaceConfig;
  shadows?: ModelShadowMode;
  /** Cylinder tessellation; default 16. */
  radialSegments?: number;
}

/** A compatible static draw group. @internal */
export interface StaticShapeBatch {
  key: string;
  shape: SurfaceShape;
  radialSegments: number;
  surface: AuthoredSurfaceConfig;
  shadows: ModelShadowMode;
  instances: readonly StaticShapeInstance[];
}

/** Plan compatible material/shape/shadow groups without changing authored transforms. @internal */
export function groupStaticShapeInstances(instances: readonly StaticShapeInstance[]): StaticShapeBatch[] {
  const groups = new Map<string, StaticShapeBatch>();
  for (const instance of instances) {
    if (![...instance.position, ...instance.scale, ...(instance.rotation ?? [])].every(Number.isFinite) || instance.scale.some(value => value <= 0)) throw new Error("Static shape transforms must be finite with positive scale");
    if ([instance.surface.displacementScale, instance.surface.displacementBias].some(value => value !== undefined && !Number.isFinite(value))) throw new Error("Static shape displacement must be finite");
    const radialSegments = instance.shape === "cylinder" ? instance.radialSegments ?? 16 : 0;
    if (instance.shape === "cylinder" && (!Number.isInteger(radialSegments) || radialSegments < 3)) throw new Error("Cylinder radialSegments must be an integer >= 3");
    const shadows = instance.shadows ?? "both";
    const key = JSON.stringify([instance.shape, radialSegments, shadows, authoredSurfaceKey(instance.surface)]);
    let group = groups.get(key);
    if (group === undefined) {
      group = { key, shape: instance.shape, radialSegments, surface: instance.surface, shadows, instances: [] };
      groups.set(key, group);
    }
    (group.instances as StaticShapeInstance[]).push(instance);
  }
  return [...groups.values()];
}

/** Upload static transforms and refresh conservative aggregate bounds after a prop change. @internal */
export function writeStaticShapeInstances(mesh: THREE.InstancedMesh, instances: readonly StaticShapeInstance[]): void {
  const transform = new THREE.Object3D();
  instances.forEach((instance, index) => {
    transform.position.set(...instance.position);
    transform.rotation.set(...(instance.rotation ?? [0, 0, 0]));
    transform.scale.set(...instance.scale);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  });
  mesh.count = instances.length;
  if (mesh.geometry.boundingBox === null) mesh.geometry.computeBoundingBox();
  const heightSurface = instances[0]?.surface;
  const displacedBounds = mesh.geometry.boundingBox!.clone();
  if (heightSurface?.maps?.height !== undefined) {
    const bias = heightSurface.displacementBias ?? 0;
    const scale = heightSurface.displacementScale ?? 1;
    const displacement = Math.max(Math.abs(bias), Math.abs(bias + scale));
    displacedBounds.expandByScalar(displacement + Number.EPSILON * Math.max(1, displacement) * 8);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.boundingBox = new THREE.Box3();
  const matrix = new THREE.Matrix4(), bounds = new THREE.Box3();
  for (let index = 0; index < instances.length; index++) {
    mesh.getMatrixAt(index, matrix);
    mesh.boundingBox.union(bounds.copy(displacedBounds).applyMatrix4(matrix));
  }
  mesh.boundingSphere = mesh.boundingBox!.getBoundingSphere(new THREE.Sphere());
  // Three scales spheres by the longest matrix column. sqrt(3) also encloses affine parent shear.
  mesh.boundingSphere.radius *= Math.sqrt(3);
}

function ShapeBatch({ batch }: { batch: StaticShapeBatch }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useDisposable(() => batch.shape === "box" ? new THREE.BoxGeometry(1, 1, 1) : new THREE.CylinderGeometry(1, 1, 1, batch.radialSegments), [batch.shape, batch.radialSegments]);
  useLayoutEffect(() => {
    if (ref.current !== null) writeStaticShapeInstances(ref.current, batch.instances);
  }, [batch.instances]);
  const fallback = <AuthoredSurfaceMaterial surface={{ ...batch.surface, maps: undefined }} shape={batch.shape} />;
  return <instancedMesh ref={ref} args={[geometry, undefined, batch.instances.length]} castShadow={batch.shadows === "both" || batch.shadows === "cast"} receiveShadow={batch.shadows === "both" || batch.shadows === "receive"}>
    <ModelFallbackBoundary fallback={fallback} url={Object.values(batch.surface.maps ?? {}).join(",")} seam="object">
      <Suspense fallback={fallback}><AuthoredSurfaceMaterial surface={batch.surface} shape={batch.shape} /></Suspense>
    </ModelFallbackBoundary>
  </instancedMesh>;
}

/**
 * Batch editor-derived boxes/cylinders by shape, PBR metadata and shadows. Uploads and bounds run only when instances change; map loading stays isolated per draw group.
 * @capability static-shape-instances render authored primitive transforms as static material-compatible instance batches
 */
export function StaticShapeInstances({ instances }: { instances: readonly StaticShapeInstance[] }) {
  const batches = useMemo(() => groupStaticShapeInstances(instances), [instances]);
  return <>{batches.map(batch => <ShapeBatch key={batch.key} batch={batch} />)}</>;
}
