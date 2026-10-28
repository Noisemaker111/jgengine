import * as THREE from "three";

import type { NatureMesh } from "./natureMesh";

/** A three geometry for a nature mesh, its sRGB vertex colours converted to linear. The caller owns it. */
export function natureGeometry(mesh: NatureMesh): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const colors = new Float32Array(mesh.colors.length);
  const color = new THREE.Color();
  for (let i = 0; i < colors.length; i += 3) {
    color.setRGB(mesh.colors[i]!, mesh.colors[i + 1]!, mesh.colors[i + 2]!, THREE.SRGBColorSpace);
    colors[i] = color.r;
    colors[i + 1] = color.g;
    colors[i + 2] = color.b;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

let material: THREE.MeshStandardMaterial | null = null;

/** The one material every nature mesh shares: vertex colours, matte; leaf blades carry both faces themselves. */
export function natureMaterial(): THREE.MeshStandardMaterial {
  material ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  return material;
}
