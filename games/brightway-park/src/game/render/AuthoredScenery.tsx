// framework-ok: renders editor markers that carry a model id as static dressing; another game wants this once its scene holds scenery, then it moves upstream beside AuthoredObjects.
import { Suspense, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import type { Object3D } from "three";

import { editorLayers } from "../../editorLayers";
import { assets } from "../assets";

interface SceneryPlacement {
  id: string;
  url: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  lift: number;
}

/** Every `scenery` marker in `editor.scene.json`, resolved to its model file and ground lift once. */
const PLACEMENTS: readonly SceneryPlacement[] = editorLayers.markers.flatMap((marker) => {
  if (marker.kind !== "scenery") return [];
  const assetId = marker.meta?.["assetId"];
  if (typeof assetId !== "string") return [];
  const ref = assets.resolve(assetId);
  if (ref === null) return [];
  const scaleMeta = marker.meta?.["scale"];
  const scale = typeof scaleMeta === "number" ? scaleMeta : 1;
  return [{ id: marker.id, url: ref.url, x: marker.position.x, y: marker.position.y, z: marker.position.z, yaw: marker.rotationY ?? 0, scale, lift: -(ref.dims?.minY ?? 0) * scale }];
});

function Piece({ placement }: { placement: SceneryPlacement }) {
  const { scene } = useGLTF(placement.url);
  const model = useMemo(() => {
    const copy: Object3D = scene.clone(true);
    copy.traverse((node) => { node.castShadow = true; node.receiveShadow = true; });
    return copy;
  }, [scene]);
  return <primitive object={model} position={[placement.x, placement.y + placement.lift, placement.z]} rotation={[0, placement.yaw, 0]} scale={placement.scale} />;
}

/** The town behind the fence, hedges and flowerbeds along the promenade: placed in the scene, drawn here. */
export function AuthoredScenery() {
  return <group>{PLACEMENTS.map((placement) => <Suspense key={placement.id} fallback={null}><Piece placement={placement} /></Suspense>)}</group>;
}
