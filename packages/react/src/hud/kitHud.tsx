import type { ReactNode } from "react";

import { HUD_CORNER_WIDTH } from "./hudLayout";
import { KitBanner, KitObjective, type KitBannerProps } from "../kitFlow";
import type { KitTone } from "../uiKit";
import { KitMeter, KitPanel } from "../uiKitRoot";

/**
 * The play-HUD readouts every game repeats, drawn from the active UI kit's parts: resource counts,
 * a vitals card with the current objective under it, the wave clock and a hint strip. Each is plain
 * layout over `KitPanel`/`KitMeter`, so the kit (and a game's `customizeKit` tokens) decides the look
 * and a game never re-lays these out by hand. The build/action bar is `ActionBar` with `look="kit"`
 * (`./actionHud`).
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
  id?: string;
  /** Who gives it, drawn as the objective's label ("Mara", "The reeve asks"). */
  label: ReactNode;
  title: ReactNode;
  /** The one step to do now; unset draws the title alone. */
  goal?: ReactNode;
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
        {detail === undefined ? null : <span style={{ marginLeft: 10, opacity: 0.7, fontSize: 11 }}>{detail}</span>}
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
