import { useMemo } from "react";
import * as THREE from "three";
import { buildHairCards, type HairCardAuthoring } from "@jgengine/core/material/hairCards";
import type { MaterialAsset } from "@jgengine/core/material/materialAsset";
import { MaterialAssetSurface } from "./materialAsset";
import { useDisposable } from "./useDisposable";

/** Render authored guide ribbons with explicit UVs and strand tangents; motion and collision remain caller-owned. */
export function HairCards({ cards, material }: { cards: HairCardAuthoring; material: MaterialAsset }) {
  const key = JSON.stringify(cards);
  const mesh = useMemo(() => buildHairCards(cards), [key]);
  const geometry = useDisposable(() => {
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.Float32BufferAttribute(mesh.positions, 3));
    next.setAttribute("normal", new THREE.Float32BufferAttribute(mesh.normals, 3));
    next.setAttribute("tangent", new THREE.Float32BufferAttribute(mesh.tangents, 4));
    next.setAttribute("uv", new THREE.Float32BufferAttribute(mesh.uvs, 2));
    next.setIndex(mesh.indices);
    next.computeBoundingBox(); next.computeBoundingSphere();
    return next;
  }, [mesh]);
  return <mesh geometry={geometry} castShadow receiveShadow><MaterialAssetSurface asset={material} /></mesh>;
}
