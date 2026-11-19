import * as THREE from "three";

import { resolveAssetBaseUrl, setAssetBase } from "@jgengine/core/assets/assetBase";

export function installAssetBase(base: string): void {
  setAssetBase(base);
  THREE.DefaultLoadingManager.setURLModifier(resolveAssetBaseUrl);
}
