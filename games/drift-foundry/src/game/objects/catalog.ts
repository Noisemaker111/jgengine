import type { GameContextObjectEntry } from "@jgengine/core/runtime/gameContext";

export const PROP_WRECK_PILE = "prop_wreck_pile";
export const PROP_TIRE_WALL = "prop_tire_wall";
export const PROP_APPLIANCE_STACK = "prop_appliance_stack";
export const PROP_SCRAP_HEAP = "prop_scrap_heap";
export const PROP_CONTAINER_STACK = "prop_container_stack";
export const PROP_CRANE_LEG = "prop_crane_leg";
export const PROP_STRIPPED_CAR = "prop_stripped_car";
export const PROP_DUMPSTER = "prop_dumpster";
export const PROP_YARD_LAMP = "prop_yard_lamp";
export const PROP_YARD_TOWER = "prop_yard_tower";

export const GATE_BARRICADE_PLOW = "gate_barricade_plow";
export const GATE_BARRICADE_JUMP = "gate_barricade_jump";

export const PICKUP_MARKER = "pickup_marker";
export const PICKUP_STATIONS = { engine: "pickup_engine", front: "pickup_front", wheels: "pickup_wheels", frame: "pickup_frame" } as const;
export const JUMP_CUE = "jump_cue";
export const EXIT_GATE_ARCH = "exit_gate_arch";

/**
 * Props the five newer tracks are dressed with: realistic library models for the yard clutter, and
 * composed set-pieces (slag vents, ladles, belts, crossings) built from the same packs as the rest.
 */
export const TRACK_OBJECT = {
  edgeBarrier: "edge_barrier",
  edgeBarrel: "edge_barrel",
  edgeTyre: "edge_tyre",
  edgeBoulder: "edge_boulder",
  edgeRail: "edge_rail",
  lampSearch: "lamp_search",
  lampStreet: "lamp_street",
  pipes: "prop_pipes",
  generator: "prop_generator",
  propane: "prop_propane",
  compressor: "prop_compressor",
  rack: "prop_rack",
  powerBox: "prop_power_box",
  crate: "prop_crate",
  militaryCrate: "prop_military_crate",
  boulder: "prop_boulder",
  rock: "prop_rock",
  barrelStove: "prop_barrel_stove",
  coveredCar: "prop_covered_car",
  cabinet: "prop_cabinet",
  slagVent: "set_slag_vent",
  ladle: "set_ladle",
  furnace: "set_furnace",
  crossing: "set_crossing",
  gantryLeg: "set_gantry_leg",
  belt: "set_belt",
  signalBox: "set_signal_box",
  pumpRig: "set_pump_rig",
} as const;

export const ZONE_PROP_IDS = [
  PROP_WRECK_PILE,
  PROP_TIRE_WALL,
  PROP_APPLIANCE_STACK,
  PROP_SCRAP_HEAP,
  PROP_CONTAINER_STACK,
  PROP_CRANE_LEG,
  PROP_STRIPPED_CAR,
  PROP_DUMPSTER,
] as const;

export const OBJECT_CATALOG: Record<string, GameContextObjectEntry> = {
  [PROP_WRECK_PILE]: {},
  [PROP_TIRE_WALL]: {},
  [PROP_APPLIANCE_STACK]: {},
  [PROP_SCRAP_HEAP]: {},
  [PROP_CONTAINER_STACK]: {},
  [PROP_CRANE_LEG]: {},
  [PROP_STRIPPED_CAR]: {},
  [PROP_DUMPSTER]: {},
  [PROP_YARD_LAMP]: {},
  [PROP_YARD_TOWER]: {},
  [GATE_BARRICADE_PLOW]: {},
  [GATE_BARRICADE_JUMP]: {},
  [PICKUP_MARKER]: {},
  [JUMP_CUE]: {},
  ...Object.fromEntries(Object.values(PICKUP_STATIONS).map((id) => [id, {}])),
  [EXIT_GATE_ARCH]: {},
  ...Object.fromEntries(Object.values(TRACK_OBJECT).map((id) => [id, {}])),
};
