import type * as THREE from "three";
import { hidePostfxOverlays, restorePostfxOverlays } from "./postfxOverlay";

/** Reuse the beauty pass's shadow maps while drawing a scene prepass. @internal */
export function renderShadowlessPrepass<T>(
  renderer: Pick<THREE.WebGLRenderer, "shadowMap">,
  scene: THREE.Object3D,
  hiddenOverlays: THREE.Object3D[],
  render: () => T,
): T {
  const shadowMap = renderer.shadowMap;
  const autoUpdate = shadowMap.autoUpdate;
  const needsUpdate = shadowMap.needsUpdate;
  hidePostfxOverlays(scene, hiddenOverlays);
  shadowMap.autoUpdate = false;
  shadowMap.needsUpdate = false;
  try {
    return render();
  } finally {
    shadowMap.autoUpdate = autoUpdate;
    shadowMap.needsUpdate = needsUpdate;
    restorePostfxOverlays(hiddenOverlays);
  }
}
