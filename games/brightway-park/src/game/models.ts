import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { assets } from "./assets";
import { BUILDABLES, BUILD_IDS } from "./objects/catalog";

// Original geometry uses world units and a deliberately authored ground origin.
const original = (id: string): ModelConfig => ({
  url: new URL(`../../public/art/models/${id}.glb`, import.meta.url).href,
  scale: 1,
  anchor: "origin",
});

/** A model from the engine's asset library, grounded and scaled to the height the catalog asks for. */
function library(id: string, height: number | undefined): ModelConfig {
  const ref = assets.resolve(id);
  if (ref === null) throw new Error(`brightway-park: the asset library has no "${id}"`);
  return { url: ref.url, ...(ref.dims === undefined ? {} : { dims: ref.dims }), anchor: "center", ...(height === undefined ? {} : { targetHeight: height }) };
}

/** Kinds that share another kind's authored mesh. */
const AUTHORED_AS: Record<string, string> = { staff_mechanic: "staff_janitor", staff_entertainer: "staff_janitor", staff_security: "staff_janitor" };

function objectModel(id: string): ModelConfig {
  const def = BUILDABLES[id]!;
  if (def.libraryModel !== undefined) return library(def.libraryModel.id, def.libraryModel.height);
  const shared = AUTHORED_AS[id];
  if (shared !== undefined) return { ...original(shared), material: { color: def.color } };
  return original(id);
}

export const objectModels = Object.fromEntries(BUILD_IDS.map((id) => [id, objectModel(id)]));
const PACK = "quaternius-animated-characters-pack";
/** The pack's measured standing height in its own units; `person` scales it to metres. */
const CHARACTER_HEIGHT = 3.3;

/** A Quaternius character scaled to `height`, each named material slot painted from the park palette. */
function person(model: string, height: number, paint: Readonly<Record<string, string>>): ModelConfig {
  const ref = assets.resolve(`${PACK}/${model}`);
  if (ref === null) throw new Error(`brightway-park: the asset library has no "${model}"`);
  const slots = Object.entries(paint);
  return {
    url: ref.url,
    scale: height / CHARACTER_HEIGHT,
    anchor: "origin",
    materialAssets: slots.map(([slot, color]) => ({ schemaVersion: 1, id: `${model}.${slot}`, name: slot, family: "standard", capabilities: ["pbr"], surface: { color, roughness: 0.85, metalness: 0 } })),
    materialAssignments: slots.map(([slot]) => ({ materialId: `${model}.${slot}`, selector: { slot } })),
  };
}

const SKIN = ["#f1c9a0", "#d9a578", "#a8704a", "#7a4b32", "#e8b88f"] as const;
const HAIR = ["#3a2a22", "#6b4a2f", "#c98f3f", "#1f1b1a", "#8a4b2a"] as const;
const PANTS = "#3f6e8c";

/** Guests wear palette shirts: coral, sea, gold, lawn and paper over the same Casual bodies. */
const GUEST_LOOKS: Record<string, ModelConfig> = {
  guest_a: person("Casual_Male", 1.9, { Skin: SKIN[0], Hair: HAIR[0], Shirt: "#ef7059", Pants: PANTS }),
  guest_b: person("Casual_Female", 1.8, { Skin: SKIN[1], Hair: HAIR[2], Shirt: "#77b8c8", Pants: "#6a5a8c" }),
  guest_c: person("Casual2_Male", 1.9, { Skin: SKIN[3], Hair: HAIR[3], Shirt: "#edbc5c", Pants: PANTS }),
  guest_d: person("Casual2_Female", 1.8, { Skin: SKIN[4], Hair: HAIR[4], Shirt: "#7fb05a", Pants: "#4a5a6a" }),
  guest_e: person("Casual3_Male", 1.9, { Skin: SKIN[2], Hair: HAIR[1], Shirt: "#fff4da", Pants: "#6a4a3a" }),
};
export const entityModels = {
  ...GUEST_LOOKS,
  // Hired staff each carry one teal shape (cap or apron) so they read in a crowd.
  crew_handyman: person("Worker_Male", 1.9, { Skin: SKIN[0], Shirt: "#fff4da", Vest: "#edbc5c", Pants: "#3a4a52", Hat: "#247f83" }),
  crew_mechanic: person("Worker_Female", 1.8, { Skin: SKIN[2], Shirt: "#fff4da", Vest: "#ef7059", Pants: "#3a4a52", Hat: "#247f83" }),
  crew_entertainer: person("Chef_Male", 1.9, { Skin: SKIN[1], Clothes: "#247f83", Band: "#edbc5c", DarkClothes: "#fff4da", Hair: HAIR[1] }),
  crew_security: person("Worker_Male", 1.9, { Skin: SKIN[3], Shirt: "#247f83", Vest: "#247f83", Pants: "#26383f", Hat: "#247f83" }),
};
