import { buildCatalog } from "@jgengine/assets/catalogs/build";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

/** One studio, one proportion: Quaternius characters, village, buildings, props and stylized nature. */
export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  sources: [
    "quaternius-lowpoly-rpg-characters",
    "quaternius-lowpoly-medieval-village-pack",
    "quaternius-lowpoly-medieval-buildings",
    "quaternius-fantasy-props",
    "quaternius-stylized-nature",
  ],
});
