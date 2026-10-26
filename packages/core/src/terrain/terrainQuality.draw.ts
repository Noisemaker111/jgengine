import { createContext, useContext } from "react";

import type { GraphicsQuality } from "@jgengine/core/settings/settingsModel";

/** The player's graphics tier as terrain materials see it; the shell provides it, `high` outside one. */
export const TerrainQualityContext = createContext<GraphicsQuality>("high");

/** Graphics tier for terrain surface shading (`low` takes the cheap path). */
export function useTerrainQuality(): GraphicsQuality {
  return useContext(TerrainQualityContext);
}
