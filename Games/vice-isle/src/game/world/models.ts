import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { assets } from "../assets";
import { BUILDING_SPECS } from "./buildings";

const CHAR = "kenney-mini-characters";
const RACING = "kenney-racing";
const NATURE = "kenney-nature";
const ROADS = "kenney-city-roads";
const SURVIVAL = "kenney-survival";

function model(id: string, targetHeight: number, extra?: Partial<ModelConfig>): ModelConfig {
  const base = assets.resolve(id)!;
  return { url: base.url, dims: base.dims, targetHeight, ...extra };
}

export const entityModels: Record<string, ModelConfig> = {
  street_runner: model(`${CHAR}/character-male-a`, 1.8),
  ped_beach: model(`${CHAR}/character-female-a`, 1.75),
  ped_city: model(`${CHAR}/character-male-b`, 1.8),
  ped_docks: model(`${CHAR}/character-female-b`, 1.78),
  contact_marco: model(`${CHAR}/character-male-c`, 1.85, { material: { color: "#f4efe2" } }),
  ganger_dock: model(`${CHAR}/character-male-d`, 1.85, { material: { color: "#c23b3b" } }),
  ganger_enforcer: model(`${CHAR}/character-male-e`, 2.05, { material: { color: "#7a1c1c" } }),
  kingpin_sal: model(`${CHAR}/character-male-f`, 2.25, { material: { color: "#c9a227" } }),
  cop_patrol: model(`${CHAR}/character-female-c`, 1.85, { material: { color: "#2e4f8f" } }),
  cop_swat: model(`${CHAR}/character-female-d`, 1.9, { material: { color: "#20242e" } }),

  car_compact: model(`${RACING}/raceCarGreen`, 1.35),
  car_muscle: model(`${RACING}/raceCarRed`, 1.4),
  car_sport: model(`${RACING}/raceCarOrange`, 1.3),
  car_cop: model(`${RACING}/raceCarWhite`, 1.4, {
    parts: [{ model: `${RACING}/lightRedDouble`, position: [0, 1.05, -0.1], scale: 3.2 }],
  }),
};

export const objectModels: Record<string, ModelConfig> = {
  obj_palm_planter: model(`${NATURE}/tree_palmTall`, 5.6),
  obj_streetlight: model(`${ROADS}/light-curved`, 4.3),
  obj_gunshop_sign: model(`${RACING}/billboard`, 2.4),
  obj_crate_dock: model(`${SURVIVAL}/box`, 1),
  ...Object.fromEntries(BUILDING_SPECS.map((b) => [b.id, model(b.glb, b.targetHeight)])),
};
