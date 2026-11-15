import type { ModelConfig, ModelMaterialOverride } from "@jgengine/core/game/playableGame";
import { assets } from "./assets";
import { BUILDABLES, BUILD_IDS } from "./objects/catalog";

// Original geometry uses world units and a deliberately authored ground origin.
const original = (id: string): ModelConfig => ({
  url: new URL(`../../public/art/models/${id}.glb`, import.meta.url).href,
  scale: 1,
  anchor: "origin",
});

/** A model from the engine's asset library, grounded and scaled to the height the catalog asks for. */
function library(id: string, height: number | undefined, material?: ModelMaterialOverride): ModelConfig {
  const ref = assets.resolve(id);
  if (ref === null) throw new Error(`hauntworks: the asset library has no "${id}"`);
  return { url: ref.url, ...(ref.dims === undefined ? {} : { dims: ref.dims }), anchor: "center", ...(height === undefined ? {} : { targetHeight: height }), ...(material === undefined ? {} : { material }) };
}

/** Kinds that share another kind's authored mesh. */
const AUTHORED_AS: Record<string, string> = {
  staff_mechanic: "staff_janitor", staff_entertainer: "staff_janitor", staff_security: "staff_janitor",
  // The legendary attractions are the old fair's grandest rides, raised again in ghost-light.
  ride_cathedral: "ride_haunted", ride_carnival: "ride_enterprise", ride_moongate: "ride_obs",
};
/** The ghost-light a legendary attraction glows with. */
const LEGEND_GLOW: Readonly<Record<string, string>> = { ride_cathedral: "#5fd4b8", ride_carnival: "#b48cff", ride_moongate: "#ffd27a" };

/** Library pieces recoloured for the night: dead wood, cold stone, and props with a faint spectral glow. */
const NIGHT_TINT: Readonly<Record<string, ModelMaterialOverride>> = {
  deco_tree: { color: "#4a4054", roughness: 0.9 },
  deco_pine: { color: "#3d3a52", roughness: 0.9 },
  deco_bush: { color: "#b8a6d8", emissive: "#5fd4b8", emissiveIntensity: 0.35 },
  deco_rock: { color: "#5c5a6e" },
  deco_bench: { color: "#3a3446" },
  deco_bin: { color: "#4a3a34" },
  deco_bones: { color: "#d8d0bc" },
  deco_pumpkins: { color: "#ff8a2a", emissive: "#ff7a1a", emissiveIntensity: 0.6 },
  prop_fogger: { color: "#2a3a3a", emissive: "#5fd4b8", emissiveIntensity: 0.25 },
  prop_shelf: { color: "#5a4a5e", rim: { color: "#9ff5d8", strength: 0.5 } },
  prop_vase: { color: "#8a7aa8", emissive: "#9ff5d8", emissiveIntensity: 0.25 },
  prop_candles: { color: "#3a3040", emissive: "#ffc46b", emissiveIntensity: 0.3 },
};

function objectModel(id: string): ModelConfig {
  const def = BUILDABLES[id]!;
  if (def.libraryModel !== undefined) return library(def.libraryModel.id, def.libraryModel.height, NIGHT_TINT[id]);
  const shared = AUTHORED_AS[id];
  const glow = LEGEND_GLOW[id];
  if (shared !== undefined && glow !== undefined) return { ...original(shared), scale: 1, material: { emissive: glow, emissiveIntensity: 0.45, rim: { color: glow, strength: 1.1 } } };
  if (shared !== undefined) return { ...original(shared), material: { color: def.color } };
  return original(id);
}

export const objectModels = Object.fromEntries(BUILD_IDS.map((id) => [id, objectModel(id)]));
const PACK = "quaternius-animated-characters-pack";
/** The pack's measured standing height in its own units; `person` scales it to metres. */
const CHARACTER_HEIGHT = 3.3;

/** A pale rim on every living body, so a visitor reads against the dark ground. */
const MOONLIGHT_RIM = { color: "#b9c8ff", strength: 0.55, power: 2.2 } as const;

/** A Quaternius character scaled to `height`, each named material slot painted from the haunt's palette. */
function person(model: string, height: number, paint: Readonly<Record<string, string>>, material?: ModelMaterialOverride): ModelConfig {
  const ref = assets.resolve(`${PACK}/${model}`);
  if (ref === null) throw new Error(`hauntworks: the asset library has no "${model}"`);
  const slots = Object.entries(paint);
  return {
    url: ref.url,
    scale: height / CHARACTER_HEIGHT,
    anchor: "origin",
    materialAssets: slots.map(([slot, color]) => ({ schemaVersion: 1, id: `${model}.${slot}`, name: slot, family: "standard", capabilities: ["pbr"], surface: { color, roughness: 0.85, metalness: 0 } })),
    materialAssignments: slots.map(([slot]) => ({ materialId: `${model}.${slot}`, selector: { slot } })),
    material: material ?? { rim: MOONLIGHT_RIM },
  };
}

/** A ghost: a character washed out to a translucent, glowing shade of one colour. */
function ghost(model: string, height: number, glow: string): ModelConfig {
  const ref = assets.resolve(`${PACK}/${model}`);
  if (ref === null) throw new Error(`hauntworks: the asset library has no "${model}"`);
  return {
    url: ref.url,
    scale: height / CHARACTER_HEIGHT,
    anchor: "origin",
    material: { color: glow, emissive: glow, emissiveIntensity: 0.9, alphaMode: "blend", opacity: 0.55, doubleSided: true, rim: { color: "#ffffff", strength: 1.2, power: 1.8 } },
  };
}

const SKIN = ["#f1c9a0", "#d9a578", "#a8704a", "#7a4b32", "#e8b88f"] as const;
const HAIR = ["#3a2a22", "#6b4a2f", "#c98f3f", "#1f1b1a", "#8a4b2a"] as const;

/** The living wear what they wore to the pier at night: hoodies, date clothes, a hunter's khaki, a crew's bright jackets. */
const VISITOR_LOOKS: Record<string, ModelConfig> = {
  visitor_teen: person("Casual_Male", 1.85, { Skin: SKIN[0], Hair: HAIR[0], Shirt: "#c9405a", Pants: "#2c3a52" }),
  visitor_couple: person("Casual2_Female", 1.8, { Skin: SKIN[4], Hair: HAIR[4], Shirt: "#e8b0d0", Pants: "#3a3050" }),
  visitor_family: person("Casual3_Male", 1.85, { Skin: SKIN[2], Hair: HAIR[1], Shirt: "#f0c860", Pants: "#4a3a3a" }),
  visitor_skeptic: person("Suit_Male", 1.9, {}),
  visitor_hunter: person("Soldier_Male", 1.9, {}, { rim: { color: "#ff6b6b", strength: 0.7 } }),
  visitor_tvcrew: person("Casual_Bald", 1.85, {}, { rim: { color: "#ff9a3a", strength: 0.8 } }),
};

/** The ghosts in residence: each a translucent shade in its own glow. */
const GHOST_LOOKS: Record<string, ModelConfig> = {
  // Larger than life, so a resident reads from the build camera over the crowd.
  ghost_child: ghost("OldClassy_Female", 2.0, "#c8f5ff"),
  ghost_sailor: ghost("Pirate_Male", 2.8, "#5fd4b8"),
  ghost_poltergeist: ghost("Goblin_Male", 2.3, "#b48cff"),
  ghost_banshee: ghost("Witch", 3.0, "#9ff5d8"),
  ghost_bride: ghost("Kimono_Female", 2.7, "#f3f0ff"),
  ghost_keeper: ghost("OldClassy_Male", 2.8, "#ffd27a"),
};

export const entityModels = {
  ...VISITOR_LOOKS,
  ...GHOST_LOOKS,
  // The exorcist: an old man in black with a white collar's worth of rim light.
  visitor_exorcist: person("Doctor_Male_Old", 1.9, {}, { color: "#3a3446", rim: { color: "#ffffff", strength: 1.1, power: 2 } }),
  // The haunt's spooks: a ghoul, a gremlin, a phantom barker and a stone sentry, each with one lantern-amber shape so they read in a crowd.
  crew_handyman: person("Zombie_Male", 1.85, {}, { color: "#8aa878", rim: { color: "#ffc46b", strength: 0.6 } }),
  crew_mechanic: person("Goblin_Female", 1.3, {}, { rim: { color: "#ffc46b", strength: 0.7 } }),
  crew_entertainer: person("Wizard", 1.95, {}, { color: "#6b4f9e", emissive: "#6b4f9e", emissiveIntensity: 0.25, rim: { color: "#ffc46b", strength: 0.8 } }),
  crew_security: person("Knight_Male", 2.0, {}, { color: "#6e6c7a", metalness: 0.1, roughness: 0.95, rim: { color: "#ffc46b", strength: 0.5 } }),
};
