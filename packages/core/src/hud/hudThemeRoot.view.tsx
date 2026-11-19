/** @jsxImportSource @jgengine/core/ui/jsx */
import { useMemo, type CSSProperties, type ReactNode } from "@jgengine/core/ui/jsx";
import { createPortal } from "@jgengine/core/ui/jsx/client.view";

import type { AccessibilityState } from "@jgengine/core/ui/accessibility";

import { useEngineStyles } from "@jgengine/ui/engineStyles";
import { defaultHudTheme, hudThemeVars, type HudTheme } from "./hudTheme.view";

/** @capability hud-theme-root apply the default (or a game) HudTheme, the player's accessibility preferences and the engine stylesheet at the HUD root */
export function HudThemeRoot({
  theme,
  accessibility,
  children,
}: {
  theme?: HudTheme | false | undefined;
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

/** @internal */
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

/** @internal */
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
