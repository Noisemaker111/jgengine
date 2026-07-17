import type { CSSProperties, ReactNode } from "react";

/** Frame skin — `glass` (the shared dark-glass panel), `plate` (a heavier opaque plate), `retro` (a hard black-outlined frame), or `themed` (driven by the `--jg-frame-*` `HudTheme` tokens). */
export type HudFrameVariation = "glass" | "plate" | "retro" | "themed";

/** Frame corner shape — `rounded` (the variation's default radius), `circle` (fully round), or `square` (no radius). */
export type HudFrameShape = "rounded" | "circle" | "square";

/**
 * Bare style object for a HUD frame's look (no wrapper element) — spread it onto
 * a widget that already owns its element when it just needs the chrome CSS. The
 * `glass` variation is byte-for-byte the shared dark-glass panel used across the
 * built-in HUD widgets; `plate` is a heavier opaque plate; `retro` is a hard
 * black-outlined frame. `shape` overrides the corner radius.
 *
 * @internal helper behind {@link HudFrame} (and the built-in HUD `PANEL`); widgets normally use `HudFrame`.
 */
export function hudFrameStyle(
  variation: HudFrameVariation = "glass",
  shape: HudFrameShape = "rounded",
): CSSProperties {
  const base: CSSProperties =
    variation === "themed"
      ? {
          background: "var(--jg-frame-bg, rgba(10,12,16,0.62))",
          border: "var(--jg-frame-border, 1px solid rgba(255,255,255,0.10))",
          borderRadius: "var(--jg-frame-radius, 10px)",
          boxShadow: "var(--jg-frame-glow, 0 4px 16px rgba(0,0,0,0.35))",
          color: "var(--jg-bar-text, #f4f6fb)",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
        }
      : variation === "retro"
      ? {
          border: "2px solid #000",
          borderRadius: 4,
          boxShadow: "4px 4px 0 #000",
          color: "#fff",
        }
      : variation === "plate"
        ? {
            background: "rgba(16,18,24,0.92)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 10,
            color: "#f4f6fb",
            fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
            boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
          }
        : {
            background: "rgba(10,12,16,0.62)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 10,
            color: "#f4f6fb",
            fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
            boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
          };
  if (shape === "circle") return { ...base, borderRadius: 9999 };
  if (shape === "square") return { ...base, borderRadius: 0 };
  return base;
}

/** Props for {@link HudFrame}. */
export interface HudFrameProps {
  /** Frame skin (default `glass`). */
  variation?: HudFrameVariation;
  /** Corner shape (default `rounded`). */
  shape?: HudFrameShape;
  /** Small uppercase header label rendered at the top-left of the frame. */
  title?: ReactNode;
  /** Header content rendered at the top-right, opposite `title` (e.g. a readout or cardinal). */
  aside?: ReactNode;
  /** Inner padding of the frame. */
  padding?: number | string;
  /** Fixed frame width. */
  width?: number | string;
  /** Accept pointer events (default off, so the frame never eats clicks meant for the game). */
  interactive?: boolean;
  /** Extra class on the frame element. */
  className?: string;
  /** Style overrides merged last, so callers can pin exact gradients/colors. */
  style?: CSSProperties;
  /** Frame body. */
  children?: ReactNode;
}

/**
 * Shared framed HUD chrome — a single `<div data-hud-frame>` with a `glass`,
 * `plate`, or `retro` skin, an optional `title`/`aside` header row, and caller
 * `style` merged last. The one chrome primitive every framed widget reuses
 * instead of hand-rolling a bespoke panel `<div>` per widget.
 *
 * @capability hud-frame shared framed HUD chrome — glass/plate/retro skins, optional title/aside header, reused across every widget instead of a bespoke panel per widget
 */
export function HudFrame({
  variation = "glass",
  shape = "rounded",
  title,
  aside,
  padding,
  width,
  interactive,
  className,
  style,
  children,
}: HudFrameProps): ReactNode {
  const hasHeader = title !== undefined || aside !== undefined;
  return (
    <div
      className={className}
      data-hud-frame
      style={{
        ...hudFrameStyle(variation, shape),
        padding,
        width,
        pointerEvents: interactive === true ? "auto" : undefined,
        ...style,
      }}
    >
      {hasHeader ? (
        <div
          data-hud-frame-header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            marginBottom: 6,
            fontSize: 10,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            opacity: 0.75,
          }}
        >
          <span>{title}</span>
          {aside !== undefined ? <span>{aside}</span> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
