import { useEffect, useReducer, useRef, type CSSProperties, type ReactNode } from "react";

import type { DamageDirectionTracker, DamageIndicator } from "@jgengine/core/vfx/damageDirection";

/**
 * Subscribe to a damage-direction tracker and animate. Because indicators fade
 * continuously on a clock (not just on discrete events), this drives a
 * `requestAnimationFrame` loop while any indicator is live and stops when the
 * screen is clear, then wakes again on the next hit. Returns the tracker's
 * current `active()` array (reused between frames — copy if you retain it).
 *
 * @capability use-damage-direction React hook that animates a damage-direction tracker's fade with requestAnimationFrame and re-renders its live indicators
 */
export function useDamageDirection(tracker: DamageDirectionTracker): readonly DamageIndicator[] {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let stopped = false;
    const tick = (): void => {
      if (stopped) return;
      bump();
      rafRef.current = tracker.count() > 0 ? requestAnimationFrame(tick) : null;
    };
    // Any change (new hit, clear, restore) paints immediately and (re)starts the
    // fade loop if it had idled — so a hit shows even when rAF is throttled.
    const off = tracker.subscribe(() => {
      bump();
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(tick);
    });
    if (tracker.count() > 0) rafRef.current = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      off();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [tracker]);

  return tracker.active();
}

/** Reskin tokens for {@link DamageDirectionOverlay}. */
export interface DamageDirectionTheme {
  /** Fallback arc color when a `kind` isn't in {@link DamageDirectionOverlayProps.colors}. Default reads `--jg-health` (danger red). */
  color?: string;
  /** Radius of the arc band from screen center, in px. Default `120`. */
  radius?: number;
  /** Angular half-width of each arc, in radians. Default `0.42` (~48° wide). */
  arcSpread?: number;
  /** Arc stroke thickness in px at full intensity. Default `18`. */
  thickness?: number;
  /** Extra px an arc pushes outward as it flares (scale feel). Default `18`. */
  flare?: number;
}

/** Props for {@link DamageDirectionOverlay}. */
export interface DamageDirectionOverlayProps {
  /** The tracker to visualize. */
  tracker: DamageDirectionTracker;
  /** Per-`kind` arc colors, e.g. `{ fire: "#ff7a1a", crit: "#ffd23f" }`. Falls back to the theme color. */
  colors?: Record<string, string>;
  /** Draw a small dot at screen center so bearings read against a fixed reference. Default `true`. */
  showReticle?: boolean;
  /** Reskin tokens. */
  theme?: DamageDirectionTheme;
  className?: string;
  style?: CSSProperties;
}

const VIEWBOX = 300;
const CENTER = VIEWBOX / 2;

/** SVG path for an annular arc segment centered on the reticle at `angle` (radians, 0 = up, clockwise). */
function arcPath(angle: number, radius: number, half: number, thickness: number): string {
  const inner = Math.max(0, radius - thickness / 2);
  const outer = radius + thickness / 2;
  // Screen bearing: 0 rad points up (−Y), increasing clockwise.
  const a0 = angle - half;
  const a1 = angle + half;
  const p = (a: number, r: number): [number, number] => [
    CENTER + Math.sin(a) * r,
    CENTER - Math.cos(a) * r,
  ];
  const [ox0, oy0] = p(a0, outer);
  const [ox1, oy1] = p(a1, outer);
  const [ix1, iy1] = p(a1, inner);
  const [ix0, iy0] = p(a0, inner);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return [
    `M ${ox0.toFixed(2)} ${oy0.toFixed(2)}`,
    `A ${outer} ${outer} 0 ${large} 1 ${ox1.toFixed(2)} ${oy1.toFixed(2)}`,
    `L ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${ix0.toFixed(2)} ${iy0.toFixed(2)}`,
    "Z",
  ].join(" ");
}

/**
 * A drop-in "hit-from" overlay: transient red (by default) arcs that flare around
 * a center reticle in the direction each recent hit came from and fade out over
 * time, driven entirely by a {@link DamageDirectionTracker}. Opacity and outward
 * push scale with each indicator's eased intensity; color comes from the hit's
 * `kind` (via `colors`) or the theme's danger color. Renders full-screen,
 * `pointer-events: none`, so it never intercepts input — a game drops it into its
 * HUD and calls `tracker.registerHit(...)` on damage. Reskin via
 * {@link DamageDirectionTheme}.
 *
 * @capability damage-direction-overlay drop-in hit-from damage-direction overlay — SVG arcs flaring around a center reticle toward each recent hit and fading over time, colored per `kind`/HudTheme, pointer-events none
 */
export function DamageDirectionOverlay({
  tracker,
  colors,
  showReticle = true,
  theme,
  className,
  style,
}: DamageDirectionOverlayProps): ReactNode {
  const indicators = useDamageDirection(tracker);
  const color = theme?.color ?? "var(--jg-health, #e5484d)";
  const radius = theme?.radius ?? 120;
  const arcSpread = theme?.arcSpread ?? 0.42;
  const thickness = theme?.thickness ?? 18;
  const flare = theme?.flare ?? 18;

  return (
    <div
      className={className}
      data-damage-direction
      style={{ position: "fixed", inset: 0, zIndex: 55, pointerEvents: "none", ...style }}
    >
      <svg
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: (radius + thickness + flare) * 2,
          height: (radius + thickness + flare) * 2,
          transform: "translate(-50%, -50%)",
          overflow: "visible",
        }}
      >
        {indicators.map((indicator, i) => {
          const eased = indicator.intensity;
          if (eased <= 0) return null;
          const fill = colors?.[indicator.kind] ?? color;
          const r = radius + flare * eased;
          const th = thickness * (0.55 + 0.45 * eased);
          return (
            <path
              key={i}
              data-damage-arc={indicator.kind}
              d={arcPath(indicator.angle, r, arcSpread, th)}
              fill={fill}
              opacity={Math.min(1, 0.15 + 0.85 * eased)}
              style={{ filter: `drop-shadow(0 0 ${6 * eased}px ${fill})` }}
            />
          );
        })}
        {showReticle ? (
          <circle
            data-damage-reticle
            cx={CENTER}
            cy={CENTER}
            r={3.5}
            fill="none"
            stroke="var(--jg-ring, rgba(226,232,240,0.7))"
            strokeWidth={2}
          />
        ) : null}
      </svg>
    </div>
  );
}
