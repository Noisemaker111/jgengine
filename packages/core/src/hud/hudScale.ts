import type { HudRect, HudSize } from "./hudLayout";

/** Where a game is meant to be played. `"web"` alone keeps today's desktop-first HUD; adding `"mobile"` turns on design-resolution fit scaling on compact displays. */
export type HudPlatform = "web" | "mobile";

/**
 * Design-resolution fit for the HUD surface. The game authors its UI against
 * `designSize`; on smaller viewports the whole HUD scales down by the limiting
 * axis ratio, clamped to `[minScale, maxScale]`, so panels keep their layout
 * and simply shrink instead of overflowing.
 */
export interface HudFitConfig {
  designSize?: HudSize;
  /** Floor for the computed scale — below this, shrinking further makes text unreadable. Default 0.4. */
  minScale?: number;
  /** Ceiling for the computed scale. Default 1 (never upscale past authored size). */
  maxScale?: number;
}

/** Per-game HUD viewport declaration carried on `PlayableGame.hudFit`; `mobile` overrides the fit on compact displays so the owner can tune the phone layout separately. */
export interface HudViewportConfig extends HudFitConfig {
  mobile?: HudFitConfig;
}

export const DEFAULT_HUD_DESIGN_SIZE: HudSize = { width: 1600, height: 900 };
export const DEFAULT_HUD_MIN_SCALE = 0.4;
export const DEFAULT_HUD_MAX_SCALE = 1;

export function resolveHudFit(config: HudViewportConfig | undefined, mobile: boolean): Required<HudFitConfig> {
  const base: Required<HudFitConfig> = {
    designSize: config?.designSize ?? DEFAULT_HUD_DESIGN_SIZE,
    minScale: config?.minScale ?? DEFAULT_HUD_MIN_SCALE,
    maxScale: config?.maxScale ?? DEFAULT_HUD_MAX_SCALE,
  };
  if (!mobile || config?.mobile === undefined) return base;
  return {
    designSize: config.mobile.designSize ?? base.designSize,
    minScale: config.mobile.minScale ?? base.minScale,
    maxScale: config.mobile.maxScale ?? base.maxScale,
  };
}

/**
 * The one scaling rule for every display: the ratio of the live viewport to
 * the authored design size along the limiting axis, clamped. 1 on a viewport
 * at or above design size; smoothly below 1 down to `minScale` on phones.
 */
export function hudScaleForViewport(fit: Required<HudFitConfig>, viewport: HudSize): number {
  if (
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    fit.designSize.width <= 0 ||
    fit.designSize.height <= 0
  ) {
    return 1;
  }
  const ratio = Math.min(viewport.width / fit.designSize.width, viewport.height / fit.designSize.height);
  return Math.min(fit.maxScale, Math.max(fit.minScale, ratio));
}

export interface HudOverflow {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Non-null when any edge of `rect` falls outside `viewport` by more than `tolerance` px; each field is the overflow distance past that edge (0 when inside). */
export function rectOverflow(rect: HudRect, viewport: HudSize, tolerance = 1.5): Omit<HudOverflow, "id"> | null {
  const left = Math.max(0, -rect.x);
  const top = Math.max(0, -rect.y);
  const right = Math.max(0, rect.x + rect.width - viewport.width);
  const bottom = Math.max(0, rect.y + rect.height - viewport.height);
  if (left <= tolerance && top <= tolerance && right <= tolerance && bottom <= tolerance) return null;
  const round = (n: number) => Math.round(n * 10) / 10;
  return { left: round(left), top: round(top), right: round(right), bottom: round(bottom) };
}

/**
 * True when at least `minVisiblePx²` of `rect` actually falls inside `viewport`.
 * The boundary check uses this to tell a *shown* surface from a *closed* one: a
 * mail drawer parked fully off-screen (or a menu that has not been opened) never
 * intersects the viewport, so it is not "escaping" — it is simply not on screen.
 * Only a surface that is partly visible and partly past an edge is a real defect.
 *
 * @internal Consumed transitively through {@link overflowingPanels}; exported for unit tests.
 */
export function rectIntersectsViewport(rect: HudRect, viewport: HudSize, minVisiblePx = 1): boolean {
  const visibleWidth = Math.min(rect.x + rect.width, viewport.width) - Math.max(rect.x, 0);
  const visibleHeight = Math.min(rect.y + rect.height, viewport.height) - Math.max(rect.y, 0);
  return visibleWidth >= minVisiblePx && visibleHeight >= minVisiblePx;
}

/**
 * Every panel rect that escapes the viewport — the data behind the HUD overflow
 * gate. A rect is only reported when it is partly visible *and* crosses an edge;
 * a fully off-screen (closed/hidden) surface is skipped, so parked drawers and
 * unopened menus never raise a false alarm.
 */
export function overflowingPanels(
  panels: readonly { id: string; rect: HudRect }[],
  viewport: HudSize,
  tolerance = 1.5,
): HudOverflow[] {
  const out: HudOverflow[] = [];
  for (const panel of panels) {
    if (!rectIntersectsViewport(panel.rect, viewport)) continue;
    const overflow = rectOverflow(panel.rect, viewport, tolerance);
    if (overflow !== null) out.push({ id: panel.id, ...overflow });
  }
  return out;
}
