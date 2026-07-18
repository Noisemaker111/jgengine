/**
 * Runtime renderer for the built-in `pole_line` scene kind: instanced poles (proxy cylinders, or a
 * GLB pole asset when one is named) plus merged tube geometry for the sagging cables. Registered by
 * `registerBuiltinSceneKindRenderers` so any document with a `pole_line` path renders with no game
 * wiring. Uses the generic core primitive `readNamedSockets` to hang wires off a GLB pole's authored
 * crossarm empties (falling back to computed offsets).
 */
import { Suspense, useEffect, useMemo, useRef } from "react";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { parseParams } from "@jgengine/core/scene/sceneKinds";
import { readNamedSockets, type ModelNode } from "@jgengine/core/scene/modelSockets";
import { POLE_LINE_KIND, POLE_LINE_SCHEMA, resolvePoleLine, type Cable, type Pole, type ResolvedPoleLine } from "@jgengine/core/world/poleLineKind";
import type { SceneKindObject } from "@jgengine/core/scene/sceneKinds";

import { registerSceneKindRenderer, type SceneKindRenderContext } from "./sceneKindRenderers";

function Cables({ cables }: { cables: readonly Cable[] }) {
  const geometry = useMemo(() => {
    const parts: THREE.TubeGeometry[] = [];
    for (const cable of cables) {
      if (cable.points.length < 2) continue;
      const curve = new THREE.CatmullRomCurve3(cable.points.map((point) => new THREE.Vector3(point[0], point[1], point[2])));
      parts.push(new THREE.TubeGeometry(curve, Math.max(2, cable.points.length - 1), cable.radius, 5, false));
    }
    if (parts.length === 0) return null;
    const merged = mergePositionGeometries(parts);
    for (const part of parts) part.dispose();
    return merged;
  }, [cables]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (geometry === null) return null;
  return (
    <mesh geometry={geometry} castShadow>
      <meshStandardMaterial color="#1a1a1f" roughness={0.7} metalness={0.1} />
    </mesh>
  );
}

/** Minimal position/normal/index merge — avoids depending on a specific BufferGeometryUtils path. */
function mergePositionGeometries(geometries: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vertexCount = 0;
  let indexCount = 0;
  for (const geometry of geometries) {
    vertexCount += geometry.getAttribute("position").count;
    const index = geometry.getIndex();
    indexCount += index === null ? geometry.getAttribute("position").count : index.count;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(indexCount);
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const geometry of geometries) {
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    positions.set(position.array as Float32Array, vertexOffset * 3);
    if (normal !== undefined) normals.set(normal.array as Float32Array, vertexOffset * 3);
    const index = geometry.getIndex();
    if (index === null) {
      for (let i = 0; i < position.count; i += 1) indices[indexOffset + i] = vertexOffset + i;
      indexOffset += position.count;
    } else {
      for (let i = 0; i < index.count; i += 1) indices[indexOffset + i] = vertexOffset + index.getX(i);
      indexOffset += index.count;
    }
    vertexOffset += position.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

function ProxyPoles({ poles, height }: { poles: readonly Pole[]; height: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.CylinderGeometry(0.06, 0.11, height, 6), [height]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3(1, 1, 1);
    poles.forEach((pole, index) => {
      position.set(pole.position[0], pole.position[1] + height / 2, pole.position[2]);
      euler.set(0, pole.yaw, 0);
      quaternion.setFromEuler(euler);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.count = poles.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [poles, height]);
  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, Math.max(1, poles.length)]} castShadow receiveShadow>
      <meshStandardMaterial color="#6b5636" roughness={0.9} metalness={0} />
    </instancedMesh>
  );
}

function ModelPoles({ url, poles }: { url: string; poles: readonly Pole[] }) {
  const gltf = useLoader(GLTFLoader, url);
  const sources = useMemo(() => {
    const meshes: { geometry: THREE.BufferGeometry; material: THREE.Material; local: THREE.Matrix4 }[] = [];
    gltf.scene.updateWorldMatrix(true, true);
    gltf.scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) meshes.push({ geometry: mesh.geometry, material: mesh.material as THREE.Material, local: mesh.matrixWorld.clone() });
    });
    // readNamedSockets is available for wire-anchor refinement; the proxy path already honors offsets.
    void readNamedSockets(gltf.scene as unknown as ModelNode);
    return meshes;
  }, [gltf]);
  return (
    <>
      {sources.map((source, index) => (
        <ModelPoleSource key={index} source={source} poles={poles} />
      ))}
    </>
  );
}

function ModelPoleSource({ source, poles }: { source: { geometry: THREE.BufferGeometry; material: THREE.Material; local: THREE.Matrix4 }; poles: readonly Pole[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    const base = new THREE.Matrix4();
    const composed = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3(1, 1, 1);
    poles.forEach((pole, index) => {
      position.set(pole.position[0], pole.position[1], pole.position[2]);
      euler.set(0, pole.yaw, 0);
      quaternion.setFromEuler(euler);
      base.compose(position, quaternion, scale);
      composed.multiplyMatrices(base, source.local);
      mesh.setMatrixAt(index, composed);
    });
    mesh.count = poles.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [poles, source]);
  return <instancedMesh ref={meshRef} args={[source.geometry, source.material, Math.max(1, poles.length)]} castShadow receiveShadow />;
}

function OnePoleLine({ object, context }: { object: SceneKindObject; context: SceneKindRenderContext }) {
  const resolved: ResolvedPoleLine = useMemo(
    () => resolvePoleLine(object, parseParams(POLE_LINE_SCHEMA, object.meta), { sampleHeight: (x, z) => context.field.sampleHeight(x, z) }),
    [object, context.field],
  );
  const modelUrl = resolved.poleAsset.length > 0 ? context.assets?.resolve(resolved.poleAsset)?.url : undefined;
  return (
    <>
      {modelUrl !== undefined ? (
        <Suspense fallback={<ProxyPoles poles={resolved.poles} height={resolved.poleHeight} />}>
          <ModelPoles url={modelUrl} poles={resolved.poles} />
        </Suspense>
      ) : (
        <ProxyPoles poles={resolved.poles} height={resolved.poleHeight} />
      )}
      <Cables cables={resolved.cables} />
    </>
  );
}

/** Registers the built-in pole-line runtime renderer. Called by `registerBuiltinSceneKindRenderers`. @internal */
export function registerPoleLineRenderer(): void {
  registerSceneKindRenderer(POLE_LINE_KIND, ({ objects, context }) => (
    <>
      {objects.map((object) => (
        <OnePoleLine key={object.id} object={object} context={context} />
      ))}
    </>
  ));
}
