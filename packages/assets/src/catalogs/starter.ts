import { kaykitCityBuilder, kaykitDungeon, kaykitFurniture, quaterniusStylizedNature } from "../generated/packs";
import type { AssetPack } from "../manifest";
import { buildCatalog, type BuildCatalogOptions } from "./build";

export const STARTER_MODEL_PACKS: readonly AssetPack[] = [kaykitDungeon, kaykitFurniture, kaykitCityBuilder, quaterniusStylizedNature];

export function createStarterCatalog(options: Partial<BuildCatalogOptions> = {}) {
  return buildCatalog({
    ...options,
    packs: options.packs ?? STARTER_MODEL_PACKS,
  });
}
