import type { RoofMaterial } from "../route/legs";
import { PALETTE } from "../tuning";

export interface RoofObjectDef {
  id: string;
  label: string;
  solid: boolean;
  color: string;
}

export const ROOF_TILE = "roof_tile";
export const ROOF_BRIDGE_PLANK = "roof_bridge_plank";
export const ROOF_BRIDGE_AWNING = "roof_bridge_awning";

export const ROOF_OBJECTS: Readonly<Record<string, RoofObjectDef>> = {
  [ROOF_TILE]: { id: ROOF_TILE, label: "Rooftop tile", solid: true, color: PALETTE.concrete },
  [ROOF_BRIDGE_PLANK]: { id: ROOF_BRIDGE_PLANK, label: "Plank bridge", solid: true, color: "#8a6a4a" },
  [ROOF_BRIDGE_AWNING]: { id: ROOF_BRIDGE_AWNING, label: "Market awning", solid: true, color: PALETTE.gold },
  roof_vent: { id: "roof_vent", label: "AC vent", solid: true, color: "#6b6b6b" },
  roof_chimney: { id: "roof_chimney", label: "Chimney", solid: true, color: "#5a4438" },
  roof_crate: { id: "roof_crate", label: "Crate stack", solid: true, color: "#8a6a3d" },
  roof_watertank: { id: "roof_watertank", label: "Water tank", solid: true, color: "#4a5c66" },
  roof_rail: { id: "roof_rail", label: "Roof rail", solid: false, color: PALETTE.ink },
  roof_skylight: { id: "roof_skylight", label: "Skylight", solid: false, color: "#9fd0e0" },
  roof_antenna: { id: "roof_antenna", label: "Antenna", solid: false, color: "#c9c4b8" },
  finish_banner: { id: "finish_banner", label: "Finish banner", solid: false, color: PALETTE.brick },
};

export const ROOF_MATERIAL_COLORS: Readonly<Record<RoofMaterial, string>> = {
  tar: "#3c3a3a",
  brick: PALETTE.brick,
  glass: "#7fb8c9",
  canvas: "#d98b3f",
  stone: PALETTE.concrete,
};
