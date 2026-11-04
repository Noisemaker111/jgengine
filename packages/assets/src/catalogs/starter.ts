import { kaykitCityBuilder, kaykitDungeon, kaykitFurniture, quaterniusStylizedNature } from "../generated/packs";
import type { AssetPack } from "../manifest";
import { buildCatalog, type BuildCatalogOptions } from "./build";

/** The model packs behind the curated starter assets: the same packs, in order, as `STARTER_SOURCE_PACKS`. */
export const STARTER_MODEL_PACKS: readonly AssetPack[] = [kaykitDungeon, kaykitFurniture, kaykitCityBuilder, quaterniusStylizedNature];

/**
 * Catalog restricted to the curated starter packs (props/nature/urban).
 * Prefer this for scaffolds and probes so `asset:prop_crate` etc. resolve
 * without pulling the whole library. Pass `packs` to swap them; full control: {@link buildCatalog}.
 */
export function createStarterCatalog(options: Partial<BuildCatalogOptions> = {}) {
  return buildCatalog({
    ...options,
    packs: options.packs ?? STARTER_MODEL_PACKS,
  });
}
