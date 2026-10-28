import * as THREE from "three";

import { TOON_RAMP_TEXELS, toonRampKey, toonRampTexels, type ToonRamp } from "./toonRamp";

const materials = new Map<string, THREE.MeshToonMaterial>();

/** @internal The ramp as a 1-row gradient texture a toon material reads. The caller owns it. */
export function toonRampTexture(ramp: ToonRamp): THREE.DataTexture {
  const texels = toonRampTexels(ramp);
  const data = new Uint8Array(TOON_RAMP_TEXELS * 4);
  for (let i = 0; i < TOON_RAMP_TEXELS; i += 1) {
    const value = texels[i] ?? 0;
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, TOON_RAMP_TEXELS, 1);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * A shared vertex-coloured toon material for a ramp: one per distinct ramp, so every mesh drawn with
 * the same look batches into the same program.
 * @capability toon-ramp cel-shading ramp a toon material reads: flat light bands with an optional soft edge
 */
export function toonRampMaterial(ramp: ToonRamp): THREE.MeshToonMaterial {
  const key = toonRampKey(ramp);
  const cached = materials.get(key);
  if (cached !== undefined) return cached;
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRampTexture(ramp), side: THREE.DoubleSide });
  materials.set(key, material);
  return material;
}
