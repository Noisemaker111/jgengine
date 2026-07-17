import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveModelPlan, type ModelPick } from "@jgengine/shell/render/resolveModel";

import { assets } from "./assets";

const ADV = "kaykit-adventurers";
const CITY = "kaykit-city-builder";
const DUN = "kaykit-dungeon";
const NATURE = "quaternius-stylized-nature";

const WARRIOR_CLIPS = { idle: "Idle", walk: "Walking_A", run: "Running_A", runSpeed: 6 } as const;
const WARRIOR_ANIM = { states: { ...WARRIOR_CLIPS }, oneShots: { death: "Death_A" } };

/** Vanguard blue vs Marauder red — faction colour rides the shared adventurer meshes via a tint. */
const VANGUARD = "#4c8dff";
const MARAUDER = "#e0553b";

const PLAN: Record<string, ModelPick> = {
  footman: {
    model: `${ADV}/Knight`,
    fallbackModel: `${ADV}/Rogue`,
    style: { targetHeight: 2.3, material: { color: VANGUARD }, animation: WARRIOR_ANIM },
  },
  hero: {
    model: `${ADV}/Barbarian`,
    fallbackModel: `${ADV}/Knight`,
    style: { targetHeight: 3, material: { color: "#ffd24a", emissive: "#7a5a10", emissiveIntensity: 0.35 }, animation: WARRIOR_ANIM },
  },
  keep_player: {
    model: `${CITY}/building_B`,
    fallbackModel: `${CITY}/building_A`,
    style: { targetHeight: 6.5, material: { color: "#c3bfb2" } },
  },
  grunt: {
    model: `${ADV}/Rogue_Hooded`,
    fallbackModel: `${ADV}/Rogue`,
    style: { targetHeight: 2.3, material: { color: MARAUDER }, animation: WARRIOR_ANIM },
  },
  reaver: {
    model: `${ADV}/Barbarian`,
    fallbackModel: `${ADV}/Knight`,
    style: { targetHeight: 2.9, material: { color: "#9e2b1c" }, animation: WARRIOR_ANIM },
  },
  keep_enemy: {
    model: `${CITY}/building_D`,
    fallbackModel: `${CITY}/building_C`,
    style: { targetHeight: 6, material: { color: "#a89a86" } },
  },
  // Base dressing — team banners, torches, barrels (kaykit-dungeon stone props).
  banner_blue: { model: `${DUN}/banner_blue`, fallbackModel: `${DUN}/banner_patternA_blue`, style: { targetHeight: 2.6 } },
  banner_red: { model: `${DUN}/banner_red`, fallbackModel: `${DUN}/banner_patternA_red`, style: { targetHeight: 2.6 } },
  torch: { model: `${DUN}/torch_lit`, fallbackModel: `${DUN}/torch`, style: { targetHeight: 1.8, material: { emissive: "#ff9a3c", emissiveIntensity: 0.7 } } },
  barrel: { model: `${DUN}/barrel_large`, fallbackModel: `${DUN}/barrel`, style: { targetHeight: 1.2 } },
  goldmine: {
    model: `${NATURE}/Rock_Medium_2`,
    fallbackModel: `${NATURE}/Rock_Medium_3`,
    style: { targetHeight: 2.2, material: { color: "#e8c14a", emissive: "#6b5210", emissiveIntensity: 0.4 } },
  },
};

export const entityModels: Record<string, ModelConfig> = resolveModelPlan(assets, PLAN);

/** Forest palette item → real GLB. Left empty on purpose: the Quaternius nature GLBs ship without
 * their textures in the runner and render as untextured white, so we let InstancedScatter draw its
 * built-in colour-correct stylized proxies (pine/tree/oak/bush/rock/stone) instead. */
export const scatterModels: Record<string, string> = {};

