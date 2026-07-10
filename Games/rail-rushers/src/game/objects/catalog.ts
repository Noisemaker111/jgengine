import type { GameContextObjectEntry } from "@jgengine/core/runtime/gameContext";

export const JUNCTION_STAND_OBJECT = "junction_stand";
export const STATION_HOUSE_OBJECT = "station_house";
export const PROP_PINE = "prop_pine";
export const PROP_BOULDER = "prop_boulder";
export const PROP_SIGNAL = "prop_signal_post";
export const PROP_MARKER = "prop_mile_marker";
export const PROP_FENCE = "prop_fence";

export const TRACKSIDE_PROP_IDS: readonly string[] = [PROP_PINE, PROP_BOULDER, PROP_SIGNAL, PROP_MARKER, PROP_FENCE];

export const OBJECT_CATALOG: Record<string, GameContextObjectEntry> = {
  [JUNCTION_STAND_OBJECT]: {},
  [STATION_HOUSE_OBJECT]: {},
  [PROP_PINE]: {},
  [PROP_BOULDER]: {},
  [PROP_SIGNAL]: {},
  [PROP_MARKER]: {},
  [PROP_FENCE]: {},
};
