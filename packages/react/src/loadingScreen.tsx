import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { createTipRotation, type TipRotation } from "@jgengine/core/ui/loadingTips";
import { menuIntentForKey } from "@jgengine/core/ui/menuNav";

import { hudSpace, hudType } from "./hudTokens";
import { useMenuNav } from "./menuNav";
import { MenuScreen, type MenuScreenScrim } from "./menuScreen";

/** Props for {@link LoadingScreen}. */
export interface LoadingScreenProps {
  /** Load progress from 0 to 1. Omit for an indeterminate bar. */
  progress?: number;
  /** Heading. Default `"Loading"`. */
  title?: ReactNode;
  /** The game's tips, shown one at a time. Omit to show no tip. */
  tips?: readonly string[] | TipRotation;
  /** How long each tip stays up, ms. Default 6000. */
  tipIntervalMs?: number;
  /** Show the "press to continue" prompt and accept confirm. */
  ready?: boolean;
  /** Called when the player confirms a ready screen (any key, A/Cross, or a click). */
  onReady?: () => void;
  /** Called on Escape/back while loading — a "skip" the game may honour. */
  onSkip?: () => void;
  /** A live scene or artwork painted behind the loading screen. */
  backdrop?: ReactNode;
  /** Dim/blur treatment over the scene behind. Default `"blur"`. */
  scrim?: MenuScreenScrim;
  /** Extra content under the bar (a spinner, a status line). */
  children?: ReactNode;
  open?: boolean;
  reducedMotion?: boolean;
  onClosed?: () => void;
  className?: string;
  style?: CSSProperties;
  contentClassName?: string;
  contentStyle?: CSSProperties;
}

const column: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: hudSpace("md"),
  width: "min(92vw, 520px)",
};

function useTip(rotation: TipRotation, intervalMs: number, active: boolean): string | null {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!active || intervalMs <= 0) return;
    const timer = setInterval(() => {
      rotation.next();
      bump((value) => value + 1);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [rotation, intervalMs, active]);
  return rotation.current();
}

/**
 * A loading screen with a progress bar and a rotating tip. Progress is a real 0–1 value from the
 * game's loader (or indeterminate), tips come from the game and cycle deterministically, and a
 * `ready` screen accepts any key, a gamepad A/Cross or a click. It reads HudTheme tokens and keeps a
 * live scene visible behind a blur, so loading a level looks like the game rather than a blank page.
 *
 * @capability loading-screen loading block with progress, rotating tips, a ready gate, and a scene backdrop
 */
export function LoadingScreen({
  progress,
  title = "Loading",
  tips,
  tipIntervalMs = 6000,
  ready = false,
  onReady,
  onSkip,
  backdrop,
  scrim = "blur",
  children,
  open = true,
  reducedMotion,
  onClosed,
  className,
  style,
  contentClassName,
  contentStyle,
}: LoadingScreenProps): ReactNode {
  const rotation = useMemo<TipRotation>(() => {
    if (tips === undefined) return createTipRotation({ tips: [] });
    return Array.isArray(tips) ? createTipRotation({ tips }) : (tips as TipRotation);
  }, [tips]);
  const tip = useTip(rotation, tipIntervalMs, open && !ready);

  const nav = useMenuNav({
    ids: ready ? ["continue"] : [],
    enabled: ready,
    onConfirm: () => onReady?.(),
    ...(onSkip === undefined ? {} : { onBack: onSkip }),
  });

  useEffect(() => {
    if (!ready || onReady === undefined) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code === "Tab" || menuIntentForKey(event.code) !== null) return;
      onReady();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready, onReady]);

  const clamped = progress === undefined ? undefined : Math.max(0, Math.min(1, progress));
  const percent = clamped === undefined ? null : `${Math.round(clamped * 100)}%`;

  return (
    <MenuScreen
      open={open}
      transition="fade"
      scrim={scrim}
      label={typeof title === "string" ? title : "Loading"}
      {...(backdrop === undefined ? {} : { backdrop })}
      {...(reducedMotion === undefined ? {} : { reducedMotion })}
      {...(onClosed === undefined ? {} : { onClosed })}
      className={className}
      style={style}
      contentClassName={contentClassName}
      contentStyle={contentStyle}
    >
      <div data-loading-screen="" style={column} {...nav.containerProps}>
        <div
          data-loading-title=""
          style={{
            fontFamily: "var(--jg-font-display, inherit)",
            fontSize: hudType("xl"),
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--jg-text, #f5f7fa)",
          }}
        >
          {title}
        </div>
        <div
          data-loading-bar=""
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          {...(clamped === undefined ? {} : { "aria-valuenow": Math.round(clamped * 100) })}
          aria-label="Loading progress"
          style={{
            position: "relative",
            height: 6,
            borderRadius: 999,
            overflow: "hidden",
            background: "var(--jg-surface-deep, rgba(255,255,255,0.12))",
            border: "1px solid var(--jg-edge, rgba(255,255,255,0.14))",
          }}
        >
          <div
            data-loading-fill=""
            style={{
              height: "100%",
              transformOrigin: "left center",
              transform: `scaleX(${clamped ?? 0.18})`,
              background: "linear-gradient(90deg, var(--jg-accent-deep, #2f9e6b), var(--jg-accent, #6ee7a8))",
              transition: "transform var(--jg-motion-slow, 320ms) var(--jg-ease-out, cubic-bezier(0.16, 1, 0.3, 1))",
              ...(clamped === undefined
                ? {
                    animation: "jg-sheen 1.1s linear infinite",
                    backgroundImage:
                      "linear-gradient(90deg, var(--jg-accent-deep, #2f9e6b), var(--jg-accent, #6ee7a8), var(--jg-accent-deep, #2f9e6b))",
                    backgroundSize: "260px 100%",
                  }
                : {}),
            }}
          />
        </div>
        {percent === null ? null : (
          <span data-loading-percent="" style={{ fontSize: hudType("xs"), color: "var(--jg-text-dim, #94a3a0)", fontVariantNumeric: "tabular-nums" }}>
            {percent}
          </span>
        )}
        {tip === null ? null : (
          <p
            data-loading-tip=""
            aria-live="polite"
            style={{
              margin: 0,
              minHeight: "2.6em",
              fontSize: hudType("sm"),
              lineHeight: 1.4,
              color: "var(--jg-text-dim, #94a3a0)",
            }}
          >
            <span style={{ color: "var(--jg-accent, #6ee7a8)", fontWeight: 700, letterSpacing: "0.14em", marginRight: 8 }}>
              TIP
            </span>
            {tip}
          </p>
        )}
        {children}
        {ready ? (
          <button
            type="button"
            data-loading-continue=""
            {...nav.itemProps("continue")}
            onClick={() => onReady?.()}
            style={{
              alignSelf: "flex-start",
              marginTop: hudSpace("sm"),
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid var(--jg-edge-bright, rgba(255,255,255,0.22))",
              background: "var(--jg-surface, rgba(20,24,32,0.8))",
              color: "var(--jg-text, #f5f7fa)",
              fontSize: hudType("sm"),
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Press any key to continue
          </button>
        ) : null}
      </div>
    </MenuScreen>
  );
}
