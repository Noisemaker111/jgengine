import { buildCatalog } from "@jgengine/assets/catalogs/build";
import { createStarterCatalog } from "@jgengine/assets/catalogs/starter";
import { quaterniusModularMen, quaterniusModularWomen } from "@jgengine/assets/generated/packs";

/** Curated props/nature/urban starter packs — resolve asset:prop_crate etc. */
export const assets = createStarterCatalog({ basePath: "/models" });

/** The survivor's body packs: Quaternius Ultimate Modular Men and Women. */
const BODY_PACKS = [quaterniusModularMen, quaterniusModularWomen];

export const BODY_SOURCE_IDS: readonly string[] = BODY_PACKS.map((pack) => pack.id);

export const bodyPacks = buildCatalog({ basePath: "/models", packs: BODY_PACKS });
