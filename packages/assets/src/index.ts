/**
 * @jgengine/assets
 *
 * Curated CC0 3D asset packs, catalogs, and download tooling for JGengine games.
 *
 * ## Quick start
 *
 * 1. Download starter assets:
 *    ```bash
 *    npx @jgengine/assets init
 *    ```
 *
 * 2. Use the starter catalog in your game:
 *    ```ts
 *    import { createStarterCatalog } from "@jgengine/assets/catalogs/starter";
 *
 *    export const assets = createStarterCatalog({ basePath: "/models" });
 *    ```
 *
 * 3. Pull additional packs:
 *    ```bash
 *    npx @jgengine/assets pull kenney-space-kit kenney-car-kit
 *    ```
 *
 * ## Asset sources
 *
 * | Source   | Packs | License | Formats |
 * |----------|-------|---------|---------|
 * | Kenney   | 20+   | CC0     | GLB     |
 * | Quaternius | 40+ | CC0     | GLB/FBX |
 */

export type { AssetEntry, AssetPack, PackManifest, PullResult } from "./manifest";
export { kenneyPacks, kenneyPackById } from "./sources/kenney";
export { createStarterCatalog } from "./catalogs/starter";
export type { StarterCatalogOptions } from "./catalogs/starter";
