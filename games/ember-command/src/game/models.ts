import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveModelPlan, type ModelPick } from "@jgengine/core/model/resolveModel";

import { assets } from "./assets";

const CHARACTERS = "quaternius-lowpoly-rpg-characters";
const VILLAGE = "quaternius-lowpoly-medieval-village-pack";
const BUILDINGS = "quaternius-lowpoly-medieval-buildings";
const PROPS = "quaternius-fantasy-props";
const NATURE = "quaternius-stylized-nature";

const VANGUARD = "#3a78c4";
const MARAUDER = "#c93a2a";
const VANGUARD_ROOF = "#2d5b8c";
const MARAUDER_ROOF = "#a3291c";

// Rank-and-file troops share one model per kind and play only idle/walk, so a batch reproduces them
// at any distance: a full battle draws a handful of instanced batches instead of ~17 draws a unit.
// The hero keeps its own rig. The engine's default capacity (128 a kind) keeps overflow on its own rig.
const BATCHED_TROOPS = new Set(["peasant", "footman", "rifleman", "grunt", "reaver"]);
const TROOP_ANIMATION = {
  states: { idle: "CharacterArmature|Idle", walk: "CharacterArmature|Walk", walkSpeed: 0.1 },
  clock: "game",
} as const;

function troop(model: string, height: number, tint: string): ModelPick {
  return { model: `${CHARACTERS}/${model}`, style: { targetHeight: height, material: { emissive: tint, emissiveIntensity: 0.12, rim: { color: tint, strength: 0.9, power: 2.5 } }, animation: TROOP_ANIMATION } };
}

function building(model: string, height: number, roof: string, roofMaterial = "RoofTiles"): ModelPick {
  return { model, style: { targetHeight: height, material: { color: roof, materials: [roofMaterial] } } };
}

const plan: Record<string, ModelPick> = {
  peasant: troop("Monk", 2, VANGUARD),
  footman: troop("Warrior", 2.3, VANGUARD),
  rifleman: troop("Ranger", 2.2, VANGUARD),
  hero: troop("Cleric", 2.65, VANGUARD),
  grunt: troop("Rogue", 2.3, MARAUDER),
  reaver: troop("Warrior", 2.65, MARAUDER),
  keep_player: { model: `${BUILDINGS}/LargeSquareTowerBricks`, style: { targetHeight: 7, material: { color: "#9fb6dc" } } },
  keep_enemy: { model: `${BUILDINGS}/LargeTower`, style: { targetHeight: 7, material: { color: "#e8b3a6" } } },
  warcamp: building(`${VILLAGE}/Stable`, 4.4, MARAUDER_ROOF),
  barracks: building(`${VILLAGE}/Stable`, 4.6, VANGUARD_ROOF),
  farm: building(`${VILLAGE}/Mill`, 4.4, VANGUARD_ROOF),
  guard_tower: { model: `${BUILDINGS}/WatchTowerWRoof`, style: { targetHeight: 6.5 } },
  banner_blue: { model: `${PROPS}/Banner_1`, style: { targetHeight: 2.6, material: { color: VANGUARD_ROOF, materials: ["MI_Banner"] } } },
  banner_red: { model: `${PROPS}/Banner_2`, style: { targetHeight: 2.6, material: { color: MARAUDER_ROOF, materials: ["MI_Banner"] } } },
  torch: { model: `${PROPS}/Torch_Metal`, style: { targetHeight: 1.8 } },
  barrel: { model: `${PROPS}/Barrel`, style: { targetHeight: 1.2 } },
  goldmine: {
    model: `${NATURE}/Rock_Medium_1`,
    style: {
      targetHeight: 2.6,
      parts: [{ model: `${PROPS}/Coin_Pile`, position: [0.5, 0, 0.9], scale: 2.4 }],
      material: { color: "#d9a441" },
    },
  },
  woods: { model: `${VILLAGE}/Sawmill`, style: { targetHeight: 3.6 } },
};

const resolved = resolveModelPlan(assets, plan);

export const entityModels: Record<string, ModelConfig> = Object.fromEntries(
  Object.entries(resolved).map(([id, model]) => [
    id,
    BATCHED_TROOPS.has(id) ? { ...model, lod: { crowdDistance: 0 } } : model,
  ]),
);
