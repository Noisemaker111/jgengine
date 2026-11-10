import { useCallback, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from "@jgengine/core/ui/jsx";

import type { EventTicker, EventTickerView } from "@jgengine/core/feed/eventTicker";

import { GameIcon, isGameIconName } from "../ui/icons/gameIcons.view";
import { memoView } from "../ui/memoView.view";
import { subscribeFrameBind, useFrameBind } from "../ui/liveBind.view";

/**
 * Subscribe to an event ticker, returning the live entries newest-first with `fade` applied. It
 * re-renders only when an entry arrives or ages out (checked each frame while `animate`); the fade
 * itself is drawn per frame by {@link KillFeed} without a render.
 *
 * @capability use-event-ticker React hook binding an event-ticker — re-renders when entries arrive or expire, returning the current newest-first views
 */
export function useEventTicker(ticker: EventTicker, animate = true): EventTickerView[] {
  const subscribe = useCallback(
    (changed: () => void) => {
      const off = ticker.subscribe(changed);
      // An entry ages out on its own: watch the list each frame, re-render only when one leaves.
      const offFrames = animate ? subscribeFrameBind(changed) : () => undefined;
      return () => {
        off();
        offFrames();
      };
    },
    [ticker, animate],
  );
  const read = useCallback(() => ticker.recent().map((entry) => entry.id).join("\n"), [ticker]);
  useSyncExternalStore(subscribe, read, read);
  return ticker.recent();
}

function rowFade(fade: number): { opacity: string; transform: string } {
  return { opacity: String(1 - fade * 0.85), transform: `translateX(${fade * 8}px)` };
}

/** Per-`kind` styling for a kill-feed row — accent color and an optional icon. */
export interface KillFeedKindStyle {
  /** Accent color for the row's icon and left rule. */
  accent?: string;
  /** Free-string {@link GameIcon} name to show for this kind (overridden by an entry's own `icon`). */
  icon?: string;
  /** Text color for the row. Defaults to the theme text color. */
  color?: string;
}

/** Reskin tokens for {@link KillFeed}. */
export interface KillFeedTheme {
  /** Row background. Default reads `--jg-frame-bg`. */
  rowBg?: string;
  /** Row text color. Default near-white. */
  text?: string;
  /** Fallback accent when a kind has none. Default reads `--jg-accent`. */
  accent?: string;
  /** Font family. */
  fontFamily?: string;
  /** Row corner radius. Default reads `--jg-frame-radius`. */
  radius?: string;
}

function resolveTheme(theme: KillFeedTheme | undefined): Required<KillFeedTheme> {
  return {
    rowBg: theme?.rowBg ?? "var(--jg-frame-bg, rgba(12,16,22,0.82))",
    text: theme?.text ?? "#f1f5f9",
    accent: theme?.accent ?? "var(--jg-accent, #38bdf8)",
    fontFamily: theme?.fontFamily ?? "ui-sans-serif, system-ui, sans-serif",
    radius: theme?.radius ?? "var(--jg-frame-radius, 8px)",
  };
}

/** Props for {@link KillFeed}. */
export interface KillFeedProps {
  /** The ticker to render. */
  ticker: EventTicker;
  /**
   * Per-`kind` accent + icon, keyed by the free-string `kind` a game pushes with ("kill",
   * "assist", "info", …). The matching entry styles that row; the model never interprets `kind`.
   */
  kindStyles?: Record<string, KillFeedKindStyle>;
  /** Base reskin tokens. */
  theme?: KillFeedTheme;
  /** Icon size in px. Default `18`. */
  iconSize?: number;
  /** Drive re-render on an animation frame. Default `true`. Turn off if the game ticks it. */
  animate?: boolean;
  /** Extra `z-index` for the stack. Default `40`. */
  zIndex?: number;
  /** Draws an entry's icon in place of the {@link GameIcon} lookup (a game's own item art); null draws none. */
  renderIcon?: (entry: EventTickerView) => ReactNode;
  /** Merged over each row's style: `{ background: "none", borderLeft: "none" }` gives bare lines. */
  rowStyle?: CSSProperties;
  /** Show the oldest entry first, so a new line lands at the bottom. Default `false` (newest on top). */
  oldestFirst?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * A vertical event/kill-feed ticker: renders an {@link EventTicker}'s recent entries as a
 * stack of rows, newest on top, each with its `fade` `0..1` mapped to opacity so entries dim
 * and drop as they age out. Each row shows an optional per-kind (or per-entry) {@link GameIcon}
 * and a per-kind accent color from `kindStyles`, styled with HudTheme tokens. Presentation
 * only: all capping/timing lives in the core ticker, and the free-string `kind`/`text`/`icon`
 * are never interpreted here — a game colors and icons each variant via `kindStyles`.
 *
 * @capability kill-feed vertical event/kill-feed ticker rendering a core event-ticker as a fading, newest-on-top stack of per-kind iconned, accent-colored rows over HudTheme tokens
 */
export const KillFeed = memoView("KillFeed", function KillFeed({
  ticker,
  kindStyles,
  theme,
  iconSize = 18,
  animate = true,
  zIndex = 40,
  renderIcon,
  rowStyle,
  oldestFirst = false,
  className,
  style,
}: KillFeedProps): ReactNode {
  const recent = useEventTicker(ticker, animate);
  const entries = oldestFirst ? [...recent].reverse() : recent;
  const t = resolveTheme(theme);
  const feed = useRef<HTMLDivElement>(null);
  // Rows fade as they age, every frame: each row's opacity and slide are written to its node.
  useFrameBind(
    feed,
    () => (animate ? ticker.recent().map((entry) => `${entry.id}:${Math.round(entry.fade * 1000)}`).join("|") : ""),
    (_key, element) => {
      if (!animate) return;
      for (const entry of ticker.recent()) {
        const row = element.querySelector<HTMLElement>(`[data-kill-feed-row="${CSS.escape(String(entry.id))}"]`);
        if (row === null) continue;
        const { opacity, transform } = rowFade(entry.fade);
        row.style.opacity = opacity;
        row.style.transform = transform;
      }
    },
  );

  return (
    <div
      ref={feed}
      className={className}
      data-kill-feed=""
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 6,
        pointerEvents: "none",
        fontFamily: t.fontFamily,
        zIndex,
        ...style,
      }}
    >
      {entries.map((entry) => {
        const kindStyle = kindStyles?.[entry.kind];
        const accent = kindStyle?.accent ?? t.accent;
        const iconName = entry.icon ?? kindStyle?.icon;
        const { opacity, transform } = rowFade(entry.fade);
        return (
          <div
            key={entry.id}
            data-kill-feed-row={entry.id}
            data-kind={entry.kind}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 10px",
              background: t.rowBg,
              borderLeft: `3px solid ${accent}`,
              borderRadius: t.radius,
              color: kindStyle?.color ?? t.text,
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1.2,
              whiteSpace: "nowrap",
              opacity,
              boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
              transform,
              willChange: "opacity, transform",
              ...rowStyle,
            }}
          >
            {renderIcon !== undefined ? (
              renderIcon(entry)
            ) : iconName !== undefined && isGameIconName(iconName) ? (
              <span style={{ color: accent, display: "flex", flexShrink: 0 }}>
                <GameIcon name={iconName} size={iconSize} />
              </span>
            ) : null}
            <span data-kill-feed-text="">{entry.text}</span>
          </div>
        );
      })}
    </div>
  );
});
