import type * as THREE from "three";

/** World-space direction toward the sun, as the mounted sky last placed it. */
export type SkySunDirection = readonly [number, number, number];

const suns = new WeakMap<THREE.Scene, SkySunDirection>();

/**
 * Record where the sky put the sun this frame, so scene pieces that shade by it (water glints) follow
 * the same day-night clock instead of a fixed direction. Called by `Sky` every frame. @internal
 */
export function publishSkySun(scene: THREE.Scene, direction: SkySunDirection): void {
  suns.set(scene, direction);
}

/** The sun direction the scene's sky published, or `undefined` when no sky is mounted. @internal */
export function skySunDirection(scene: THREE.Scene): SkySunDirection | undefined {
  return suns.get(scene);
}
