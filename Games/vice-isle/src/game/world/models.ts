import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveModelPlan, type ModelPick } from "@jgengine/shell/render/resolveModel";

import { assets } from "../assets";
import { BUILDING_SPECS } from "./buildings";

const CHAR = "kaykit-adventurers";
const CITY = "kaykit-city-builder";
const NATURE = "quaternius-stylized-nature";
const DUNGEON = "kaykit-dungeon";
const FURN = "kaykit-furniture";

export const entityModels: Record<string, ModelConfig> = resolveModelPlan(assets, {
  street_runner: {
    model: `${CHAR}/Rogue`,
    fallbackModel: `${CHAR}/Rogue_Hooded`,
    style: { targetHeight: 1.8 },
  },
  ped_beach: {
    model: `${CHAR}/Mage`,
    fallbackModel: `${CHAR}/Rogue`,
    style: { targetHeight: 1.75 },
  },
  ped_city: {
    model: `${CHAR}/Knight`,
    fallbackModel: `${CHAR}/Barbarian`,
    style: { targetHeight: 1.8 },
  },
  ped_docks: {
    model: `${CHAR}/Rogue_Hooded`,
    fallbackModel: `${CHAR}/Mage`,
    style: { targetHeight: 1.78 },
  },
  contact_marco: {
    model: `${CHAR}/Barbarian`,
    fallbackModel: `${CHAR}/Knight`,
    style: { targetHeight: 1.85, material: { color: "#f4efe2" } },
  },
  ganger_dock: {
    model: `${CHAR}/Rogue`,
    fallbackModel: `${CHAR}/Barbarian`,
    style: { targetHeight: 1.85, material: { color: "#c23b3b" } },
  },
  ganger_enforcer: {
    model: `${CHAR}/Barbarian`,
    fallbackModel: `${CHAR}/Knight`,
    style: { targetHeight: 2.05, material: { color: "#7a1c1c" } },
  },
  kingpin_sal: {
    model: `${CHAR}/Knight`,
    fallbackModel: `${CHAR}/Mage`,
    style: { targetHeight: 2.25, material: { color: "#c9a227" } },
  },
  cop_patrol: {
    model: `${CHAR}/Mage`,
    fallbackModel: `${CHAR}/Knight`,
    style: { targetHeight: 1.85, material: { color: "#2e4f8f" } },
  },
  cop_swat: {
    model: `${CHAR}/Knight`,
    fallbackModel: `${CHAR}/Barbarian`,
    style: { targetHeight: 1.9, material: { color: "#20242e" } },
  },

  car_compact: {
    model: `${CITY}/car_hatchback`,
    fallbackModel: `${CITY}/car_sedan`,
    style: { targetHeight: 1.35 },
  },
  car_muscle: {
    model: `${CITY}/car_stationwagon`,
    fallbackModel: `${CITY}/car_sedan`,
    style: { targetHeight: 1.4 },
  },
  car_sport: {
    model: `${CITY}/car_sedan`,
    fallbackModel: `${CITY}/car_hatchback`,
    style: { targetHeight: 1.3 },
  },
  car_cop: {
    model: `${CITY}/car_police`,
    fallbackModel: `${CITY}/car_taxi`,
    style: { targetHeight: 1.4 },
  },
});

const objectPlan: Record<string, ModelPick> = {
  obj_palm_planter: {
    // Quaternius nature textures aren't committed (multi-MB, #1005) — a flat toon
    // green keeps street trees readable instead of untextured white.
    model: `${NATURE}/CommonTree_1`,
    fallbackModel: `${CITY}/bush`,
    style: { targetHeight: 5.6, material: { color: "#57a05b" } },
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
  obj_crate_dock: {
    model: `${CITY}/box_A`,
    fallbackModel: `${CITY}/dumpster`,
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
