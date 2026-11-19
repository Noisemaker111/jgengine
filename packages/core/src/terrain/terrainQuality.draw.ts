import { createContext, useContext } from "@jgengine/core/ui/jsx";

import type { GraphicsQuality } from "@jgengine/core/settings/settingsModel";

export const TerrainQualityContext = createContext<GraphicsQuality>("high");

let drawQuality: GraphicsQuality = "high";

export function noteTerrainQuality(quality: GraphicsQuality): void {
  drawQuality = quality;
}

export function terrainQuality(): GraphicsQuality {
  return drawQuality;
}

export function useTerrainQuality(): GraphicsQuality {
  return useContext(TerrainQualityContext);
}
