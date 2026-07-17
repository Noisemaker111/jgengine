import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveModelPlan, type ModelPick } from "@jgengine/shell/render/resolveModel";

import { assets } from "./assets";

const ADV = "kaykit-adventurers";
const CITY = "kaykit-city-builder";
const NATURE = "quaternius-stylized-nature";

const WARRIOR_CLIPS = { idle: "Idle", walk: "Walking_A", run: "Running_A", runSpeed: 6 } as const;
const WARRIOR_ANIM = { states: { ...WARRIOR_CLIPS }, oneShots: { death: "Death_A" } };

/** Vanguard blue vs Marauder red — faction colour is the primary readability channel here, so it
 * rides on the shared adventurer meshes via a material tint. */
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
    style: { targetHeight: 6.5, material: { color: "#8fb0e6" } },
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
    style: { targetHeight: 6, material: { color: "#c98679" } },
  },
  // The Quaternius nature GLBs reference textures not shipped in the runner, so tint them a solid
  // colour rather than let them render untextured white.
  tree: { model: `${NATURE}/CommonTree_3`, fallbackModel: `${NATURE}/Pine_3`, style: { targetHeight: 4.4, material: { color: "#2f6b28" } } },
  rock: { model: `${NATURE}/Rock_Medium_1`, fallbackModel: `${NATURE}/Rock_Medium_2`, style: { targetHeight: 1.3, material: { color: "#8a8a86" } } },
  goldmine: {
    model: `${NATURE}/Rock_Medium_2`,
    fallbackModel: `${NATURE}/Rock_Medium_3`,
    style: { targetHeight: 1.8, material: { color: "#e8c14a", emissive: "#6b5210", emissiveIntensity: 0.4 } },
  },
};

export const entityModels: Record<string, ModelConfig> = resolveModelPlan(assets, PLAN);
