import type { CSSProperties, ReactNode } from "react";

import { HUD_CORNER_WIDTH } from "./hudLayout.view";
import { KitBanner, KitObjective, type KitBannerProps } from "@jgengine/core/ui/kit/kitFlow.view";
import type { KitTone } from "@jgengine/core/ui/kit/uiKit.view";
import { KitMeter, KitPanel } from "@jgengine/core/ui/kit/uiKitRoot.view";
import { SpriteIcon } from "@jgengine/core/ui/icons/spriteIcon.view";

/**
 * The play-HUD readouts every game repeats, drawn from the active UI kit's parts: resource counts,
 * a vitals card with the current objective under it, the wave clock and a hint strip. Each is plain
 * layout over `KitPanel`/`KitMeter`, so the kit (and a game's `customizeKit` tokens) decides the look
 * and a game never re-lays these out by hand. The build/action bar is `ActionBar` with `look="kit"`
 * (`./actionHud.view`).
 */

/** Props for {@link KitCount}. */
export interface KitCountProps {
  value: number | string;
  label: string;
  /** Marks the readout for tests and drives as `data-count`. Default the label. */
  id?: string;
  /** A small line under the count (a rate, a cap). */
  detail?: ReactNode;
  /** Draws the detail in the warning colour (a falling rate). */
  detailBad?: boolean;
}

/**
 * A number and its word, side by side: the HUD's resource readout.
 *
 * @capability kit-count a HUD resource readout — a number and its word, with an optional rate line
 */
export function KitCount({ value, label, id, detail, detailBad = false }: KitCountProps): ReactNode {
  const count = (
    <span data-count={id ?? label} style={{ display: "inline-flex", gap: 5, alignItems: "baseline", whiteSpace: "nowrap" }}>
      <span style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      <span style={{ opacity: 0.72, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 10.5 }}>{label}</span>
    </span>
  );
  if (detail === undefined) return count;
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start" }}>
      {count}
      <span style={{ fontSize: 10, opacity: 0.7, color: detailBad ? "#ff8a7a" : undefined }}>{detail}</span>
    </span>
  );
}

/** A row of {@link KitCount}s with even gaps. @capability kit-counts a row of HUD resource counts */
export function KitCounts({ children }: { children?: ReactNode }): ReactNode {
  return <div style={{ display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap" }}>{children}</div>;
}

/** One meter on a {@link KitVitals} card. */
export interface KitVital {
  label: ReactNode;
  value: number;
  max: number;
  /** Default `good`. */
  tone?: KitTone;
  /** Below this fraction of `max` the meter turns `lowTone`. Unset never turns. */
  lowAt?: number;
  /** Default `bad`. */
  lowTone?: KitTone;
}

/** The current objective under a {@link KitVitals} card: who asks, what, and the one step. */
export interface KitVitalsObjective {
  /** Stable id of the beat; a new id restarts the objective's idle hint. */
  id?: string | undefined;
  /** Who gives it, drawn as the objective's label ("Mara", "The reeve asks"). */
  label: ReactNode;
  title: ReactNode;
  /** The one step to do now; unset draws the title alone. */
  goal?: ReactNode | undefined;
}

/** Props for {@link KitVitals}. */
export interface KitVitalsProps {
  eyebrow?: ReactNode;
  title?: ReactNode;
  /** Meters under any other content. */
  vitals?: readonly KitVital[];
  /** Drawn above the meters (counts, a clock). */
  children?: ReactNode;
  /** The objective card under the vitals; `null` or unset draws none. */
  objective?: KitVitalsObjective | null;
  /** Default {@link HUD_CORNER_WIDTH}. */
  width?: number;
}

/**
 * The corner card of a play HUD: the game's name, the player's (and what they protect's) meters,
 * and the labeled objective under it. Passes pointer events through to the world.
 *
 * @capability kit-vitals a HUD vitals card — meters that turn bad when low, extra readouts, the labeled current objective under it
 */
export function KitVitals({ eyebrow, title, vitals = [], children, objective, width = HUD_CORNER_WIDTH }: KitVitalsProps): ReactNode {
  return (
    <div data-kit-vitals="" style={{ width, pointerEvents: "none" }}>
      <KitPanel variant="hud" eyebrow={eyebrow} title={title}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {children}
          {vitals.map((vital, index) => {
            const low = vital.lowAt !== undefined && vital.value < vital.max * vital.lowAt;
            return (
              <KitMeter key={index} size="sm" label={vital.label} value={vital.value} max={vital.max} tone={low ? (vital.lowTone ?? "bad") : (vital.tone ?? "good")} readout />
            );
          })}
        </div>
      </KitPanel>
      {objective === null || objective === undefined ? null : (
        <div style={{ marginTop: 8 }}>
          <KitObjective eyebrow={objective.label} title={objective.title} steps={objective.goal === undefined ? [] : [{ id: objective.id ?? "goal", label: objective.goal }]} progressKey={objective.id} />
        </div>
      )}
    </div>
  );
}

/** Props for {@link KitWaveClock}. */
export interface KitWaveClockProps {
  /** The headline: "Night 3 in 42s", "Wave 2 - 6 left". */
  text: ReactNode;
  /** The quieter note beside it: "N - call it early". */
  detail?: ReactNode;
  /** A wave is on: the strip turns `bad`. */
  alarm?: boolean;
  /** The big banner shown when the wave starts. */
  banner?: KitBannerProps;
}

/**
 * The wave clock across the top of a defense HUD: how long until the next wave or how many are
 * left, a note on what to do, and the banner when a wave arrives.
 *
 * @capability kit-wave-clock a HUD wave clock — countdown or enemies left, a note, and the wave banner
 */
export function KitWaveClock({ text, detail, alarm = false, banner }: KitWaveClockProps): ReactNode {
  return (
    <div style={{ pointerEvents: "none" }}>
      <KitPanel variant="strip" tone={alarm ? "bad" : "neutral"}>
        <span data-wave-clock="" style={{ fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", fontSize: 13 }}>
          {text}
        </span>
        {detail === undefined ? null : <span style={{ marginInlineStart: 10, opacity: 0.7, fontSize: 11 }}>{detail}</span>}
      </KitPanel>
      {banner === undefined ? null : <KitBanner {...banner} />}
    </div>
  );
}

/** Props for {@link KitHint}. */
export interface KitHintProps {
  /** What the player is doing now ("Placing a Farm - click the ground"); `null` draws no strip. */
  text: ReactNode | null;
  /** Default `accent`. */
  tone?: KitTone;
  /** A banner shown when its cue changes (a new tier, a raid). */
  banner?: KitBannerProps;
}

/**
 * The one-line hint across the top of a HUD — what the held tool does, why work stopped — plus the
 * phase banner that shares its slot.
 *
 * @capability kit-hint a HUD hint strip for the current tool or problem, with the phase banner
 */
export function KitHint({ text, tone = "accent", banner }: KitHintProps): ReactNode {
  return (
    <div style={{ pointerEvents: "none" }}>
      {text === null ? null : (
        <KitPanel variant="strip" tone={tone}>
          <span style={{ fontWeight: 700, letterSpacing: "0.06em", fontSize: 13 }}>{text}</span>
        </KitPanel>
      )}
      {banner === undefined ? null : <KitBanner {...banner} />}
    </div>
  );
}

/** One pool on a {@link KitVitalIcons} strip. */
export interface KitVitalIcon {
  /** Marks the pool for tests and drives as `data-vital`. */
  id: string;
  /** Spoken name and the readout's label ("Health"). */
  label: string;
  /** A served one-colour glyph (`libraryIconUrl("gameicons:lorc/heart-plus")`), drawn like {@link SpriteIcon}. */
  icon: string;
  value: number;
  max: number;
  /** Default `accent`. */
  tone?: KitTone;
  /** A colour of its own instead of the tone's. */
  color?: string;
  /** Below this fraction of `max` the glyph turns `lowTone`. Unset never turns. */
  lowAt?: number;
  /** Default `bad`. */
  lowTone?: KitTone;
  /** Turns the glyph `lowTone` whatever the value (hungry, encumbered). */
  warn?: boolean;
  /** What the readout prints under the label instead of `value / max` ("24°C"). */
  text?: string;
}

/** Props for {@link KitVitalIcons}. */
export interface KitVitalIconsProps {
  vitals: readonly KitVitalIcon[];
  /** Glyph edge in px. Default 32. */
  size?: number;
  /** Prints each pool's label and `value / max` beside each glyph in a column (on its left, toward the screen), under it in a row. Default `false`. */
  readout?: boolean;
  /** Default `column`. */
  direction?: "column" | "row";
}

const TONE_COLOR: Record<KitTone, string> = {
  neutral: "var(--kit-ink, #e8e4da)",
  accent: "var(--kit-accent, #5fd0e0)",
  good: "var(--kit-good, #6fcf6a)",
  warn: "var(--kit-warn, #e7c84a)",
  bad: "var(--kit-bad, #e0503f)",
};

/**
 * Survival pools as a strip of glyphs that fill from the bottom as the pool fills: a heart, a bolt,
 * a drumstick, a drop. Quieter than a card of bars; `readout` adds the numbers beside each glyph for
 * a detailed mode. Each glyph is a `role="meter"` with its value for assistive tech and tests.
 *
 * @capability kit-vital-icons survival pools as a column of glyphs that fill from the bottom, numbers on demand
 */
export function KitVitalIcons({ vitals, size = 32, readout = false, direction = "column" }: KitVitalIconsProps): ReactNode {
  return (
    <div data-kit-vital-icons="" style={{ display: "flex", flexDirection: direction, alignItems: direction === "column" ? "flex-end" : "flex-start", gap: 4, pointerEvents: "none" }}>
      {vitals.map((vital) => {
        const fill = vital.max > 0 ? Math.max(0, Math.min(1, vital.value / vital.max)) : 0;
        const low = vital.warn === true || (vital.lowAt !== undefined && vital.value < vital.max * vital.lowAt);
        const color = low ? TONE_COLOR[vital.lowTone ?? "bad"] : (vital.color ?? TONE_COLOR[vital.tone ?? "accent"]);
        const glyph: CSSProperties = { position: "absolute", inset: 0, width: size, height: size, filter: "drop-shadow(0 1px 1px #000a)" };
        return (
          <div
            key={vital.id}
            data-vital={vital.id}
            data-low={low ? "" : undefined}
            role="meter"
            aria-label={vital.label}
            aria-valuemin={0}
            aria-valuemax={vital.max}
            aria-valuenow={Math.floor(vital.value)}
            style={{ display: "flex", flexDirection: direction === "column" ? "row-reverse" : "column", alignItems: "center", gap: direction === "column" ? 6 : 1 }}
          >
            <span style={{ position: "relative", width: size, height: size }}>
              <SpriteIcon src={vital.icon} size={size} color={color} style={{ ...glyph, opacity: 0.28 }} />
              <SpriteIcon src={vital.icon} size={size} color={color} style={{ ...glyph, clipPath: `inset(${(1 - fill) * 100}% 0 0 0)` }} />
            </span>
            {readout ? (
              <span style={{ fontSize: 10, lineHeight: 1.15, textAlign: direction === "column" ? "end" : "center", whiteSpace: "nowrap", color: "var(--kit-ink, #e8e4da)", textShadow: "0 1px 2px #000", fontVariantNumeric: "tabular-nums" }}>
                {vital.label}
                <br />
                {vital.text ?? `${Math.floor(vital.value)} / ${Math.round(vital.max)}`}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
