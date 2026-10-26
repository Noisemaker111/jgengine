/** A paintable terrain material layer — a surface id plus the color it renders as. */
export interface TerrainPaintPreset {
  id: string;
  label: string;
  color: string;
}

/** The default terrain paint palette (surface id → color) shared by the panel and the mesh. */
export const TERRAIN_PAINT_PRESETS: readonly TerrainPaintPreset[] = [
  { id: "grass", label: "Grass", color: "#4b7f3f" },
  { id: "dirt", label: "Dirt", color: "#6b4f34" },
  { id: "rock", label: "Rock", color: "#7c7f86" },
  { id: "sand", label: "Sand", color: "#c2b283" },
  { id: "mud", label: "Mud", color: "#574433" },
  { id: "snow", label: "Snow", color: "#eef3f7" },
  { id: "road", label: "Road", color: "#3a3a3d" },
  { id: "gravel", label: "Gravel", color: "#8d8d84" },
];

/** Maps every default material id to its render color, for the sculpt mesh's per-cell surface tint. */
export const TERRAIN_PAINT_COLORS: Record<string, string> = Object.fromEntries(
  TERRAIN_PAINT_PRESETS.map((material) => [material.id, material.color]),
);

