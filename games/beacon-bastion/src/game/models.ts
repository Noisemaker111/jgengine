import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveModelPlan, type ModelPick } from "@jgengine/core/model/resolveModel";

import { assets } from "./assets";
import { BASE_CATALOG_ID } from "./entities/base/catalog";
import { TOWER_CATALOG, type TowerDef } from "./entities/towers/catalog";

const CITY = "kaykit-city-builder";
const HOUSES = "quaternius-lowpoly-buildings";
const FOREST = "kaykit-forest";

/**
 * How tall a worker stands. A little over life size: the camera sits high over the street, and a
 * barista has to read as a barista from there.
 */
export const WORKER_HEIGHT = 3.4;

/**
 * Every worker body in the pack shares one rig and clip set, so one table maps the game's moments to
 * clips: a throw is a punch, a notification makes them bend down to the phone, a promotion is a
 * victory pose. Locomotion stays automatic.
 */
const RIG = "CharacterArmature|";
export const WORKER_ANIMATION = {
  auto: true,
  clock: "game",
  oneShots: {
    attack: `${RIG}Punch`,
    hit: `${RIG}RecieveHit`,
    phone: `${RIG}PickUp`,
    cheer: `${RIG}Victory`,
    death: `${RIG}Defeat`,
  },
} as const;

/** A worker in their work clothes: one Quaternius character per trade, in its own colours. */
function workerPick(def: TowerDef): ModelPick {
  // The pack ships every body's "Skin" material near-black, so the face and hands read as a black
  // hole from the street camera; each worker gets a real skin tone on that one material.
  return { model: def.model, style: { targetHeight: WORKER_HEIGHT, animation: WORKER_ANIMATION, material: { color: def.skin, roughness: 0.75, materials: ["Skin"] } } };
}

/** The town hall at the end of Main Street: the thing the tech is marching on. */
const TOWN_HALL: ModelPick = { model: `${HOUSES}/Bank`, style: { targetHeight: 8, material: { color: "#f6e4c6" } } };

/**
 * The street's buildings, placed as `building-*` markers in the scene document (each names one of
 * these in its `meta.model`) and spawned as scenery facing the street: KayKit City Builder shops and
 * houses in their own painted colours, kept low (6 m at most) so no rooftop hides the street from the camera.
 */
export const BUILDING_PLAN: Record<string, ModelPick> = {
  house: { model: `${CITY}/building_A_withoutBase`, style: { targetHeight: 4.7 } },
  house2: { model: `${CITY}/building_B_withoutBase`, style: { targetHeight: 4.7 } },
  house3: { model: `${CITY}/building_C_withoutBase`, style: { targetHeight: 6.1 } },
  house4: { model: `${CITY}/building_D_withoutBase`, style: { targetHeight: 6.1 } },
  house5: { model: `${CITY}/building_A_withoutBase`, style: { targetHeight: 4.7, material: { color: "#ffe2c8" } } },
  shop: { model: `${CITY}/building_B_withoutBase`, style: { targetHeight: 4.7, material: { color: "#d8f0ff" } } },
  flat: { model: `${CITY}/building_H_withoutBase`, style: { targetHeight: 6.2 } },
  diner: { model: `${CITY}/building_E_withoutBase`, style: { targetHeight: 5.4 } },
  bakery: { model: `${CITY}/building_F_withoutBase`, style: { targetHeight: 5.4 } },
  corner: { model: `${CITY}/building_G_withoutBase`, style: { targetHeight: 6.1 } },
  hardware: { model: `${CITY}/building_C_withoutBase`, style: { targetHeight: 6.1, material: { color: "#ffd8d0" } } },
  tall: { model: `${CITY}/building_H_withoutBase`, style: { targetHeight: 6.2, material: { color: "#e0ffe8" } } },
  lamp: { model: `${CITY}/streetlight`, style: { targetHeight: 4.6 } },
};

/** Entity names the buildings spawn under, one per plan entry. */
export const buildingEntity = (model: string): string => `building_${model}`;

function buildEntityModels(): Record<string, ModelConfig> {
  const plan: Record<string, ModelPick> = { [BASE_CATALOG_ID]: TOWN_HALL };
  for (const def of Object.values(TOWER_CATALOG)) plan[def.id] = workerPick(def);
  for (const [id, pick] of Object.entries(BUILDING_PLAN)) plan[buildingEntity(id)] = pick;
  // Tech has no catalog model: each piece draws its own procedural body (`render/techMesh.ts`).
  return resolveModelPlan(assets, plan);
}

export const entityModels: Record<string, ModelConfig> = buildEntityModels();

/** A sunny small-town green, so the trees read as front-yard maples rather than a forest. */
const LAWN = { color: "#c8e6a0" };

/** Each authored scatter item's model: yard trees, hedges, lamp posts, hydrants, benches, bins and parked cars. */
const SCATTER_PLAN: Record<string, ModelPick> = {
  tree: { model: `${FOREST}/Tree_1_A_Color1`, style: { targetHeight: 5.2, material: LAWN } },
  maple: { model: `${FOREST}/Tree_3_A_Color1`, style: { targetHeight: 4.6, material: LAWN } },
  pine: { model: `${FOREST}/Tree_4_A_Color1`, style: { targetHeight: 6.4, material: LAWN } },
  bush: { model: `${FOREST}/Bush_1_E_Color1`, style: { targetHeight: 1.1 } },
  hedge: { model: `${FOREST}/Bush_4_E_Color1`, style: { targetHeight: 1.3 } },
  lamp: { model: `${CITY}/streetlight`, style: { targetHeight: 4.2 } },
  hydrant: { model: `${CITY}/firehydrant`, style: { targetHeight: 0.9 } },
  bench: { model: `${CITY}/bench`, style: { targetHeight: 0.8 } },
  bin: { model: `${CITY}/dumpster`, style: { targetHeight: 1.4 } },
  car: { model: `${CITY}/car_sedan`, style: { targetHeight: 1.5 } },
  wagon: { model: `${CITY}/car_stationwagon`, style: { targetHeight: 1.5 } },
};

/** Scatter palette item → resolved model when its pack is live; else InstancedScatter stylized proxy. */
export const scatterModels: Record<string, ModelConfig> = resolveModelPlan(assets, SCATTER_PLAN);
