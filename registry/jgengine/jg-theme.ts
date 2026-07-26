import type { CSSProperties } from "react";

import {
  HUD_THEME_PRESETS,
  deriveHudTheme,
  hudThemeVars,
  type HudThemeSeed,
} from "@jgengine/react/hudTheme";

export type JgThemeVars = CSSProperties & Record<`--jg-${string}`, string>;

export const emberVars = hudThemeVars(HUD_THEME_PRESETS.ember) as JgThemeVars;
export const synthwaveVars = hudThemeVars(HUD_THEME_PRESETS.synthwave) as JgThemeVars;
export const fieldkitVars = hudThemeVars(HUD_THEME_PRESETS.fieldkit) as JgThemeVars;

export type JgThemeSeed = HudThemeSeed;

export function deriveJgTheme(seed: JgThemeSeed): JgThemeVars {
  return hudThemeVars(deriveHudTheme(seed)) as JgThemeVars;
}
