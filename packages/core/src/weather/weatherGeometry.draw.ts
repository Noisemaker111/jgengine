import * as THREE from "three";

import { createWeatherSeedAttributes } from "./weatherMath";

/** @internal */
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

/**
 * Where a particle field sits and how it sorts: the props every field shares.
 * @internal
 */
export interface WeatherFieldPlacement {
  followCamera?: boolean | undefined;
  origin?: readonly [number, number, number] | undefined;
  volume?: readonly [number, number, number] | undefined;
  frustumCulled?: boolean | undefined;
  renderOrder?: number | undefined;
}

/**
 * A field's mesh, in the scene. A field that follows the camera is always in view, so it is never culled.
 * @internal
 */
export function mountWeatherMesh(scene: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, placement: WeatherFieldPlacement, renderOrder: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = placement.frustumCulled ?? !(placement.followCamera ?? true);
  mesh.renderOrder = placement.renderOrder ?? renderOrder;
  scene.add(mesh);
  return mesh;
}

/**
 * Centre a field on the camera, or on its own origin, and size it.
 * @internal
 */
export function anchorWeatherField(
  uniforms: { uAnchor: { value: unknown }; uVolume: { value: unknown } },
  camera: THREE.Camera,
  placement: WeatherFieldPlacement,
  defaultVolume: readonly [number, number, number],
): void {
  const target = uniforms.uAnchor.value as THREE.Vector3;
  if (placement.followCamera ?? true) target.copy(camera.position);
  else {
    const origin = placement.origin ?? [0, 0, 0];
    target.set(origin[0], origin[1], origin[2]);
  }
  const volume = placement.volume ?? defaultVolume;
  (uniforms.uVolume.value as THREE.Vector3).set(volume[0], volume[1], volume[2]);
}
