import { libraryModel, libraryModelCredits } from "@jgengine/assets/catalogs/modelLibrary";
import type { ModelConfig } from "@jgengine/core/game/playableGame";

import { CAR_MODEL_NAME, CAST_MODEL_NAMES } from "./cast";

/**
 * Street furniture from the engine's realistic model library: real-world-size CC0 scans, each with a
 * near and a far detail level. Names (not files) are the contract; `bun run provision harbor-heat`
 * pulls every name below (and the cast and traffic in `cast.ts`) from its source, and the credits list follows from the same names.
 */
const PROP_MODELS: Record<string, string> = {
  obj_streetlight: "city/street-lamp",
  obj_bench: "park/bench",
  obj_hydrant: "city/fire-hydrant",
  obj_trashcan: "city/trash-can",
  obj_dumpster: "city/utility-cabinet",
  obj_barrier: "city/road-barrier",
  obj_crate_dock: "industrial/wooden-crate",
  obj_barrel: "industrial/barrel",
  obj_planter: "park/potted-plant",
  obj_hedge: "park/planter-box",
  obj_cactus: "nature/quiver-tree",
  obj_shade_tree: "nature/jacaranda",
  obj_patio: "park/patio-set",
  obj_picnic: "park/picnic-table",
  obj_dog: "creature/dog-beagle",
  obj_dog_shepherd: "creature/dog-shepherd",
  obj_duck: "creature/duck",
};

export const LIBRARY_MODEL_NAMES: readonly string[] = [...new Set([...Object.values(PROP_MODELS), ...CAST_MODEL_NAMES, CAR_MODEL_NAME])];

/** The lamp head glows after dark; only its glass takes the warm self-lit finish. */
const LAMP_GLASS = { emissive: "#ffcf94", emissiveIntensity: 0.9, materials: ["street_lamp_01_glass"] };

export const LIBRARY_PROPS: Record<string, ModelConfig> = Object.fromEntries(
  Object.entries(PROP_MODELS).map(([id, name]) => {
    const model = libraryModel(name);
    return [id, id === "obj_streetlight" ? { ...model, material: LAMP_GLASS } : model];
  }),
);

/** One credit line per library model the city uses: title, author, license and source page. */
export const LIBRARY_CREDITS: readonly string[] = libraryModelCredits(LIBRARY_MODEL_NAMES);
