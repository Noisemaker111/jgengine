import { useEffect, useReducer, useRef, type CSSProperties, type ReactNode } from "react";

import type { ComboMeter, ComboMeterView } from "@jgengine/core/combat/comboMeter";

import { StaminaBar } from "./bars";

/**
 * Subscribe to a combo meter and re-render it each animation frame so the decay
 * window bar drains live, returning the pooled view to draw right now. Reading the
 * view each frame advances the meter's clock and fires window expiry, so a combo
 * that times out visibly drops even with no further hits. The returned object is
 * the model's pooled view — read its fields immediately, do not retain it.
 *
 * @capability use-combo-meter React hook binding a combo meter — re-renders per frame so the decay-window bar drains live and returns the current combo view
 */
export function useComboMeter(meter: ComboMeter, animate = true): ComboMeterView {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const rafRef = useRef(0);

  useEffect(() => meter.subscribe(bump), [meter]);

  useEffect(() => {
    if (!animate) return;
    let running = true;
    const loop = (): void => {
      if (!running) return;
      bump();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [meter, animate]);

  return meter.view();
}

/** Reskin tokens for {@link ComboMeterHud}. */
export interface ComboMeterTheme {
  /** Accent used when no tier is active (below the first threshold). Default reads `--jg-accent`. */
  accent?: string;
  /** Combo count text color. Default near-white. */
  count?: string;
  /** Tier label + multiplier text color. Default reads the active tier color. */
  label?: string;
  /** Font family. Default the HUD sans stack. */
  fontFamily?: string;
  /** Count font size (CSS length). Default `"clamp(2rem, 6vw, 4rem)"`. */
  countSize?: string;
}

/** Props for {@link ComboMeterHud}. */
export interface ComboMeterHudProps {
  /** The combo meter to render. */
  meter: ComboMeter;
  /**
   * Per-tier color keyed by the free-string tier id the game configured
   * ("good"/"great"/"savage", …). The active tier's color drives the count glow,
   * label, and draining window bar. Missing ids fall back to the accent.
   */
  tierColors?: Record<string, string>;
  /** Base reskin tokens. */
  theme?: ComboMeterTheme;
  /**
   * Drive re-renders on an animation frame so the window bar drains live. Default
   * `true`. Turn off if the game already re-renders the HUD each frame.
   */
  animate?: boolean;
  /** Hide the whole HUD while the combo count is zero. Default `true`. */
  hideWhenEmpty?: boolean;
  /** Width of the draining window bar (any CSS length). Default `220`. */
  barWidth?: number | string;
  className?: string;
  style?: CSSProperties;
}

function resolveTheme(theme: ComboMeterTheme | undefined): Required<Omit<ComboMeterTheme, "label">> & { label?: string } {
  return {
    accent: theme?.accent ?? "var(--jg-accent, #38bdf8)",
    count: theme?.count ?? "#f8fafc",
    label: theme?.label,
    fontFamily: theme?.fontFamily ?? "ui-sans-serif, system-ui, sans-serif",
    countSize: theme?.countSize ?? "clamp(2rem, 6vw, 4rem)",
  };
}

/**
 * A drop-in HUD for a core {@link ComboMeter}: the big live combo count ("×12"),
 * the current free-string tier label, the derived score multiplier, and a draining
 * window bar (reusing the shared atomic bar) that empties as the decay window runs
 * out and re-fills on every hit. The active tier's color — supplied by the game via
 * `tierColors`, keyed on the free-string tier id the model never interprets — drives
 * the count glow, the label, and the bar fill, so a game reskins the escalation
 * ("good" → "great" → "savage") without the engine hardcoding any tier meaning.
 * Presentation only: all counting, timing, tiers, and the multiplier live in the
 * core model.
 *
 * @capability combo-meter-hud drop-in HUD for a core combo meter — big live count, free-string tier label, derived multiplier, and a draining decay-window bar, per-tier colored from a caller map and HudTheme-token skinnable
 */
export function ComboMeterHud({
  meter,
  tierColors,
  theme,
  animate = true,
  hideWhenEmpty = true,
  barWidth = 220,
  className,
  style,
}: ComboMeterHudProps): ReactNode {
  const view = useComboMeter(meter, animate);
  const t = resolveTheme(theme);

  if (hideWhenEmpty && view.count <= 0) return null;

  const tierColor = view.tier !== null ? tierColors?.[view.tier] ?? t.accent : t.accent;
  const labelColor = t.label ?? tierColor;

  return (
    <div
      className={className}
      data-combo-meter=""
      data-combo-tier={view.tier ?? ""}
      data-combo-count={view.count}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 6,
        fontFamily: t.fontFamily,
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span
          data-combo-count-value=""
          style={{
            fontSize: t.countSize,
            fontWeight: 900,
            lineHeight: 1,
            letterSpacing: "0.02em",
            fontVariantNumeric: "tabular-nums",
            color: t.count,
            textShadow: `0 0 0.4em ${tierColor}, 0 3px 14px rgba(0,0,0,0.6)`,
          }}
        >
          ×{view.count}
        </span>
        {view.tier !== null ? (
          <span
            data-combo-tier-label=""
            style={{
              fontSize: "clamp(0.9rem, 2.4vw, 1.4rem)",
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: labelColor,
              textShadow: "0 2px 10px rgba(0,0,0,0.6)",
            }}
          >
            {view.tier}
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <StaminaBar
          value={view.fraction * 100}
          max={100}
          fill={tierColor}
          showValue={false}
          width={barWidth}
          shape="pill"
        />
        <span
          data-combo-multiplier=""
          style={{
            fontSize: 14,
            fontWeight: 800,
            fontVariantNumeric: "tabular-nums",
            color: labelColor,
            textShadow: "0 1px 6px rgba(0,0,0,0.6)",
          }}
        >
          {view.multiplier.toFixed(2)}× score
        </span>
      </div>
    </div>
  );
}
