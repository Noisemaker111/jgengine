import { buildCatalog, type BuildCatalogOptions } from "./build";

export function createStarterCatalog(options: BuildCatalogOptions = {}) {
  return buildCatalog(options);
}
