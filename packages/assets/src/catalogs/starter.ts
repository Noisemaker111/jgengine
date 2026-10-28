import { STARTER_SOURCE_PACKS } from "../packs/starter";
import { buildCatalog, type BuildCatalogOptions } from "./build";

/**
 * Catalog restricted to the curated starter packs (props/nature/urban).
 * Prefer this for scaffolds and probes so `asset:prop_crate` etc. resolve
 * without pulling the whole library. Full index: {@link buildCatalog}.
 */
export function createStarterCatalog(options: BuildCatalogOptions = {}) {
  return buildCatalog({
    ...options,
    sources: options.sources ?? STARTER_SOURCE_PACKS,
  });
}
