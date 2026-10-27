import * as THREE from "three";

import { resolveAssetBaseUrl, setAssetBase } from "@jgengine/core/assets/assetBase";

/**
 * Installs the app base URL (pass `import.meta.env.BASE_URL`) so root-absolute asset paths load
 * from under it, and registers {@link resolveAssetBaseUrl} on `THREE.DefaultLoadingManager`,
 * covering `TextureLoader`, drei's `useTexture` / `useGLTF`, and every other loader on the default
 * manager. Call once at app startup, before any game loads.
 */
export function installAssetBase(base: string): void {
  setAssetBase(base);
  THREE.DefaultLoadingManager.setURLModifier(resolveAssetBaseUrl);
}
