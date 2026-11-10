import { createContext, useContext } from "react";

import type { GraphicsQuality } from "@jgengine/core/settings/settingsModel";

/** The player's graphics tier as terrain materials see it; the shell provides it, `high` outside one. */
export const TerrainQualityContext = createContext<GraphicsQuality>("high");

let drawQuality: GraphicsQuality = "high";

/** The graphics tier for draw code, which has no React context. */
export function noteTerrainQuality(quality: GraphicsQuality): void {
  drawQuality = quality;
}

/** The player's graphics tier for draw code (`high` outside a shell). */
export function terrainQuality(): GraphicsQuality {
  return drawQuality;
}

/** Graphics tier for terrain surface shading (`low` takes the cheap path). */
export function useTerrainQuality(): GraphicsQuality {
  return useContext(TerrainQualityContext);
}
