import { useMemo, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { AccessibilityState } from "@jgengine/core/ui/accessibility";

import { useEngineStyles } from "../engineStyles";
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

/** The attribute on the element {@link HudOverlay} renders into. @internal */
export const HUD_OVERLAY_HOST_ATTRIBUTE = "data-jg-hud-overlay-host";

/**
 * A layout-free (`display: contents`) element to mount inside the HUD theme root, and inside the UI
 * kit when there is one. Overlays mounted outside the HUD tree render into it through
 * {@link HudOverlay}, so they inherit the game's theme and kit. `style` adds overrides for them only.
 * @internal
 */
export function HudOverlayHost({ style }: { style?: CSSProperties }): ReactNode {
  return <div {...{ [HUD_OVERLAY_HOST_ATTRIBUTE]: "" }} style={{ display: "contents", ...style }} />;
}

/** The overlay host among `anchor`'s siblings and their descendants, or `null`. @internal */
export function findHudOverlayHost(anchor: Element | null): HTMLElement | null {
  return anchor?.parentElement?.querySelector<HTMLElement>(`[${HUD_OVERLAY_HOST_ATTRIBUTE}]`) ?? null;
}

/**
 * Renders `children` into the {@link HudOverlayHost} next to `anchor` (an element of the caller's
 * own, rendered beside the HUD tree), or in place when there is none. Look it up as the overlay
 * opens, so the overlay mounts once, already inside the themed host.
 * @internal
 */
export function HudOverlay({ anchor, children }: { anchor: Element | null; children?: ReactNode }): ReactNode {
  const host = findHudOverlayHost(anchor);
  return host === null ? children : createPortal(children, host);
}
