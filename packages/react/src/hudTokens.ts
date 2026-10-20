/**
 * Inline-style accessors for the `HudTheme` scale tokens (#1034): each returns a `var(--jg-*)`
 * reference with the default theme's value as fallback, so a block reads the active theme when one
 * is applied and still renders the default look outside the shell.
 *
 * @capability hud-tokens inline-style accessors for the HudTheme type scale, spacing, motion, elevation, and focus ring
 */

/** Type-scale step. `xs` is the smallest step and never renders below the theme's 12px floor. */
export type HudTypeStep = "xs" | "sm" | "md" | "lg" | "xl" | "xxl" | "display";

/** Spacing step. */
export type HudSpaceStep = "xs" | "sm" | "md" | "lg" | "xl";

/** Motion duration step. */
export type HudMotionSpeed = "fast" | "base" | "slow";

/** Motion easing. */
export type HudEase = "ease" | "easeOut" | "spring";

/** Shadow stack height. */
export type HudElevation = "raised" | "overlay" | "modal";

const TYPE_PX: Record<HudTypeStep, number> = { xs: 12, sm: 13, md: 14, lg: 16, xl: 20, xxl: 26, display: 34 };
const SPACE_PX: Record<HudSpaceStep, number> = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
const MOTION_MS: Record<HudMotionSpeed, number> = { fast: 120, base: 180, slow: 320 };
const EASE: Record<HudEase, [string, string]> = {
  ease: ["--jg-ease", "cubic-bezier(0.2, 0, 0, 1)"],
  easeOut: ["--jg-ease-out", "cubic-bezier(0.16, 1, 0.3, 1)"],
  spring: ["--jg-ease-spring", "cubic-bezier(0.34, 1.56, 0.64, 1)"],
};
const ELEVATION: Record<HudElevation, string> = {
  raised: "0 1px 2px rgba(0,0,0,0.45), 0 4px 12px -2px rgba(0,0,0,0.4)",
  overlay: "0 2px 4px rgba(0,0,0,0.4), 0 10px 24px -4px rgba(0,0,0,0.5)",
  modal: "0 4px 8px rgba(0,0,0,0.35), 0 24px 56px -12px rgba(0,0,0,0.7)",
};

/** UI sans stack used when no theme supplies `--jg-font-body`. */
export const HUD_FONT_STACK =
  '"Inter Variable", Inter, "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Font-size reference for a type-scale step, e.g. `fontSize: hudType("xs")`. */
export function hudType(step: HudTypeStep): string {
  return `var(--jg-type-${step}, ${TYPE_PX[step]}px)`;
}

/** Spacing reference for a step, e.g. `padding: hudSpace("sm")`. */
export function hudSpace(step: HudSpaceStep): string {
  return `var(--jg-space-${step}, ${SPACE_PX[step]}px)`;
}

/** Duration reference scaled by `--jg-motion-scale` (0 under reduced motion). */
export function hudDuration(speed: HudMotionSpeed = "fast"): string {
  return `calc(var(--jg-motion-${speed}, ${MOTION_MS[speed]}ms) * var(--jg-motion-scale, 1))`;
}

/** Easing reference. */
export function hudEase(ease: HudEase = "ease"): string {
  const [name, fallback] = EASE[ease];
  return `var(${name}, ${fallback})`;
}

/** `transition` value for the given properties at one speed and easing, honouring reduced motion. */
export function hudTransition(properties: string | readonly string[], speed: HudMotionSpeed = "fast", ease: HudEase = "ease"): string {
  const list = typeof properties === "string" ? [properties] : properties;
  return list.map((property) => `${property} ${hudDuration(speed)} ${hudEase(ease)}`).join(", ");
}

/** `box-shadow` reference for a height, with the lit top rim layered in. */
export function hudElevation(level: HudElevation = "raised"): string {
  return `var(--jg-highlight, inset 0 1px 0 rgba(255,255,255,0.08)), var(--jg-elevation-${level}, ${ELEVATION[level]})`;
}

/** Font-family references for each theme role. */
export const hudFont = {
  body: `var(--jg-font-body, ${HUD_FONT_STACK})`,
  display: `var(--jg-font-display, ${HUD_FONT_STACK})`,
  numeric: `var(--jg-font-numeric, ${HUD_FONT_STACK})`,
} as const;

/** Focus ring `box-shadow` reference. */
export const HUD_FOCUS_RING = "var(--jg-focus-ring, 0 0 0 2px #0a0c10, 0 0 0 4px var(--jg-accent, #38bdf8))";
