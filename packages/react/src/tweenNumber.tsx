import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { useReducedMotion } from "./accessibility";
import { useEngineStyles } from "./engineStyles";

/** Ease-out cubic, the default counter curve. */
export function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - (1 - clamped) ** 3;
}

/** Value at progress `t` (0–1) between `from` and `to` under `ease`. */
export function tweenAt(from: number, to: number, t: number, ease: (t: number) => number = easeOutCubic): number {
  return from + (to - from) * ease(t);
}

/** Options for {@link useTweenedValue}. */
export interface TweenOptions {
  /** Tween length in ms. Default 450. */
  durationMs?: number;
  ease?: (t: number) => number;
}

/**
 * Animates toward `target` whenever it changes, starting from the currently displayed value, so a
 * counter rolls instead of jumping. Snaps immediately under reduced motion or a non-finite target.
 *
 * @capability tweened-value animate a displayed number toward its target, honouring reduced motion
 */
export function useTweenedValue(target: number, options: TweenOptions = {}): number {
  const { durationMs = 450, ease = easeOutCubic } = options;
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  useEffect(() => {
    const from = shownRef.current;
    const instant = reduced || durationMs <= 0 || !Number.isFinite(target) || !Number.isFinite(from) || typeof requestAnimationFrame !== "function";
    if (instant || from === target) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / durationMs);
      const value = t >= 1 ? target : tweenAt(from, target, t, ease);
      shownRef.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, ease, reduced]);
  return shown;
}

/** Direction of the last change, for the delta flash. */
export type TweenDelta = "up" | "down";

/** Props for {@link TweenNumber}. */
export interface TweenNumberProps extends TweenOptions {
  value: number;
  /** Formats the displayed (in-between) value. Default rounds to an integer with locale grouping. */
  format?: (value: number) => ReactNode;
  /** Flash the success/danger color when the value rises/falls. Default `true`. */
  flash?: boolean;
  className?: string;
  style?: CSSProperties;
}

const defaultFormat = (value: number): ReactNode => Math.round(value).toLocaleString();

/**
 * A counter that rolls to each new value and flashes the `--jg-success` / `--jg-danger` color with a
 * small scale pop on the change (`data-jg-delta="up" | "down"`). Tabular digits keep its width stable.
 *
 * @capability tween-number rolling number readout with an up/down delta flash
 */
export function TweenNumber({ value, format = defaultFormat, flash = true, durationMs, ease, className, style }: TweenNumberProps): ReactNode {
  useEngineStyles();
  const shown = useTweenedValue(value, { durationMs, ease });
  const previous = useRef(value);
  const [delta, setDelta] = useState<{ dir: TweenDelta; seq: number } | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = value;
    if (!flash || value === before) return;
    setDelta((current) => ({ dir: value > before ? "up" : "down", seq: (current?.seq ?? 0) + 1 }));
  }, [value, flash]);
  return (
    <span className={className} data-jg-tween="" style={{ fontVariantNumeric: "tabular-nums", ...style }}>
      <span key={delta?.seq ?? 0} data-jg-delta={delta?.dir}>
        {format(shown)}
      </span>
    </span>
  );
}
