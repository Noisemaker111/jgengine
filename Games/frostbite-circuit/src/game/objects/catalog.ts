import type { GameContextObjectEntry } from "@jgengine/core/runtime/gameContext";

export const PINE_OBJECTS = ["prop_pine_small", "prop_pine_medium", "prop_pine_large"] as const;
export const TENT_OBJECTS = ["prop_tent_command", "prop_tent_supply"] as const;
export const FLARE_OBJECT = "prop_flare_drum";
export const RIDGE_OBJECT = "prop_snow_ridge";

export type PineObjectId = (typeof PINE_OBJECTS)[number];
export type TentObjectId = (typeof TENT_OBJECTS)[number];

export const OBJECT_CATALOG: Record<string, GameContextObjectEntry> = Object.fromEntries(
  [...PINE_OBJECTS, ...TENT_OBJECTS, FLARE_OBJECT, RIDGE_OBJECT].map((id) => [id, {}]),
);
