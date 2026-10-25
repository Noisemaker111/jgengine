/**
 * Fire-and-forget wrapper that loads the real preloader on demand.
 * `sceneAssetPreload.ts` statically imports three.js, so importing it from any
 * module reachable from `main.tsx` or the landing/login chunks would put the
 * whole three-vendor chunk on the first-paint critical path.
 */
export function preloadSceneAssets(): void {
  void import("@/scene/sceneAssetPreload").then((module) => module.preloadSceneAssets());
}
