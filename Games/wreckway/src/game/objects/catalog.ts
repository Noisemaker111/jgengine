import type { GameContextObjectEntry } from "@jgengine/core/runtime/gameContext";

export const PROP_WRECK_PILE = "prop_wreck_pile";
export const PROP_TIRE_WALL = "prop_tire_wall";
export const PROP_APPLIANCE_STACK = "prop_appliance_stack";
export const PROP_SCRAP_HEAP = "prop_scrap_heap";
export const PROP_CONTAINER_STACK = "prop_container_stack";
export const PROP_CRANE_LEG = "prop_crane_leg";

export const GATE_BARRICADE_PLOW = "gate_barricade_plow";
export const GATE_BARRICADE_JUMP = "gate_barricade_jump";

export const PICKUP_MARKER = "pickup_marker";
export const EXIT_GATE_ARCH = "exit_gate_arch";

export const ZONE_PROP_IDS = [
  PROP_WRECK_PILE,
  PROP_TIRE_WALL,
  PROP_APPLIANCE_STACK,
  PROP_SCRAP_HEAP,
  PROP_CONTAINER_STACK,
  PROP_CRANE_LEG,
] as const;

export const OBJECT_CATALOG: Record<string, GameContextObjectEntry> = {
  [PROP_WRECK_PILE]: {},
  [PROP_TIRE_WALL]: {},
  [PROP_APPLIANCE_STACK]: {},
  [PROP_SCRAP_HEAP]: {},
  [PROP_CONTAINER_STACK]: {},
  [PROP_CRANE_LEG]: {},
  [GATE_BARRICADE_PLOW]: {},
  [GATE_BARRICADE_JUMP]: {},
  [PICKUP_MARKER]: {},
  [EXIT_GATE_ARCH]: {},
};
