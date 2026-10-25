/**
 * LLMville diorama palette — the single visual source of truth for the world skin.
 *
 * Anchors and per-tier feel come from `docs/design/diorama-asset-prompts.md` (Style Bible).
 * Surfaces (floor/wall/ceiling) and props both draw from this so every tier reads as
 * the same toy-model lab instead of mismatched downloads.
 */

/** Style Bible palette anchors. */
export const PALETTE = {
  ink: "#16201E",
  cream: "#F4ECDD",
  teal: "#5FC2A8",
  coral: "#E8836B",
  amber: "#E0A95C",
  wood: "#B07A4E",
  warmCream: "#E8DFCC",
} as const;

/** Derived neutrals that stay inside the warm diorama tone family. */
export const PALETTE_NEUTRALS = {
  warmWhite: "#F4ECDD",
  warmCream: "#E8DFCC",
  warmGrey: "#A89E8E",
  warmShadow: "#3A4341",
  inkSoft: "#2A3736",
  steelCool: "#5B6B6E",
  steelLight: "#9AA7A9",
} as const;

export type SurfacePattern =
  | "concrete"
  | "planks"
  | "herringbone"
  | "steelPanels"
  | "cinderblock"
  | "drywall"
  | "wainscot"
  | "steelWall"
  | "ceilingFlat"
  | "ceilingCoffer"
  | "ceilingDropTile";

export const SURFACE_PATTERN = {
  concrete: "concrete",
  planks: "planks",
  herringbone: "herringbone",
  steelPanels: "steelPanels",
  cinderblock: "cinderblock",
  drywall: "drywall",
  wainscot: "wainscot",
  steelWall: "steelWall",
  ceilingFlat: "ceilingFlat",
  ceilingCoffer: "ceilingCoffer",
  ceilingDropTile: "ceilingDropTile",
} as const satisfies Record<string, SurfacePattern>;

export interface FloorSurfaceSpec {
  base: string;
  accent: string;
  line: string;
  pattern: "concrete" | "planks" | "herringbone" | "steelPanels";
  /** World meters spanned by one texture tile (repeat unit). */
  tileWorldUnits: number;
}

export interface WallSurfaceSpec {
  base: string;
  accent: string;
  pattern: "cinderblock" | "drywall" | "wainscot" | "steelWall";
  /** World meters per wall-texture tile (drives ApartmentWall repeat). */
  tileWorldUnits: number;
  /** Tint applied to the wall material color. */
  wallColor: string;
}

export interface CeilingSurfaceSpec {
  base: string;
  accent: string;
  pattern: "ceilingFlat" | "ceilingCoffer" | "ceilingDropTile";
  tileWorldUnits: number;
}


/** Prop material presets — reusable surface treatments for procedural props. */
export type MaterialPreset =
  | "wood"
  | "woodLight"
  | "painted"
  | "fabric"
  | "metal"
  | "metalDark"
  | "accentTeal"
  | "accentCoral"
  | "accentAmber"
  | "emissiveWarm"
  | "emissiveCool"
  | "glass";

export const MATERIAL_PRESET = {
  wood: "wood",
  woodLight: "woodLight",
  painted: "painted",
  fabric: "fabric",
  metal: "metal",
  metalDark: "metalDark",
  accentTeal: "accentTeal",
  accentCoral: "accentCoral",
  accentAmber: "accentAmber",
  emissiveWarm: "emissiveWarm",
  emissiveCool: "emissiveCool",
  glass: "glass",
} as const satisfies Record<string, MaterialPreset>;

export interface MaterialPresetProps {
  color: string;
  roughness: number;
  metalness: number;
  emissive?: string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
}

const MATERIAL_PRESETS: Record<MaterialPreset, MaterialPresetProps> = {
  [MATERIAL_PRESET.wood]: { color: PALETTE.wood, roughness: 0.78, metalness: 0.0 },
  [MATERIAL_PRESET.woodLight]: { color: PALETTE.amber, roughness: 0.72, metalness: 0.0 },
  [MATERIAL_PRESET.painted]: { color: PALETTE_NEUTRALS.warmCream, roughness: 0.85, metalness: 0.0 },
  [MATERIAL_PRESET.fabric]: { color: PALETTE.coral, roughness: 0.92, metalness: 0.0 },
  [MATERIAL_PRESET.metal]: { color: PALETTE_NEUTRALS.steelLight, roughness: 0.5, metalness: 0.7 },
  [MATERIAL_PRESET.metalDark]: { color: PALETTE_NEUTRALS.inkSoft, roughness: 0.55, metalness: 0.6 },
  [MATERIAL_PRESET.accentTeal]: { color: PALETTE.teal, roughness: 0.5, metalness: 0.1 },
  [MATERIAL_PRESET.accentCoral]: { color: PALETTE.coral, roughness: 0.6, metalness: 0.0 },
  [MATERIAL_PRESET.accentAmber]: { color: PALETTE.amber, roughness: 0.55, metalness: 0.0 },
  [MATERIAL_PRESET.emissiveWarm]: { color: PALETTE.amber, roughness: 0.5, metalness: 0.0, emissive: PALETTE.amber, emissiveIntensity: 1.1 },
  [MATERIAL_PRESET.emissiveCool]: { color: PALETTE.teal, roughness: 0.5, metalness: 0.0, emissive: PALETTE.teal, emissiveIntensity: 1.4 },
  [MATERIAL_PRESET.glass]: { color: "#AED7C9", roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.45 },
};

export function getMaterialPreset(preset: MaterialPreset): MaterialPresetProps {
  return MATERIAL_PRESETS[preset];
}
