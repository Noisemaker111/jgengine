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
export const WORKER_HEIGHT = 2.7;

/** A worker in their work clothes: one Quaternius character, tinted so two trades on one body read apart. */
function workerPick(def: TowerDef): ModelPick {
  return {
    model: def.model,
    style: {
      targetHeight: WORKER_HEIGHT,
      ...(def.tint === undefined ? {} : { material: { color: def.tint } }),
      animation: { auto: true, clock: "game" },
    },
  };
}

/** The town hall at the end of Main Street: the thing the tech is marching on. */
const TOWN_HALL: ModelPick = { model: `${HOUSES}/Bank`, style: { targetHeight: 8 } };

/**
 * The street's buildings, placed as `building-*` markers in the scene document (each names one of
 * these in its `meta.model`) and spawned as scenery facing the street. Cartoon houses and shops,
 * scaled up so a front door is about a worker's height.
 */
export const BUILDING_PLAN: Record<string, ModelPick> = {
  house: { model: `${HOUSES}/House`, style: { targetHeight: 6 } },
  house2: { model: `${HOUSES}/House2`, style: { targetHeight: 5.6 } },
  house3: { model: `${HOUSES}/House3`, style: { targetHeight: 7.5 } },
  house4: { model: `${HOUSES}/House4`, style: { targetHeight: 5.4 } },
  house5: { model: `${HOUSES}/House5`, style: { targetHeight: 5.4 } },
  shop: { model: `${HOUSES}/Shop`, style: { targetHeight: 5.4 } },
  flat: { model: `${HOUSES}/Flat`, style: { targetHeight: 9 } },
  diner: { model: `${CITY}/building_E_withoutBase`, style: { targetHeight: 7.5 } },
  bakery: { model: `${CITY}/building_B_withoutBase`, style: { targetHeight: 6.5 } },
  corner: { model: `${CITY}/building_G_withoutBase`, style: { targetHeight: 8.5 } },
  hardware: { model: `${CITY}/building_F_withoutBase`, style: { targetHeight: 7.5 } },
  tall: { model: `${CITY}/building_H_withoutBase`, style: { targetHeight: 10 } },
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
  bush: { model: `${FOREST}/Bush_2_A_Color1`, style: { targetHeight: 0.9, material: LAWN } },
  hedge: { model: `${CITY}/bush`, style: { targetHeight: 1.3 } },
  lamp: { model: `${CITY}/streetlight`, style: { targetHeight: 4.2 } },
  hydrant: { model: `${CITY}/firehydrant`, style: { targetHeight: 0.9 } },
  bench: { model: `${CITY}/bench`, style: { targetHeight: 0.8 } },
  bin: { model: `${CITY}/dumpster`, style: { targetHeight: 1.4 } },
  car: { model: `${CITY}/car_sedan`, style: { targetHeight: 1.5 } },
  wagon: { model: `${CITY}/car_stationwagon`, style: { targetHeight: 1.5 } },
};

/** Scatter palette item → resolved model when its pack is live; else InstancedScatter stylized proxy. */
export const scatterModels: Record<string, ModelConfig> = resolveModelPlan(assets, SCATTER_PLAN);
