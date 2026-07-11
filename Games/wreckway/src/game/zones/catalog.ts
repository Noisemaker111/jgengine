import type { BuildingStyle } from "@jgengine/core/world/buildings";
import { EXIT_Z, ZONE_A_END, ZONE_B_END } from "../run/constants";

export type ZoneId = "canyons" | "flats" | "gantry";

export interface ZoneDef {
  id: ZoneId;
  label: string;
  radioName: string;
  start: number;
  end: number;
  wallColor: string;
  propIds: readonly [string, string];
  buildingStyle: BuildingStyle;
}

export const ZONES: readonly ZoneDef[] = [
  {
    id: "canyons",
    label: "CAR-STACK CANYONS",
    radioName: "ROW ONE",
    start: 0,
    end: ZONE_A_END,
    wallColor: "#b7410e",
    propIds: ["prop_wreck_pile", "prop_tire_wall"],
    buildingStyle: "ruin",
  },
  {
    id: "flats",
    label: "APPLIANCE FLATS",
    radioName: "ROW SIX",
    start: ZONE_A_END,
    end: ZONE_B_END,
    wallColor: "#8d99a6",
    propIds: ["prop_appliance_stack", "prop_scrap_heap"],
    buildingStyle: "industrial",
  },
  {
    id: "gantry",
    label: "CRANE GANTRY RUN",
    radioName: "THE GANTRY",
    start: ZONE_B_END,
    end: EXIT_Z,
    wallColor: "#f0c419",
    propIds: ["prop_container_stack", "prop_crane_leg"],
    buildingStyle: "industrial",
  },
];

export function zoneAt(z: number): ZoneDef {
  for (const zone of ZONES) if (z < zone.end) return zone;
  return ZONES[ZONES.length - 1]!;
}

export function zoneProgress(z: number): number {
  return Math.min(1, Math.max(0, z / EXIT_Z));
}
