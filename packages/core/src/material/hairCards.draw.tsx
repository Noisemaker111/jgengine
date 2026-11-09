import { useRef } from "react";
import * as THREE from "three";
import { buildHairCards, type HairCardAuthoring } from "@jgengine/core/material/hairCards";
import type { MaterialAsset } from "@jgengine/core/material/materialAsset";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { useMaterialAssetMaterial } from "./materialAsset.draw";

export function hairCardsDraw(cards: HairCardAuthoring, material: THREE.Material): EngineDraw {
  const mesh = buildHairCards(cards);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("tangent", new THREE.Float32BufferAttribute(mesh.tangents, 4));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(mesh.uvs, 2));
  geometry.setIndex(mesh.indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  let object: THREE.Mesh | null = null;
  return {
    mount(state: EngineFrameState) {
      object = new THREE.Mesh(geometry, material);
      object.castShadow = true;
      object.receiveShadow = true;
      state.scene.add(object);
    },
    dispose(state: EngineFrameState) {
      if (object !== null) state.scene.remove(object);
      geometry.dispose();
      object = null;
    },
  };
}

/** Render authored guide ribbons with explicit UVs and strand tangents; motion and collision remain caller-owned. */
export function HairCards({ cards, material: asset }: { cards: HairCardAuthoring; material: MaterialAsset }) {
  const key = JSON.stringify(cards);
  const material = useMaterialAssetMaterial(asset);
  const latest = useRef({ cards, material });
  latest.current = { cards, material };
  useEngineDraw(() => hairCardsDraw(latest.current.cards, latest.current.material), [key, material]);
  return null;
}
