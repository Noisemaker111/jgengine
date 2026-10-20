import { useMemo, type ReactNode } from "react";

import { useEngineStyles } from "./engineStyles";
import { defaultHudTheme, hudThemeVars, type HudTheme } from "./hudTheme";

/**
 * The HUD root the shell mounts around every `GameUI`: a layout-free (`display: contents`)
 * `[data-jg-hud]` element carrying the theme's `--jg-*` variables, plus the engine stylesheet. Unset
 * `theme` applies {@link defaultHudTheme}; a game's own theme on any descendant still wins by
 * inheritance. `false` opts out of the default theme and the generic HUD control defaults; the
 * keyframes stay so engine blocks still animate.
 *
 * @capability hud-theme-root apply the default (or a game) HudTheme and the engine stylesheet at the HUD root
 */
export function HudThemeRoot({ theme, children }: { theme?: HudTheme | false; children?: ReactNode }): ReactNode {
  useEngineStyles();
  const vars = useMemo(() => (theme === false ? null : hudThemeVars(theme ?? defaultHudTheme)), [theme]);
  if (vars === null) return children;
  return (
    <div data-jg-hud="" style={{ display: "contents", ...vars }}>
      {children}
    </div>
  );
}
