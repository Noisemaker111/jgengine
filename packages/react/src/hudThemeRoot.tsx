import { useMemo, type ReactNode } from "react";

import type { AccessibilityState } from "@jgengine/core/ui/accessibility";

import { useEngineStyles } from "./engineStyles";
import { defaultHudTheme, hudThemeVars, type HudTheme } from "./hudTheme";

/**
 * The HUD root the shell mounts around every `GameUI`: a layout-free (`display: contents`)
 * `[data-jg-hud]` element carrying the theme's `--jg-*` variables, plus the engine stylesheet. Unset
 * `theme` applies {@link defaultHudTheme}; a game's own theme on any descendant still wins by
 * inheritance. `false` opts out of the default theme and the generic HUD control defaults; the
 * keyframes stay so engine blocks still animate.
 *
 * `accessibility` applies the player's preferences to the same root: `--jg-text-scale` scales every
 * type token, `data-reduced-motion` zeroes motion, and `data-high-contrast` / `data-colorblind` /
 * `data-captions` give CSS a hook. Pass the state an `AccessibilityProvider` would carry when the
 * game mounts its own root.
 *
 * @capability hud-theme-root apply the default (or a game) HudTheme, the player's accessibility preferences and the engine stylesheet at the HUD root
 */
export function HudThemeRoot({
  theme,
  accessibility,
  children,
}: {
  theme?: HudTheme | false;
  accessibility?: Partial<AccessibilityState>;
  children?: ReactNode;
}): ReactNode {
  useEngineStyles();
  const vars = useMemo(() => (theme === false ? null : hudThemeVars(theme ?? defaultHudTheme)), [theme]);
  const scale = accessibility?.textScale;
  const rootStyle = useMemo(
    () => (vars === null ? null : { display: "contents" as const, ...vars, "--jg-text-scale": String(scale ?? 1) }),
    [vars, scale],
  );
  if (rootStyle === null) return children;
  return (
    <div
      data-jg-hud=""
      data-reduced-motion={accessibility?.reducedMotion === undefined ? undefined : String(accessibility.reducedMotion)}
      data-high-contrast={accessibility?.highContrast === undefined ? undefined : String(accessibility.highContrast)}
      data-colorblind={accessibility?.colorblind ?? undefined}
      data-captions={accessibility?.captions === undefined ? undefined : String(accessibility.captions)}
      style={rootStyle}
    >
      {children}
    </div>
  );
}
