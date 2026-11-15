import type * as THREE from "three";

/** The share of a scene's exposure and image-based light the lighting zone around the camera asks for. */
export interface LightingZoneFactors {
  exposure: number;
  environment: number;
}

const factors = new WeakMap<THREE.Scene, LightingZoneFactors>();

/** Publishes the camera's current lighting-zone factors on the rendered scene; the post chain and environment light read them. @internal */
export function publishLightingZoneFactors(scene: THREE.Scene, value: LightingZoneFactors | undefined): void {
  if (value === undefined) factors.delete(scene);
  else factors.set(scene, value);
}

/** The lighting-zone factors published on `scene`, or `undefined` when no zoned rig is mounted. @internal */
export function readLightingZoneFactors(scene: THREE.Scene): LightingZoneFactors | undefined {
  return factors.get(scene);
}
