import * as THREE from "three";

/**
 * The app base URL every root-absolute asset path resolves under. `/` (the
 * default) leaves URLs untouched — standalone game runners serve assets from
 * the site root. The website serves the runner under `/play/`, where a game's
 * `/models/…` or `/materials/…` must load from `/play/models/…`.
 * @internal
 */
let assetBase = "/";

/**
 * Resolves a root-absolute asset URL (`/models/…`, `/materials/…`) against the
 * installed app base. Relative, protocol-relative, absolute-scheme (`https:`,
 * `blob:`, `data:`), and already-based URLs pass through unchanged. Installed
 * as the URL modifier on THREE loading managers so every model and texture
 * load resolves correctly wherever the app is mounted.
 */
export function resolveAssetBaseUrl(url: string): string {
  if (assetBase === "/" || !url.startsWith("/") || url.startsWith("//") || url.startsWith(assetBase)) {
    return url;
  }
  return `${assetBase.replace(/\/+$/, "")}${url}`;
}

/**
 * Installs the app base URL (pass `import.meta.env.BASE_URL`) so root-absolute
 * asset paths load from under it. Call once at app startup, before any game
 * loads. Bases that are not root-absolute (`/`, `./`) reset to the pass-through
 * default. Also registers {@link resolveAssetBaseUrl} on
 * `THREE.DefaultLoadingManager`, covering `TextureLoader`, drei's `useTexture`
 * / `useGLTF`, and every other loader on the default manager.
 */
export function installAssetBase(base: string): void {
  const normalized = base.endsWith("/") ? base : `${base}/`;
  assetBase = normalized.startsWith("/") && !normalized.startsWith("//") ? normalized : "/";
  THREE.DefaultLoadingManager.setURLModifier(resolveAssetBaseUrl);
}
