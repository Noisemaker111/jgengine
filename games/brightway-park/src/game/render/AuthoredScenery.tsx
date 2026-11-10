import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Object3D } from "three";

import { editorLayers } from "../../editorLayers";
import { assets } from "../assets";
import type { EngineDraw } from "@jgengine/core/frame/engineLoop.draw";
import { loadDraw } from "@jgengine/core/frame/loadDraw.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

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

const gltfLoader = new GLTFLoader();

function sceneryPieceDraw(placement: SceneryPlacement): EngineDraw {
  return loadDraw({
    key: `gltf:${placement.url}`,
    load: () => gltfLoader.loadAsync(placement.url),
    build: (gltf, parent) => {
      const copy: Object3D = gltf.scene.clone(true);
      copy.traverse((node) => { node.castShadow = true; node.receiveShadow = true; });
      copy.position.set(placement.x, placement.y + placement.lift, placement.z);
      copy.rotation.set(0, placement.yaw, 0);
      copy.scale.setScalar(placement.scale);
      parent.add(copy);
    },
  });
}

/** The town behind the fence, hedges and flowerbeds along the promenade: placed in the scene, drawn here. */
export function authoredSceneryDraw(): EngineDraw {
  const draws = PLACEMENTS.map(sceneryPieceDraw);
  return {
    mount(state) {
      for (const draw of draws) draw.mount?.(state);
    },
    frame(state) {
      for (const draw of draws) draw.frame?.(state, state.delta);
    },
    dispose(state) {
      for (const draw of draws) draw.dispose?.(state);
    },
  };
}

export function AuthoredScenery() {
  useEngineDraw(() => authoredSceneryDraw(), []);
  return null;
}
