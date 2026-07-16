import { buildCatalog } from "@jgengine/assets/catalogs/build";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

/** Preferred CC0 packs — pull + reindex to light up MODEL_PLAN ids. */
export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  sources: [
    "quaternius-downtown-city",
    "quaternius-stylized-nature",
    "quaternius-base-characters",
    "kaykit-adventurers",
  ],
});
