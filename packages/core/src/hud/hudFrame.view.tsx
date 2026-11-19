/** @jsxImportSource @jgengine/core/ui/jsx */
import type { CSSProperties, ReactNode } from "@jgengine/core/ui/jsx";

import { hudElevation, hudFont, hudType } from "./hudTokens";

export type HudFrameVariation = "glass" | "plate" | "retro" | "themed";

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
          borderImage: "var(--jg-frame-image, none) var(--jg-frame-slice, 0) / var(--jg-frame-scale, 1) var(--jg-frame-fill, stretch)",
          cursor: "var(--jg-skin-cursor, auto)",
          color: "var(--jg-text, #f4f6fb)",
          fontFamily: hudFont.body,
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
            fontFamily: hudFont.body,
            boxShadow: hudElevation("raised"),
          }
        : {
            // No backdrop blur: over a live 3D scene it re-renders every frame.
            background: "rgba(10,12,16,0.8)",
            backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0) 45%)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10,
            color: "#f4f6fb",
            fontFamily: hudFont.body,
            boxShadow: hudElevation("raised"),
          };
  if (shape === "circle") return { ...base, borderRadius: 9999 };
  if (shape === "square") return { ...base, borderRadius: 0 };
  return base;
}

export interface HudFrameProps {
  variation?: HudFrameVariation;
  shape?: HudFrameShape | undefined;
  title?: ReactNode;
  aside?: ReactNode;
  padding?: number | string;
  width?: number | string | undefined;
  /** Accept pointer events (default off, so the frame never eats clicks meant for the game). */
  interactive?: boolean;
  className?: string | undefined;
  /** Style overrides merged last, so callers can pin exact gradients/colors. */
  style?: CSSProperties | undefined;
  children?: ReactNode;
}

/** @capability hud-frame optional framed panel skins (glass/plate/retro/themed) — games own product chrome */
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
            fontSize: hudType("xs"),
            fontWeight: 650,
            letterSpacing: "var(--jg-tracking-label, 0.08em)",
            lineHeight: 1.2,
            textTransform: "uppercase",
            opacity: 0.82,
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
