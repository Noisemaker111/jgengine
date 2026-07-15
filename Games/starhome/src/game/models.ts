import type { ModelConfig } from "@jgengine/core/game/playableGame";

import { assets } from "./assets";
import { DECOR, FURNITURE, STRUCTURE, type DecorDef, type FurnitureDef, type StructureDef } from "./objects/catalog";

export const HAB_WALL_SCALE = 3;

function resolvedUrl(id: string): string {
  const entry = assets.resolve(id);
  if (entry === null) throw new Error(`starhome/models: unknown asset "${id}"`);
  return entry.url;
}

const FURNITURE_ASSET: Record<string, string> = {
  nutrient_font: "kenney-furniture/kitchenBar",
  sleep_pod: "kenney-furniture/bedDouble",
  chat_ring: "kenney-furniture/loungeSofaCorner",
  holo_arcade: "kenney-furniture/televisionModern",
  bloom_planter: "kenney-furniture/pottedPlant",
  work_console: "kenney-space/desk_computer",
};

function furnitureModel(def: FurnitureDef): ModelConfig {
  const assetId = FURNITURE_ASSET[def.id];
  if (assetId === undefined) throw new Error(`starhome/models: no model mapped for furniture "${def.id}"`);
  return {
    url: resolvedUrl(assetId),
    targetHeight: def.height,
    material: { color: def.color, metalness: 0.2, roughness: 0.5, emissive: def.color, emissiveIntensity: 0.12 },
  };
}

const DECOR_ASSET: Record<string, string> = {
  decor_spire: "kenney-space/satelliteDish_large",
  decor_boulder: "kenney-space/rock_crystalsLargeA",
  decor_frond: "kenney-nature/mushroom_redTall",
  decor_frond_tan: "kenney-nature/mushroom_tanTall",
  decor_crystal: "kenney-space/rock_crystalsLargeB",
};

function decorModel(def: DecorDef): ModelConfig {
  const assetId = DECOR_ASSET[def.id];
  if (assetId === undefined) throw new Error(`starhome/models: no model mapped for decor "${def.id}"`);
  return {
    url: resolvedUrl(assetId),
    targetHeight: def.height,
    material: { color: def.color, emissive: def.color, emissiveIntensity: 0.22 },
  };
}

const STRUCTURE_ASSET: Record<string, string> = {
  hab_wall: "kenney-space/corridor_windowClosed",
  hab_wall_window: "kenney-space/corridor_window",
  hab_corner: "kenney-space/corridor_wallCorner",
  hab_gate: "kenney-space/gate_complex",
};

function structureModel(def: StructureDef): ModelConfig {
  const assetId = STRUCTURE_ASSET[def.id];
  if (assetId === undefined) throw new Error(`starhome/models: no model mapped for structure "${def.id}"`);
  return {
    url: resolvedUrl(assetId),
    scale: HAB_WALL_SCALE,
    material: { color: "#9d93bd", metalness: 0.35, roughness: 0.45 },
  };
}

export const objectModels: Record<string, ModelConfig> = {
  ...Object.fromEntries(FURNITURE.map((def) => [def.id, furnitureModel(def)])),
  ...Object.fromEntries(DECOR.map((def) => [def.id, decorModel(def)])),
  ...Object.fromEntries(STRUCTURE.map((def) => [def.id, structureModel(def)])),
};

export const ALIEN_MESH_IDS: readonly string[] = [
  "kenney-mini-characters/character-male-a",
  "kenney-mini-characters/character-male-b",
  "kenney-mini-characters/character-male-c",
  "kenney-mini-characters/character-female-a",
  "kenney-mini-characters/character-female-b",
  "kenney-mini-characters/character-female-c",
];

export function alienMeshUrl(id: string): string {
  return resolvedUrl(id);
}
