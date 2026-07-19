import { useEffect, useReducer, useRef, type CSSProperties, type ReactNode } from "react";

import type {
  ObjectiveBannerController,
  ObjectiveBannerPhase,
  ObjectiveBannerView,
} from "@jgengine/core/ui/objectiveBanner";

/**
 * Subscribe to a banner controller, drive its clock on an animation frame (unless
 * the game already ticks it), and return the banner to draw right now — or `null`
 * when idle. Re-renders every frame while a banner is animating.
 *
 * @capability use-objective-banner React hook binding an objective-banner controller — advances its clock per frame and returns the current banner view
 */
export function useObjectiveBanner(
  controller: ObjectiveBannerController,
  animate = true,
): ObjectiveBannerView | null {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const rafRef = useRef(0);

  useEffect(() => controller.subscribe(bump), [controller]);

  useEffect(() => {
    if (!animate) return;
    let running = true;
    const loop = (): void => {
      if (!running) return;
      controller.advance();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [controller, animate]);

  return controller.current();
}

/** Reskin tokens for {@link ObjectiveBannerHost}. Per-`kind` overrides layer on top. */
export interface ObjectiveBannerTheme {
  /** Accent for the title glow and the divider rule. Default reads `--jg-accent`. */
  accent?: string;
  /** Title text color. Default near-white. */
  title?: string;
  /** Subtitle text color. */
  subtitle?: string;
  /** Font family for the banner. */
  fontFamily?: string;
  /** Title font size (CSS length). Default `"clamp(2.5rem, 8vw, 6rem)"`. */
  titleSize?: string;
  /** Subtitle font size (CSS length). Default `"clamp(1rem, 2.5vw, 1.5rem)"`. */
  subtitleSize?: string;
}

function resolveTheme(theme: ObjectiveBannerTheme | undefined): Required<ObjectiveBannerTheme> {
  return {
    accent: theme?.accent ?? "var(--jg-accent, #38bdf8)",
    title: theme?.title ?? "#f8fafc",
    subtitle: theme?.subtitle ?? "rgba(226,232,240,0.85)",
    fontFamily: theme?.fontFamily ?? "ui-sans-serif, system-ui, sans-serif",
    titleSize: theme?.titleSize ?? "clamp(2.5rem, 8vw, 6rem)",
    subtitleSize: theme?.subtitleSize ?? "clamp(1rem, 2.5vw, 1.5rem)",
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Ease-out cubic for the fly-in so it decelerates into place. */
function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * The animated transform + opacity for a banner from its phase and progress. The
 * banner flies up into place on the way `in`, holds fully visible, then lifts and
 * fades on the way `out`. Presentation-only — nothing here reads `kind`.
 */
function bannerMotion(phase: ObjectiveBannerPhase, progress: number): { opacity: number; translateY: number; scale: number } {
  switch (phase) {
    case "in": {
      const e = easeOut(progress);
      return { opacity: progress, translateY: lerp(36, 0, e), scale: lerp(0.82, 1, e) };
    }
    case "hold":
      return { opacity: 1, translateY: 0, scale: 1 };
    case "out":
    default:
      return { opacity: 1 - progress, translateY: lerp(0, -22, progress), scale: lerp(1, 1.06, progress) };
  }
}

/** Props for {@link ObjectiveBannerHost}. */
export interface ObjectiveBannerHostProps {
  /** The controller to render. */
  controller: ObjectiveBannerController;
  /** Base reskin tokens. */
  theme?: ObjectiveBannerTheme;
  /**
   * Per-`kind` theme overrides, keyed by the free-string `kind` a game announces
   * with ("victory", "defeat", "wave", …). The matching entry layers over `theme`,
   * so a game colors each banner variant without the model interpreting `kind`.
   */
  kindThemes?: Record<string, ObjectiveBannerTheme>;
  /**
   * Drive `advance()` on an animation frame. Default `true`. Turn off if the game
   * already advances the controller from its own tick.
   */
  animate?: boolean;
  /** Dismiss the active banner when the overlay is clicked. Default `false`. */
  dismissOnClick?: boolean;
  /** Extra `z-index` for the overlay root. Default `50`. */
  zIndex?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * A full-screen overlay that renders an {@link ObjectiveBannerController} as the
 * classic transient centered title stamp — "WAVE 3", "VICTORY", "OBJECTIVE
 * COMPLETE" — flying in, holding, and fading out. It subscribes to the model,
 * drives `advance()` on an animation frame (unless the game ticks it), and maps the
 * current banner's phase + progress to opacity/scale/translate. Reskin the base
 * look with {@link ObjectiveBannerTheme} and color each variant via `kindThemes`
 * keyed on the game-owned `kind`. Presentation only: all timing and queueing live
 * in the core model, and `kind` is never interpreted here.
 *
 * @capability objective-banner-host full-screen overlay that renders a core objective-banner controller as a fly-in / hold / fade-out centered title + subtitle stamp, theme- and per-kind-skinnable
 */
export function ObjectiveBannerHost({
  controller,
  theme,
  kindThemes,
  animate = true,
  dismissOnClick = false,
  zIndex = 50,
  className,
  style,
}: ObjectiveBannerHostProps): ReactNode {
  const view = useObjectiveBanner(controller, animate);
  if (view === null) return null;

  const merged = { ...theme, ...kindThemes?.[view.kind] };
  const t = resolveTheme(merged);
  const motion = bannerMotion(view.phase, view.progress);

  return (
    <div
      className={className}
      data-objective-banner-host=""
      onClick={dismissOnClick ? () => controller.skip() : undefined}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: dismissOnClick ? "auto" : "none",
        zIndex,
        fontFamily: t.fontFamily,
        textAlign: "center",
        ...style,
      }}
    >
      <div
        data-objective-banner={view.id}
        data-kind={view.kind}
        data-phase={view.phase}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.5em",
          opacity: motion.opacity,
          transform: `translateY(${motion.translateY}px) scale(${motion.scale})`,
          willChange: "opacity, transform",
        }}
      >
        <div
          data-objective-banner-title=""
          style={{
            margin: 0,
            fontSize: t.titleSize,
            fontWeight: 900,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            lineHeight: 1,
            color: t.title,
            textShadow: `0 0 0.35em ${t.accent}, 0 4px 24px rgba(0,0,0,0.6)`,
          }}
        >
          {view.title}
        </div>
        <div
          aria-hidden="true"
          style={{
            width: "min(40vw, 320px)",
            height: 2,
            background: `linear-gradient(90deg, transparent, ${t.accent}, transparent)`,
            opacity: 0.9,
          }}
        />
        {view.subtitle !== undefined ? (
          <div
            data-objective-banner-subtitle=""
            style={{
              margin: 0,
              fontSize: t.subtitleSize,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: t.subtitle,
              textShadow: "0 2px 12px rgba(0,0,0,0.6)",
            }}
          >
            {view.subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
}
