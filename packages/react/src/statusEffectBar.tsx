import { type CSSProperties, type ReactNode } from "react";

import { statusEffectRemainingFraction, type StatusEffectView } from "@jgengine/core/combat";

import { iconForItemId, isGameIconName, type GameIconName } from "./gameIcons";
import { IconTreatment, schoolForItem, type IconSchool } from "./iconTreatment";

/**
 * `StatusEffectBar` (#status-effect-hud): a drop-in timeline HUD row that renders active
 * buffs/debuffs as painted icons, each wrapped in a radial countdown ring and a stack-count badge,
 * driven straight off the engine's existing status model (`StatusInstance` → `StatusEffectView`).
 * A game passes its live effect views and gets a polished, reskinnable effect bar — no re-deriving
 * ring math or timers. `kind` is a free string the game styles: the component never interprets
 * buff-vs-debuff semantics, it only maps `kind` to an icon/color/label the game can fully override.
 * Ring, track, and frame read `HudTheme` tokens (`--jg-accent`, `--jg-slot-*`), so a theme change
 * reskins the whole row.
 */

/** How a `kind` resolves to a glyph: a `GameIcon` name, an explicit node, or `null` for the fallback. */
export type StatusIconResolver = (kind: string) => GameIconName | ReactNode | null;

/** Props for {@link StatusEffectBar}. */
export interface StatusEffectBarProps {
  /** Live effect views from the status model (`toStatusEffectViews(...)`). Rendered in order. */
  effects: readonly StatusEffectView[];
  /** Icon face size in px. Default 44. */
  size?: number;
  /** Gap between icons in px. Default 8. */
  gap?: number;
  /**
   * Resolve a `kind` to its glyph. Default: the matching `GameIcon` keyword, else an hourglass.
   * Return a `GameIconName`, any `ReactNode`, or `null` to fall through to the default.
   */
  iconFor?: StatusIconResolver;
  /** Ring color per `kind`. Default reads `--jg-accent`. Style debuffs red / buffs green here. */
  colorFor?: (kind: string) => string;
  /** School gradient behind the glyph per `kind`. Default inferred from the `kind` keyword. */
  schoolFor?: (kind: string) => IconSchool;
  /** Tooltip/`aria-label` per effect. Default: the `kind`, with a `xN` suffix when stacked. */
  labelFor?: (effect: StatusEffectView) => string;
  /** Show the remaining-seconds readout under each icon. Default true. */
  showTimer?: boolean;
  /** Ring stroke width in px. Default 3. */
  ringWidth?: number;
  className?: string;
  style?: CSSProperties;
}

const FALLBACK_ICON: GameIconName = "hourglass";

function defaultIcon(kind: string): GameIconName {
  return iconForItemId(kind) ?? FALLBACK_ICON;
}

function resolveGlyph(kind: string, iconFor: StatusIconResolver | undefined): { icon?: GameIconName; node?: ReactNode } {
  const custom = iconFor?.(kind) ?? null;
  if (custom === null) return { icon: defaultIcon(kind) };
  if (typeof custom === "string") return isGameIconName(custom) ? { icon: custom } : { icon: defaultIcon(kind) };
  return { node: custom };
}

function defaultLabel(effect: StatusEffectView): string {
  return effect.stacks > 1 ? `${effect.kind} x${effect.stacks}` : effect.kind;
}

function remainingSeconds(remainingMs: number): string {
  const seconds = remainingMs / 1000;
  if (seconds >= 10) return `${Math.ceil(seconds)}`;
  if (seconds >= 1) return seconds.toFixed(1);
  return remainingMs > 0 ? "<1" : "0";
}

/** A single effect icon: painted face + stack badge, overlaid with its radial countdown ring. */
function StatusEffectIcon({
  effect,
  size,
  ringColor,
  school,
  glyph,
  label,
  showTimer,
  ringWidth,
}: {
  effect: StatusEffectView;
  size: number;
  ringColor: string;
  school: IconSchool;
  glyph: { icon?: GameIconName; node?: ReactNode };
  label: string;
  showTimer: boolean;
  ringWidth: number;
}): ReactNode {
  const fraction = statusEffectRemainingFraction(effect);
  const radius = (size - ringWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - fraction);
  return (
    <div
      data-status-effect={effect.kind}
      data-remaining-fraction={fraction.toFixed(4)}
      title={label}
      aria-label={label}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}
    >
      <div style={{ position: "relative", width: size, height: size }}>
        <IconTreatment
          {...(glyph.node !== undefined ? { glyph: glyph.node } : glyph.icon !== undefined ? { icon: glyph.icon } : {})}
          school={school}
          size={size}
          count={effect.stacks}
        />
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)", pointerEvents: "none", overflow: "visible" }}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(0,0,0,0.55)"
            strokeWidth={ringWidth}
          />
          <circle
            data-countdown-ring=""
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth={ringWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 200ms linear" }}
          />
        </svg>
      </div>
      {showTimer ? (
        <span
          data-status-timer=""
          style={{
            fontSize: 10,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            color: "var(--jg-bar-text, #f5f7fa)",
            textShadow: "0 1px 2px rgba(0,0,0,0.9)",
            lineHeight: 1,
          }}
        >
          {remainingSeconds(effect.remainingMs)}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A horizontal timeline of active status effects — one countdown-ring icon per effect. Presentation
 * only and pure over its `effects` prop, so it renders straight off the status model's snapshot.
 * `kind` is a free string the game styles (icon / color / label); the component never interprets
 * buff-vs-debuff semantics. Ring, track, and frame read `HudTheme` tokens, so a theme change reskins
 * the whole row.
 *
 * @capability status-effect-bar timeline HUD row of active statuses — icon + radial countdown ring + stack badge, driven off the status model, HudTheme-skinned
 */
export function StatusEffectBar({
  effects,
  size = 44,
  gap = 8,
  iconFor,
  colorFor,
  schoolFor,
  labelFor,
  showTimer = true,
  ringWidth = 3,
  className,
  style,
}: StatusEffectBarProps): ReactNode {
  if (effects.length === 0) return null;
  return (
    <div
      className={className}
      data-status-effect-bar=""
      style={{ display: "flex", alignItems: "flex-start", gap, ...style }}
    >
      {effects.map((effect) => (
        <StatusEffectIcon
          key={effect.id}
          effect={effect}
          size={size}
          ringColor={colorFor?.(effect.kind) ?? "var(--jg-accent, #38bdf8)"}
          school={schoolFor?.(effect.kind) ?? schoolForItem(effect.kind)}
          glyph={resolveGlyph(effect.kind, iconFor)}
          label={labelFor?.(effect) ?? defaultLabel(effect)}
          showTimer={showTimer}
          ringWidth={ringWidth}
        />
      ))}
    </div>
  );
}
