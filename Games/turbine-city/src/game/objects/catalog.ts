import type { GameContextObjectEntry } from "@jgengine/core/runtime/gameContext";

export const FAN_HOUSING_OBJECT = "fan_housing";
export const FAN_ROTOR_OBJECT = "fan_rotor";
export const RING_GATE_OBJECT = "ring_gate";
export const WINDSOCK_OBJECT = "windsock";
export const BANNER_OBJECT = "banner_line";
export const BRIDGE_OBJECT = "sky_bridge";
export const ANTENNA_OBJECT = "roof_antenna";

export const OBJECT_CATALOG: Record<string, GameContextObjectEntry> = {
  [FAN_HOUSING_OBJECT]: {},
  [FAN_ROTOR_OBJECT]: {},
  [RING_GATE_OBJECT]: {},
  [WINDSOCK_OBJECT]: {},
  [BANNER_OBJECT]: {},
  [BRIDGE_OBJECT]: {},
  [ANTENNA_OBJECT]: {},
};
