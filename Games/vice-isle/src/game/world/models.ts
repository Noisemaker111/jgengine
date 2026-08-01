import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveModelPlan, type ModelPick } from "@jgengine/shell/render/resolveModel";

import { assets } from "../assets";
import { BUILDING_SPECS } from "./buildings";

const CHAR = "kaykit-adventurers";
const CITY = "kaykit-city-builder";
const SPACE = "kaykit-space-base";
const NATURE = "quaternius-stylized-nature";
const DUNGEON = "kaykit-dungeon";
const FURN = "kaykit-furniture";

/**
 * Casting note (asset-catalog gap): every rigged human this repository can pull is a fantasy
 * adventurer, so the isle is cast out of the three KayKit bodies whose SILHOUETTE can pass for
 * modern street wear — `Rogue` (jacket), `Rogue_Hooded` (hoodie) and `Barbarian` (bare torso) —
 * with `Knight`'s plate reserved for police, where a hard-shell torso reads as a vest. `Mage` is
 * cast nowhere, in any role or fallback: the pointed hat and robe are the one shape no tint can
 * talk out of being a wizard. Overrides multiply the pack's own atlas rather than replacing it, so
 * these are wardrobe tints — the cloth and stitching detail survives them.
 */
export const entityModels: Record<string, ModelConfig> = resolveModelPlan(assets, {
  street_runner: {
    model: `${CHAR}/Rogue`,
    fallbackModel: `${CHAR}/Rogue_Hooded`,
    style: { targetHeight: 1.8, material: { color: "#f0ead9" } },
  },
  ped_beach: {
    model: `${CHAR}/Barbarian`,
    fallbackModel: `${CHAR}/Rogue`,
    style: { targetHeight: 1.76, material: { color: "#ffd6ae" } },
  },
  ped_city: {
    model: `${CHAR}/Rogue`,
    fallbackModel: `${CHAR}/Rogue_Hooded`,
    style: { targetHeight: 1.78, material: { color: "#dde6f0" } },
  },
  ped_docks: {
    model: `${CHAR}/Rogue_Hooded`,
    fallbackModel: `${CHAR}/Rogue`,
    style: { targetHeight: 1.8, material: { color: "#9aa387" } },
  },
  contact_marco: {
    model: `${CHAR}/Rogue`,
    fallbackModel: `${CHAR}/Rogue_Hooded`,
    style: { targetHeight: 1.84, material: { color: "#f7f1dc" } },
  },
  ganger_dock: {
    model: `${CHAR}/Rogue_Hooded`,
    fallbackModel: `${CHAR}/Rogue`,
    style: { targetHeight: 1.84, material: { color: "#c8455a" } },
  },
  ganger_enforcer: {
    model: `${CHAR}/Barbarian`,
    fallbackModel: `${CHAR}/Rogue_Hooded`,
    style: { targetHeight: 2.02, material: { color: "#8f2434" } },
  },
  kingpin_sal: {
    model: `${CHAR}/Knight`,
    fallbackModel: `${CHAR}/Barbarian`,
    style: {
      targetHeight: 2.15,
      material: { color: "#f0e0ac", metalness: 0.34, roughness: 0.34, rim: { color: "#ffd98a", strength: 0.7 } },
    },
  },
  cop_patrol: {
    model: `${CHAR}/Knight`,
    fallbackModel: `${CHAR}/Rogue`,
    style: { targetHeight: 1.86, material: { color: "#2c4a8c" } },
  },
  cop_swat: {
    model: `${CHAR}/Knight`,
    fallbackModel: `${CHAR}/Rogue_Hooded`,
    style: { targetHeight: 1.92, material: { color: "#1b1f28" } },
  },
  bounty_mark: {
    model: `${CHAR}/Barbarian`,
    fallbackModel: `${CHAR}/Rogue`,
    style: { targetHeight: 1.94, material: { color: "#7c3aa0", rim: { color: "#ff7ad4", strength: 0.5 } } },
  },

  car_compact: {
    model: `${CITY}/car_hatchback`,
    fallbackModel: `${CITY}/car_sedan`,
    style: { targetHeight: 1.35, material: { color: "#f2c14e" } },
  },
  // Sedan + red tint: station-wagon mesh read as a green estate and ignored the catalog body color (#1519).
  car_muscle: {
    model: `${CITY}/car_sedan`,
    fallbackModel: `${CITY}/car_hatchback`,
    style: { targetHeight: 1.38, material: { color: "#d64545" } },
  },
  car_sport: {
    model: `${CITY}/car_sedan`,
    fallbackModel: `${CITY}/car_hatchback`,
    style: { targetHeight: 1.3, material: { color: "#33c1b1" } },
  },
  car_cop: {
    model: `${CITY}/car_police`,
    fallbackModel: `${CITY}/car_taxi`,
    style: { targetHeight: 1.4 },
  },
  car_suv: {
    model: `${CITY}/car_stationwagon`,
    fallbackModel: `${CITY}/car_sedan`,
    style: { targetHeight: 1.75, material: { color: "#6b7d52" } },
  },
  car_bus: {
    // Large boxy truck body as an island shuttle bus; scaled up to bus height. Never Kenney.
    model: `${SPACE}/spacetruck_large`,
    fallbackModel: `${SPACE}/spacetruck`,
    style: { targetHeight: 3.3, material: { color: "#e0a53c" } },
  },
  air_helicopter: {
    model: `${SPACE}/lander_B`,
    fallbackModel: `${CITY}/car_sedan`,
    style: { targetHeight: 2.2, material: { color: "#e7e9ee", metalness: 0.55, roughness: 0.32 } },
  },
  air_trainer: {
    model: `${SPACE}/lander_A`,
    fallbackModel: `${CITY}/car_sedan`,
    style: { targetHeight: 1.8, material: { color: "#f4d35e", metalness: 0.28, roughness: 0.45 } },
  },
  air_prop: {
    model: `${SPACE}/spacetruck`,
    fallbackModel: `${CITY}/car_stationwagon`,
    style: { targetHeight: 2, material: { color: "#e85d4a", metalness: 0.35, roughness: 0.38 } },
  },
  air_jet: {
    model: `${SPACE}/spacetruck_large`,
    fallbackModel: `${CITY}/car_police`,
    style: { targetHeight: 1.65, material: { color: "#697582", metalness: 0.72, roughness: 0.25 } },
  },
  air_vtol: {
    model: `${SPACE}/lander_base`,
    fallbackModel: `${CITY}/car_police`,
    style: { targetHeight: 1.9, material: { color: "#3d5a45", metalness: 0.68, roughness: 0.3 } },
  },
});

/**
 * Street-tree casting. The CC0 packs ship no palm, so the boulevard is planted with the tallest
 * green-leaved trunks available, at three heights so a boardwalk is never one repeated shape down
 * its whole run. `TwistedTree` was tried for its leaning-palm silhouette and rejected: its crown
 * texture is deep autumn red (`Leaves_TwistedTree_C`), which no multiply can turn tropical — it
 * survives only as the occasional flame tree, which is a real Miami street tree.
 *
 * No colour override on any of them: the pack's bark and frond maps ship with the repository and
 * resolve, and the flat green tint that used to stand in for them was multiplying that away.
 */
const PALMS: readonly { id: string; model: string; fallbackModel: string; targetHeight: number }[] = [
  { id: "obj_palm", model: `${NATURE}/CommonTree_2`, fallbackModel: `${NATURE}/CommonTree_1`, targetHeight: 7.6 },
  { id: "obj_palm_tall", model: `${NATURE}/CommonTree_4`, fallbackModel: `${NATURE}/CommonTree_2`, targetHeight: 9 },
  { id: "obj_palm_low", model: `${NATURE}/CommonTree_5`, fallbackModel: `${NATURE}/CommonTree_3`, targetHeight: 6.2 },
  { id: "obj_flametree", model: `${NATURE}/TwistedTree_2`, fallbackModel: `${NATURE}/CommonTree_3`, targetHeight: 6.8 },
];

/**
 * Street-tree planting cycle — `setup.ts` walks it so no two neighbours match. The flame tree lands
 * once every seven, so its red crown reads as an accent on a green street rather than an autumn wood.
 */
export const PALM_IDS: readonly string[] = [
  "obj_palm",
  "obj_palm_tall",
  "obj_palm_low",
  "obj_palm",
  "obj_palm_low",
  "obj_palm_tall",
  "obj_flametree",
];

const objectPlan: Record<string, ModelPick> = {
  obj_palm_planter: {
    model: `${NATURE}/TwistedTree_5`,
    fallbackModel: `${CITY}/bush`,
    style: { targetHeight: 5.8 },
  },
  obj_streetlight: {
    model: `${CITY}/streetlight`,
    fallbackModel: `${FURN}/lamp_standing`,
    style: { targetHeight: 4.3 },
  },
  obj_gunshop_sign: {
    model: `${CITY}/trafficlight_A`,
    fallbackModel: `${DUNGEON}/banner_red`,
    style: { targetHeight: 2.4 },
  },
  obj_safehouse_sign: {
    model: `${DUNGEON}/banner_green`,
    fallbackModel: `${DUNGEON}/banner_red`,
    style: { targetHeight: 2.4 },
  },
  obj_vcpd_sign: {
    model: `${DUNGEON}/banner_blue`,
    fallbackModel: `${DUNGEON}/banner_red`,
    style: { targetHeight: 2.4 },
  },
  obj_crate_dock: {
    model: `${CITY}/box_A`,
    fallbackModel: `${CITY}/dumpster`,
    style: { targetHeight: 1 },
  },
  obj_bench: {
    model: `${CITY}/bench`,
    fallbackModel: `${FURN}/chair_A`,
    style: { targetHeight: 0.9 },
  },
  obj_hydrant: {
    model: `${CITY}/firehydrant`,
    fallbackModel: `${CITY}/trafficlight_C`,
    style: { targetHeight: 1, material: { color: "#d64545" } },
  },
  obj_trashcan: {
    model: `${CITY}/trash_A`,
    fallbackModel: `${CITY}/trash_B`,
    style: { targetHeight: 1.1 },
  },
  obj_dumpster: {
    model: `${CITY}/dumpster`,
    fallbackModel: `${CITY}/box_B`,
    style: { targetHeight: 1.3, material: { color: "#3f6d4a" } },
  },
  // Emissive, not just pink: the bloom stage needs something above threshold to glow around, and a
  // storefront sign is the only light source a daylit street legitimately has.
  obj_neon: {
    model: `${DUNGEON}/banner_red`,
    fallbackModel: `${CITY}/trafficlight_B`,
    style: { targetHeight: 3.4, material: { color: "#ff5aa8", emissive: "#ff2f95", emissiveIntensity: 1.5 } },
  },
  // Street signal rather than a second banner: at kerb height a hanging cloth reads as a stick, and
  // a lit signal head is the piece of furniture a junction is actually missing.
  obj_signal: {
    model: `${CITY}/trafficlight_B`,
    fallbackModel: `${CITY}/trafficlight_A`,
    style: { targetHeight: 3.6, material: { emissive: "#2fd8b0", emissiveIntensity: 0.55 } },
  },
  obj_hedge: {
    model: `${NATURE}/Bush_Common`,
    fallbackModel: `${CITY}/bush`,
    style: { targetHeight: 1.5 },
  },
  obj_planter: {
    model: `${NATURE}/Bush_Common_Flowers`,
    fallbackModel: `${NATURE}/Bush_Common`,
    style: { targetHeight: 1.3 },
  },
  obj_cargo: {
    model: `${SPACE}/containers_B`,
    fallbackModel: `${CITY}/box_B`,
    style: { targetHeight: 2.4, material: { color: "#c08a3c" } },
  },
  obj_cactus: {
    model: `${FURN}/cactus_medium_A`,
    fallbackModel: `${FURN}/cactus_small_A`,
    style: { targetHeight: 1.9 },
  },
};

for (const palm of PALMS) {
  objectPlan[palm.id] = {
    model: palm.model,
    fallbackModel: palm.fallbackModel,
    style: { targetHeight: palm.targetHeight },
  };
}

for (const b of BUILDING_SPECS) {
  objectPlan[b.id] = {
    model: b.model,
    fallbackModel: b.fallbackModel,
    style: { targetHeight: b.targetHeight, material: { color: b.tint } },
  };
}

export const objectModels: Record<string, ModelConfig> = resolveModelPlan(assets, objectPlan);
