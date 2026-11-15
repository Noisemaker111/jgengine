import type { BuildingPaletteOverrides, BuildingStyle } from "@jgengine/core/buildings/buildings";
import type { BiomeFog, BiomeSky, TerrainColors } from "@jgengine/core/world/features";
import { libraryFacade } from "../world/librarySurface";
import type { DepartmentLight } from "../tracks/types";
import { EXIT_Z, ZONE_A_END, ZONE_B_END } from "../run/constants";

export type ZoneId = "snacks" | "frozen" | "bulk";

/** What the store's own floor is made of: the grip the casters find on the main aisle. */
export interface ZoneSurface {
  id: string;
  /** Reads on the HUD and in test evidence: which surface the cart is actually on. */
  label: string;
  /** Grip multiplier handed to the vehicle sim's `surfaceFriction` (1 = the reference surface). */
  grip: number;
}

/** One stretch of a department as the run reads it: what the PA calls it and the grip under the casters. */
export interface TrackZone {
  id: string;
  label: string;
  radioName: string;
  /** Run metres. */
  start: number;
  end: number;
  wallColor: string;
  /** Floor under the casters - mopped vinyl, frosted tile or dusty concrete decide how much grip the cart gets. */
  surface: ZoneSurface;
  /** The section's own light over the store rig (Aisle 9 only, where run metres are world z). */
  light?: DepartmentLight;
}

/**
 * An Aisle 9 zone: a track zone that also owns the corridor's generated in-store kiosks (the
 * pharmacy, the key-cutting booth, the café counters, shutters half down for closing) and its floor
 * band.
 */
export interface ZoneDef extends TrackZone {
  id: ZoneId;
  propIds: readonly string[];
  buildingStyle: BuildingStyle;
  /** Shared-library material painting this zone's generated kiosk walls and roofs. */
  facadeMaterial: string;
  /** Kiosk colours for this zone - the per-zone read the minimap already promises. */
  palette: BuildingPaletteOverrides;
  /** Floor palette for the zone's terrain band. */
  ground: TerrainColors;
  fog: BiomeFog;
  sky: BiomeSky;
}

const WALL_REPEAT: [number, number] = [1.4, 2];
const ROOF_REPEAT: [number, number] = [10, 7];

/** The store's ceiling haze: bright fluorescent white with a faint tint per section. */
const CEILING = { horizonColor: "#f7f4ec", zenithColor: "#dfe3ea" } as const;

export const ZONES: readonly ZoneDef[] = [
  {
    id: "snacks",
    label: "SNACKS & CEREAL",
    radioName: "SNACKS",
    start: 0,
    end: ZONE_A_END,
    wallColor: "#ff4f5a",
    propIds: ["prop_endcap", "prop_box_pile", "prop_pallet_stack", "prop_gondola", "prop_cart_corral"],
    buildingStyle: "neon",
    facadeMaterial: "plastic/matte",
    palette: {
      wall: libraryFacade("plastic/matte", WALL_REPEAT, "#ffd9d2"),
      corner: libraryFacade("plastic/matte", WALL_REPEAT, "#ff6b5a"),
      roof: libraryFacade("plastic/matte", ROOF_REPEAT, "#f2efe8"),
      window: "#fff6c9",
      storefront: "#c94a52",
      shutter: "#b8bec6",
      awning: "#ff3b4a",
      storeSign: "#ffd21e",
      roofProp: "#ff8a5a",
      guardrail: "#ffd21e",
      airConditioner: "#c9ccd1",
      clothesline: "#ff8a5a",
    },
    ground: { low: "#9d968a", high: "#ada698", waterline: "#9d968a" },
    surface: { id: "vinyl", label: "FRESHLY MOPPED VINYL", grip: 0.96 },
    fog: { color: "#ddd6c8", near: 70, far: 340 },
    sky: { ...CEILING, horizonColor: "#fbf1e6" },
  },
  {
    id: "frozen",
    label: "FROZEN FOODS",
    // The freezer cases throw a cold blue light across the iced floor.
    light: { key: { intensity: 0.8, color: "#a2c2ff" }, fill: { intensity: 1.05, color: "#80a8fa", groundColor: "#3f6596" }, environment: 0.7, exposure: 0.88 },
    radioName: "FROZEN",
    start: ZONE_A_END,
    end: ZONE_B_END,
    wallColor: "#5fd0ff",
    propIds: ["prop_freezer", "prop_freezer", "prop_endcap", "prop_wet_floor", "prop_gondola_tall"],
    buildingStyle: "coastal",
    facadeMaterial: "concrete/rough",
    palette: {
      wall: libraryFacade("concrete/rough", WALL_REPEAT, "#e6f6ff"),
      corner: libraryFacade("concrete/rough", WALL_REPEAT, "#8fd8ff"),
      roof: libraryFacade("concrete/rough", ROOF_REPEAT, "#eef3f6"),
      window: "#c9f0ff",
      storefront: "#3a8ab8",
      shutter: "#a9c4d4",
      awning: "#2fa8ff",
      storeSign: "#3fe0ff",
      roofProp: "#9fd8ff",
      guardrail: "#c9e9ff",
      airConditioner: "#c9dbe6",
      clothesline: "#9fd8ff",
    },
    ground: { low: "#93a7b2", high: "#a7b9c2", waterline: "#93a7b2" },
    surface: { id: "frost", label: "FROSTED FLOOR - ICY", grip: 0.86 },
    fog: { color: "#b8d0e8", near: 55, far: 300 },
    sky: { ...CEILING, horizonColor: "#eef8fd" },
  },
  {
    id: "bulk",
    label: "BULK & PAINT",
    radioName: "BULK",
    start: ZONE_B_END,
    end: EXIT_Z,
    wallColor: "#ffc23a",
    propIds: ["prop_pallet_stack", "prop_box_pile", "prop_gondola_tall", "prop_endcap", "prop_cart_corral"],
    buildingStyle: "industrial",
    facadeMaterial: "metal/corrugated",
    palette: {
      wall: libraryFacade("metal/corrugated", WALL_REPEAT, "#fff0c9"),
      corner: libraryFacade("metal/corrugated", WALL_REPEAT, "#ffc23a"),
      roof: libraryFacade("metal/corrugated", ROOF_REPEAT, "#ece4d2"),
      window: "#ffe08a",
      storefront: "#b8892a",
      shutter: "#c9c2b0",
      awning: "#ff8a1e",
      storeSign: "#ff6a1e",
      roofProp: "#ffc23a",
      guardrail: "#ffc23a",
      airConditioner: "#cfc8b8",
      clothesline: "#ffc23a",
    },
    ground: { low: "#988f7e", high: "#a9a08c", waterline: "#988f7e" },
    surface: { id: "concrete", label: "DUSTY CONCRETE", grip: 0.93 },
    fog: { color: "#dcd3c0", near: 60, far: 320 },
    sky: { ...CEILING, horizonColor: "#fbf2de" },
  },
];

/** The zone a run-metre mark falls in; Aisle 9's zones unless a track's are given. */
export function zoneAt<Zone extends TrackZone = ZoneDef>(z: number, zones: readonly Zone[] = ZONES as unknown as readonly Zone[]): Zone {
  for (const zone of zones) if (z < zone.end) return zone;
  return zones[zones.length - 1]!;
}

/** Fraction of the run covered at run metres `z`, against the track's exit (Aisle 9's by default). */
export function zoneProgress(z: number, exitAt: number = EXIT_Z): number {
  return Math.min(1, Math.max(0, z / exitAt));
}
