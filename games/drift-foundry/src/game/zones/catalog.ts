import type { BuildingPaletteOverrides, BuildingStyle } from "@jgengine/core/world/buildings";
import type { BiomeFog, BiomeSky, TerrainColors } from "@jgengine/core/world/features";
import { libraryFacade } from "../world/librarySurface";
import { EXIT_Z, ZONE_A_END, ZONE_B_END } from "../run/constants";

export type ZoneId = "canyons" | "flats" | "gantry";

/** What the yard's own ground is made of: the grip the tires find on the paved strip. */
export interface ZoneSurface {
  id: string;
  /** Reads on the HUD and in test evidence: which surface the kart is actually on. */
  label: string;
  /** Grip multiplier handed to the vehicle sim's `surfaceFriction` (1 = the reference surface). */
  grip: number;
}

/** One stretch of a track as the run reads it: what the radio calls it and the grip under the tires. */
export interface TrackZone {
  id: string;
  label: string;
  radioName: string;
  /** Run metres. */
  start: number;
  end: number;
  wallColor: string;
  /** Yard surface under the tires - oil, concrete or gravel decide how much grip the kart gets. */
  surface: ZoneSurface;
}

/** A Row Six zone: a track zone that also owns the corridor's generated building rows and terrain band. */
export interface ZoneDef extends TrackZone {
  id: ZoneId;
  propIds: readonly string[];
  buildingStyle: BuildingStyle;
  /** Shared-library material painting this zone's generated corridor facades and roofs. */
  facadeMaterial: string;
  /** Facade colours for this zone's corridor walls — the per-zone read the minimap already promises. */
  palette: BuildingPaletteOverrides;
  /** Ground palette for the zone's terrain band. */
  ground: TerrainColors;
  fog: BiomeFog;
  sky: BiomeSky;
}

/**
 * A bay face is one `bayWidth` × `floorHeight` slot (about 1.9 m × 2.8 m at this game's footprint),
 * so its repeat is that face over the material's own world tile. Roofs are one slab per building
 * spanning the whole footprint, hence the coarser repeat.
 */
const WALL_REPEAT: [number, number] = [1.4, 2];
const ROOF_REPEAT: [number, number] = [10, 7];

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
    facadeMaterial: "metal/corrugated",
    palette: {
      wall: libraryFacade("metal/corrugated", WALL_REPEAT, "#e0c2a6"),
      corner: libraryFacade("metal/corrugated", WALL_REPEAT, "#b89a80"),
      roof: libraryFacade("metal/corrugated", ROOF_REPEAT, "#96795f"),
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
    surface: { id: "oil", label: "OIL-SLICK YARD", grip: 0.96 },
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
    facadeMaterial: "concrete/rough",
    palette: {
      wall: libraryFacade("concrete/rough", WALL_REPEAT, "#d8dce0"),
      corner: libraryFacade("concrete/rough", WALL_REPEAT, "#b2b8be"),
      roof: libraryFacade("concrete/rough", ROOF_REPEAT, "#8f959b"),
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
    surface: { id: "concrete", label: "CONCRETE YARD", grip: 1 },
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
    facadeMaterial: "metal/rust",
    palette: {
      wall: libraryFacade("metal/rust", WALL_REPEAT, "#e4d0be"),
      corner: libraryFacade("metal/rust", WALL_REPEAT, "#c0a794"),
      roof: libraryFacade("metal/rust", ROOF_REPEAT, "#9d8674"),
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
    surface: { id: "gravel", label: "GRAVEL YARD", grip: 0.93 },
    fog: { color: "#8a6222", near: 50, far: 280 },
    sky: { horizonColor: "#ffae44", zenithColor: "#6b4c1e" },
  },
];

/** The zone a run-metre mark falls in; Row Six's zones unless a track's are given. */
export function zoneAt<Zone extends TrackZone = ZoneDef>(z: number, zones: readonly Zone[] = ZONES as unknown as readonly Zone[]): Zone {
  for (const zone of zones) if (z < zone.end) return zone;
  return zones[zones.length - 1]!;
}

/** Fraction of the run covered at run metres `z`, against the track's exit (Row Six's by default). */
export function zoneProgress(z: number, exitAt: number = EXIT_Z): number {
  return Math.min(1, Math.max(0, z / exitAt));
}
