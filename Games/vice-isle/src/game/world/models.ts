import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveModelPlan, type ModelPick } from "@jgengine/shell/render/resolveModel";

import { assets } from "../assets";
import { BUILDING_SPECS } from "./buildings";

const CHAR = "kaykit-adventurers";
const CHAR_FB = "quaternius-base-characters";
const CITY = "quaternius-downtown-city";
const NATURE = "quaternius-stylized-nature";

/**
 * Art plan: preferred Quaternius/KayKit catalog ids. Soft-resolve via
 * resolveModelPlan — missing packs → shell primitives until pull/reindex.
 */
export const entityModels: Record<string, ModelConfig> = resolveModelPlan(assets, {
  street_runner: {
    model: `${CHAR}/Rogue`,
    fallbackModel: `${CHAR_FB}/Character_Male_1`,
    style: { targetHeight: 1.8 },
  },
  ped_beach: {
    model: `${CHAR}/Mage`,
    fallbackModel: `${CHAR_FB}/Character_Female_1`,
    style: { targetHeight: 1.75 },
  },
  ped_city: {
    model: `${CHAR}/Knight`,
    fallbackModel: `${CHAR_FB}/Character_Male_2`,
    style: { targetHeight: 1.8 },
  },
  ped_docks: {
    model: `${CHAR}/Rogue`,
    fallbackModel: `${CHAR_FB}/Character_Female_2`,
    style: { targetHeight: 1.78 },
  },
  contact_marco: {
    model: `${CHAR}/Barbarian`,
    fallbackModel: `${CHAR_FB}/Character_Male_3`,
    style: { targetHeight: 1.85, material: { color: "#f4efe2" } },
  },
  ganger_dock: {
    model: `${CHAR}/Rogue`,
    fallbackModel: `${CHAR_FB}/Character_Male_1`,
    style: { targetHeight: 1.85, material: { color: "#c23b3b" } },
  },
  ganger_enforcer: {
    model: `${CHAR}/Barbarian`,
    fallbackModel: `${CHAR_FB}/Character_Male_2`,
    style: { targetHeight: 2.05, material: { color: "#7a1c1c" } },
  },
  kingpin_sal: {
    model: `${CHAR}/Knight`,
    fallbackModel: `${CHAR_FB}/Character_Male_3`,
    style: { targetHeight: 2.25, material: { color: "#c9a227" } },
  },
  cop_patrol: {
    model: `${CHAR}/Mage`,
    fallbackModel: `${CHAR_FB}/Character_Female_1`,
    style: { targetHeight: 1.85, material: { color: "#2e4f8f" } },
  },
  cop_swat: {
    model: `${CHAR}/Knight`,
    fallbackModel: `${CHAR_FB}/Character_Female_2`,
    style: { targetHeight: 1.9, material: { color: "#20242e" } },
  },

  car_compact: { model: `${CITY}/car_hatchback`, fallbackModel: `${CITY}/car`, style: { targetHeight: 1.35 } },
  car_muscle: { model: `${CITY}/car_sedan`, fallbackModel: `${CITY}/car`, style: { targetHeight: 1.4 } },
  car_sport: { model: `${CITY}/car_sports`, fallbackModel: `${CITY}/car`, style: { targetHeight: 1.3 } },
  car_cop: { model: `${CITY}/car_police`, fallbackModel: `${CITY}/car`, style: { targetHeight: 1.4 } },
});

const objectPlan: Record<string, ModelPick> = {
  obj_palm_planter: {
    model: `${NATURE}/tree_palmTall`,
    fallbackModel: `${NATURE}/tree_pineDefaultA`,
    style: { targetHeight: 5.6 },
  },
  obj_streetlight: {
    model: `${CITY}/light-curved`,
    fallbackModel: `${CITY}/streetlight`,
    style: { targetHeight: 4.3 },
  },
  obj_gunshop_sign: {
    model: `${CITY}/billboard`,
    fallbackModel: `${CITY}/sign`,
    style: { targetHeight: 2.4 },
  },
  obj_crate_dock: {
    model: `${CITY}/crate`,
    fallbackModel: `${NATURE}/tree_pineDefaultA`,
    style: { targetHeight: 1 },
  },
};

for (const b of BUILDING_SPECS) {
  objectPlan[b.id] = {
    model: b.model,
    fallbackModel: b.fallbackModel,
    style: { targetHeight: b.targetHeight },
  };
}

export const objectModels: Record<string, ModelConfig> = resolveModelPlan(assets, objectPlan);
