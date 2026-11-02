import { buildCatalog } from "@jgengine/assets/catalogs/build";
import { createStarterCatalog } from "@jgengine/assets/catalogs/starter";

/** Curated props/nature/urban starter packs — resolve asset:prop_crate etc. */
export const assets = createStarterCatalog({ basePath: "/models" });

/** The survivor's body packs: Quaternius Ultimate Modular Men and Women. */
export const BODY_SOURCE_IDS = ["quaternius-modular-men", "quaternius-modular-women"] as const;

export const bodyPacks = buildCatalog({ basePath: "/models", sources: [...BODY_SOURCE_IDS] });
