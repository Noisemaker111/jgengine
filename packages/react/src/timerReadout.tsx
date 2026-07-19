import { useEffect, useReducer, useRef, type CSSProperties, type ReactNode } from "react";

import type { TimerRead, TimerSet } from "@jgengine/core/time/timerSet";

/**
 * Which value a readout leads with. `"auto"` follows the timer's direction —
 * remaining for a countdown, elapsed for a countup charge.
 */
export type TimerReadoutSource = "auto" | "remaining" | "elapsed";

/** Digital text format for a timer readout. */
export type TimerFormat = "mm:ss" | "m:ss.d" | "ss.d";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Format a millisecond duration as digital timer text — `mm:ss` (default),
 * `m:ss.d` (with tenths), or `ss.d` (seconds + tenths). Negative inputs clamp
 * to zero. No genre meaning: the same helper serves a round clock, a respawn
 * countdown, or an ability charge readout.
 *
 * @capability timer-readout-format format milliseconds as digital timer text (mm:ss / m:ss.d / ss.d)
 */
export function formatTimerMs(ms: number, format: TimerFormat = "mm:ss"): string {
  const clamped = ms > 0 ? ms : 0;
  const totalSeconds = clamped / 1000;
  if (format === "ss.d") {
    return `${Math.floor(totalSeconds)}.${Math.floor((clamped % 1000) / 100)}`;
  }
  const whole = Math.floor(totalSeconds);
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  if (format === "m:ss.d") {
    const tenths = Math.floor((clamped % 1000) / 100);
    return `${minutes}:${pad2(seconds)}.${tenths}`;
  }
  return `${pad2(minutes)}:${pad2(seconds)}`;
}

function pickValue(read: TimerRead, source: TimerReadoutSource): number {
  if (source === "remaining") return read.remainingMs;
  if (source === "elapsed") return read.elapsedMs;
  return read.direction === "up" ? read.elapsedMs : read.remainingMs;
}

const BLANK: TimerRead = {
  id: "",
  direction: "down",
  remainingMs: 0,
  elapsedMs: 0,
  durationMs: 0,
  progress01: 0,
  running: false,
  expired: false,
};

/**
 * Subscribe to a single timer and re-read it every animation frame while
 * mounted, so a HUD readout stays live without the game hand-rolling interval
 * math. Reuses one read object (allocation-aware). Returns `null` for an unknown
 * id. Pass `active={false}` to freeze the per-frame tick (e.g. an off-screen HUD).
 *
 * @capability use-timer React hook binding one timer to a component with a per-frame re-read
 */
export function useTimerRead(timer: TimerSet, id: string, active = true): TimerRead | null {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const out = useRef<TimerRead>({ ...BLANK });
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const loop = (): void => {
      bump();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return timer.read(id, out.current);
}

/** Props for {@link TimerReadout}. */
export interface TimerReadoutProps {
  /** The timer set to read from. */
  timer: TimerSet;
  /** Id of the timer to display (free string). */
  id: string;
  /** Which value to show. Default `"auto"` (remaining for countdown, elapsed for countup). */
  source?: TimerReadoutSource;
  /** Digital format. Default `"mm:ss"`. */
  format?: TimerFormat;
  /** Text shown when the timer id is unknown. Default `"--:--"`. */
  placeholder?: string;
  /** Freeze the per-frame tick when false. Default `true`. */
  active?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * A live digital timer readout (mm:ss / m:ss.d) driven off a {@link TimerSet}.
 * It re-reads every frame and formats remaining or elapsed time — a round clock,
 * a respawn countdown, or an ability charge, all the same widget. HudTheme-skinned
 * via `--jg-bar-text`; reskin with `style` or the theme tokens.
 *
 * @capability timer-readout live digital mm:ss/m:ss.d timer readout bound to a TimerSet
 */
export function TimerReadout({
  timer,
  id,
  source = "auto",
  format = "mm:ss",
  placeholder = "--:--",
  active = true,
  className,
  style,
}: TimerReadoutProps): ReactNode {
  const read = useTimerRead(timer, id, active);
  const text = read === null ? placeholder : formatTimerMs(pickValue(read, source), format);
  return (
    <span
      className={className}
      style={{
        fontVariantNumeric: "tabular-nums",
        fontWeight: 700,
        color: "var(--jg-bar-text, #e2e8f0)",
        ...style,
      }}
    >
      {text}
    </span>
  );
}

/** Props for {@link TimerRing}. */
export interface TimerRingProps {
  /** The timer set to read from. */
  timer: TimerSet;
  /** Id of the timer to display (free string). */
  id: string;
  /** Outer diameter in px. Default `72`. */
  size?: number;
  /** Ring stroke thickness in px. Default `8`. */
  thickness?: number;
  /**
   * How the arc maps to time. `"fill"` (default) sweeps from empty to full as
   * time passes (a charge/cooldown filling); `"drain"` starts full and empties
   * (a countdown running out).
   */
  mode?: "fill" | "drain";
  /** Ring color. Default the HudTheme accent token. */
  color?: string;
  /** Track (unfilled) color. Default the HudTheme bar-track token. */
  trackColor?: string;
  /** Optional center content (e.g. a {@link TimerReadout} or an icon). */
  children?: ReactNode;
  /** Freeze the per-frame tick when false. Default `true`. */
  active?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * A radial charge/cooldown ring driven off a {@link TimerSet}'s `progress01`.
 * Re-reads every frame and sweeps an SVG arc as the timer advances — ability
 * charge, cooldown wipe, respawn ring, capture progress, all the same widget.
 * `mode` chooses filling vs. draining; center `children` can hold a readout.
 * HudTheme-skinned via `--jg-accent` / `--jg-bar-track`.
 *
 * @capability timer-ring radial SVG charge/cooldown ring bound to a TimerSet's progress
 */
export function TimerRing({
  timer,
  id,
  size = 72,
  thickness = 8,
  mode = "fill",
  color = "var(--jg-accent, #38bdf8)",
  trackColor = "var(--jg-bar-track, rgba(148,163,184,0.25))",
  children,
  active = true,
  className,
  style,
}: TimerRingProps): ReactNode {
  const read = useTimerRead(timer, id, active);
  const fill = read === null ? 0 : mode === "drain" ? 1 - read.progress01 : read.progress01;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - Math.max(0, Math.min(1, fill)));
  return (
    <div
      className={className}
      style={{ position: "relative", width: size, height: size, display: "inline-flex", ...style }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={thickness} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      {children !== undefined && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: Math.max(11, size * 0.2),
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
