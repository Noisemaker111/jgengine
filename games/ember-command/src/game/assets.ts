import { buildCatalog } from "@jgengine/assets/catalogs/build";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

export const ASSET_SOURCE_IDS = [
  "quaternius-lowpoly-rpg-characters",
  "quaternius-lowpoly-medieval-village-pack",
  "quaternius-lowpoly-medieval-buildings",
  "quaternius-fantasy-props",
  "quaternius-stylized-nature",
  "quaternius-lowpoly-crops-pack",
  "quaternius-5-low-poly-animals",
] as const;

/** One studio, one proportion: Quaternius characters, village, buildings, props and stylized nature. */
export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  sources: [...ASSET_SOURCE_IDS],
});
