import type { BuilderAssetContext } from "@llmville/game/builder/assets";
import { getWorldModelAsset } from "@llmville/game/world/worldModelCatalog";
import { getCachedModelBounds } from "@/scene/modelBoundsCache";

/** Builder asset context wired to the game catalog and the runtime GLB bounds cache. */
export const BUILDER_ASSETS: BuilderAssetContext = {
  getModelAsset: (modelKey) => getWorldModelAsset(modelKey),
  getMeasuredModelBounds: (modelPath) => getCachedModelBounds(modelPath),
};
