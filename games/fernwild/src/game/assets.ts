import { buildCatalog } from "@jgengine/assets/catalogs/build";
import { createStarterCatalog } from "@jgengine/assets/catalogs/starter";
import { quaterniusModularMen, quaterniusModularWomen } from "@jgengine/assets/generated/packs";

export const assets = createStarterCatalog({ basePath: "/models" });

const BODY_PACKS = [quaterniusModularMen, quaterniusModularWomen];

export const BODY_SOURCE_IDS: readonly string[] = BODY_PACKS.map((pack) => pack.id);

export const bodyPacks = buildCatalog({ basePath: "/models", packs: BODY_PACKS });
