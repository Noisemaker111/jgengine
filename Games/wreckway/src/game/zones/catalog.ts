import type { BuildingPaletteOverrides, BuildingStyle } from "@jgengine/core/world/buildings";
import type { BiomeFog, BiomeSky, TerrainColors } from "@jgengine/core/world/features";
import { EXIT_Z, ZONE_A_END, ZONE_B_END } from "../run/constants";

export type ZoneId = "canyons" | "flats" | "gantry";

export interface ZoneDef {
  id: ZoneId;
  label: string;
  radioName: string;
  start: number;
  end: number;
  wallColor: string;
  propIds: readonly string[];
  buildingStyle: BuildingStyle;
  /** Facade colors for this zone's corridor walls — the per-zone read the minimap already promises. */
  palette: BuildingPaletteOverrides;
  /** Ground palette for the zone's terrain band. */
  ground: TerrainColors;
  fog: BiomeFog;
  sky: BiomeSky;
}

export const ZONES: readonly ZoneDef[] = [
  {
    id: "canyons",
    label: "CAR-STACK CANYONS",
    radioName: "ROW ONE",
    start: 0,
    end: ZONE_A_END,
    wallColor: "#b7410e",
    propIds: ["prop_wreck_pile", "prop_tire_wall", "prop_stripped_car", "prop_dumpster"],
    buildingStyle: "ruin",
    palette: {
      wall: "#5e3323",
      corner: "#48291b",
      roof: "#3a2117",
      window: "#ffb066",
      storefront: "#241610",
      shutter: "#7a3a1e",
      awning: "#b7410e",
      storeSign: "#ff7a2b",
      roofProp: "#c2410c",
      guardrail: "#8a5a3a",
      airConditioner: "#6b5140",
      clothesline: "#d98a3d",
    },
    ground: { low: "#3a2d21", high: "#6e5136", waterline: "#3a2d21" },
    fog: { color: "#7a4423", near: 55, far: 300 },
    sky: { horizonColor: "#e8802e", zenithColor: "#5e3620" },
  },
  {
    id: "flats",
    label: "APPLIANCE FLATS",
    radioName: "ROW SIX",
    start: ZONE_A_END,
    end: ZONE_B_END,
    wallColor: "#8d99a6",
    propIds: ["prop_appliance_stack", "prop_scrap_heap", "prop_dumpster", "prop_stripped_car"],
    buildingStyle: "industrial",
    palette: {
      wall: "#5b636b",
      corner: "#434a51",
      roof: "#2f3439",
      window: "#8fd8e8",
      storefront: "#2a3136",
      shutter: "#6b757e",
      awning: "#2f6f7a",
      storeSign: "#3fe0d4",
      roofProp: "#9fb3c8",
      guardrail: "#b9c4cc",
      airConditioner: "#8d99a6",
      clothesline: "#cfd8dc",
    },
    ground: { low: "#37383a", high: "#665f52", waterline: "#37383a" },
    fog: { color: "#6b5c48", near: 55, far: 290 },
    sky: { horizonColor: "#d99154", zenithColor: "#4a4239" },
  },
  {
    id: "gantry",
    label: "CRANE GANTRY RUN",
    radioName: "THE GANTRY",
    start: ZONE_B_END,
    end: EXIT_Z,
    wallColor: "#f0c419",
    propIds: ["prop_container_stack", "prop_crane_leg", "prop_scrap_heap", "prop_dumpster"],
    buildingStyle: "industrial",
    palette: {
      wall: "#4a453c",
      corner: "#37332c",
      roof: "#26231e",
      window: "#ffe08a",
      storefront: "#1d1b17",
      shutter: "#f0c419",
      awning: "#1d1b17",
      storeSign: "#ffd21e",
      roofProp: "#f0c419",
      guardrail: "#f0c419",
      airConditioner: "#7d766a",
      clothesline: "#f0c419",
    },
    ground: { low: "#3a3325", high: "#6f5c3d", waterline: "#3a3325" },
    fog: { color: "#8a6222", near: 50, far: 280 },
    sky: { horizonColor: "#ffae44", zenithColor: "#6b4c1e" },
  },
];

export function zoneAt(z: number): ZoneDef {
  for (const zone of ZONES) if (z < zone.end) return zone;
  return ZONES[ZONES.length - 1]!;
}

export function zoneProgress(z: number): number {
  return Math.min(1, Math.max(0, z / EXIT_Z));
}
