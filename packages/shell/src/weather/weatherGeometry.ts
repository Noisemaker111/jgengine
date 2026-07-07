import * as THREE from "three";

import { createWeatherSeedAttributes } from "./weatherMath";

export function createWeatherQuadGeometry(maxCount: number, seed: number): THREE.InstancedBufferGeometry {
  const count = Math.max(0, Math.floor(maxCount));
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3),
  );
  geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);

  const attributes = createWeatherSeedAttributes(count, seed);
  geometry.setAttribute("aSpawn", new THREE.InstancedBufferAttribute(attributes.spawn, 3));
  geometry.setAttribute("aDrift", new THREE.InstancedBufferAttribute(attributes.drift, 1));
  geometry.instanceCount = count;
  return geometry;
}
