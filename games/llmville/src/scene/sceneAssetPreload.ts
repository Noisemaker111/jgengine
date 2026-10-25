import * as THREE from "three";
import { createSceneAssetPreloader } from "@jgengine/core/scene/assetPreload";

const originalOnError = THREE.DefaultLoadingManager.onError;
THREE.DefaultLoadingManager.onError = (url: string) => {
  const urlStr = url || "";
  if (urlStr.includes("Textures/") || urlStr.toLowerCase().includes("colormap")) {
    if (import.meta.env.DEV) {
      console.debug("[GLTF] Suppressed external texture reference (expected for some imported assets):", urlStr);
    }
    return;
  }
  if (originalOnError) {
    (originalOnError as (url: string) => void)(url);
  } else {
    console.error("Loading error:", url);
  }
};

const sceneAssetPreloader = createSceneAssetPreloader((url) => {
  void fetch(url, { cache: "force-cache" });
});

export function preloadSceneAssets(): void {
  sceneAssetPreloader.preloadUrls(["/models/hardware/low-end-gpu.glb"]);
}