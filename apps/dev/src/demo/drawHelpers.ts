import * as THREE from "three";

export function std(color: string, roughness = 0.5, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, ...extra });
}

export function box(
  parent: THREE.Object3D,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  material: THREE.Material,
  rotation?: readonly [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.set(position[0], position[1], position[2]);
  if (rotation !== undefined) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

export function mesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position?: readonly [number, number, number],
  rotation?: readonly [number, number, number],
): THREE.Mesh {
  const next = new THREE.Mesh(geometry, material);
  if (position !== undefined) next.position.set(position[0], position[1], position[2]);
  if (rotation !== undefined) next.rotation.set(rotation[0], rotation[1], rotation[2]);
  parent.add(next);
  return next;
}

import { createElement, useEffect, type ReactNode } from "react";
import { SceneObjectAttach } from "@jgengine/core/frame/useEngineDraw.draw";

/** Attaches pre-built meshes under the scene context; caller owns geometry, materials dispose with the attach. */
export function AttachedMeshes({ meshes, castShadow = false, receiveShadow = false }: {
  meshes: readonly THREE.Mesh[];
  castShadow?: boolean;
  receiveShadow?: boolean;
}): ReactNode {
  useEffect(() => () => {
    for (const m of meshes) {
      const material = m.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    }
  }, [meshes]);
  return meshes.map((m, index) => {
    m.castShadow = castShadow;
    m.receiveShadow = receiveShadow;
    return createElement(SceneObjectAttach, { key: index, object: m });
  });
}
