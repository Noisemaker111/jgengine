import type * as THREE from "three";
import { drawPrepassExcluding, type PrepassExclusion, type PrepassListRenderer } from "./postfxOverlay.draw";

/**
 * Draw a prepass with the world matrices the beauty pass already built. A postfx prepass renders the
 * same scene a few milliseconds later in the same frame, so three's `updateMatrixWorld` walk there
 * recomposes a graph nothing has moved — skipping it removes one full scene-graph walk per frame.
 * @internal
 */
export function renderWithCurrentMatrices<T>(scene: THREE.Object3D, render: () => T): T {
  const autoUpdate = scene.matrixWorldAutoUpdate;
  scene.matrixWorldAutoUpdate = false;
  try {
    return render();
  } finally {
    scene.matrixWorldAutoUpdate = autoUpdate;
  }
}

/**
 * Reuse the beauty pass's shadow maps and world matrices while drawing a scene prepass, leaving out
 * what `excluded` matches (see {@link drawPrepassExcluding}).
 * @internal
 */
export function renderShadowlessPrepass<T>(
  renderer: Pick<THREE.WebGLRenderer, "shadowMap"> & PrepassListRenderer,
  scene: THREE.Object3D,
  excluded: PrepassExclusion,
  render: () => T,
): T {
  const shadowMap = renderer.shadowMap;
  const autoUpdate = shadowMap.autoUpdate;
  const needsUpdate = shadowMap.needsUpdate;
  shadowMap.autoUpdate = false;
  shadowMap.needsUpdate = false;
  try {
    return drawPrepassExcluding(renderer, scene, excluded, () => renderWithCurrentMatrices(scene, render));
  } finally {
    shadowMap.autoUpdate = autoUpdate;
    shadowMap.needsUpdate = needsUpdate;
  }
}
