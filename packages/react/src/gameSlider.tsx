import { useCallback, useInsertionEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

/** Props for {@link GameSlider}. */
export interface GameSliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** Called on every move (drag, key, wheel). */
  onChange: (value: number) => void;
  /** Called once a drag or key press ends, to persist the value. */
  onCommit?: () => void;
  /** Accessible name. */
  label: string;
  /** Spoken value, e.g. `"80%"`. */
  valueText?: string;
  /**
   * Look. `groove` is a cut channel with a lit fill and a knurled knob. `pips` is a row of lit
   * segments, like a volume or power meter. Default `groove`.
   */
  variant?: "groove" | "pips";
  /** Segment count for `pips`. Default 10. */
  pips?: number;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

const SLIDER_CSS = `@layer components.jgengine {
[data-jg-slider] { position: relative; flex: 0 1 160px; min-width: 64px; height: 24px; touch-action: none; cursor: pointer; outline: none; -webkit-tap-highlight-color: transparent; }
[data-jg-slider][aria-disabled="true"] { cursor: not-allowed; opacity: var(--jg-disabled-opacity, 0.45); }
[data-jg-slider] > [data-part="groove"] { position: absolute; left: 0; right: 0; top: 50%; height: 8px; translate: 0 -50%; background: color-mix(in srgb, var(--jg-text, #fff) 14%, rgba(0,0,0,0.55)); box-shadow: inset 0 2px 3px rgba(0,0,0,0.6), 0 1px 0 color-mix(in srgb, var(--jg-text, #fff) 18%, transparent); clip-path: polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%); }
[data-jg-slider] > [data-part="groove"] > [data-part="fill"] { position: absolute; inset: 0 auto 0 0; background: linear-gradient(180deg, color-mix(in srgb, var(--jg-accent, #ffd23f) 70%, #fff), var(--jg-accent, #ffd23f) 45%, color-mix(in srgb, var(--jg-accent, #ffd23f) 70%, #000)); box-shadow: 0 0 10px var(--jg-accent-glow, transparent); }
[data-jg-slider] > [data-part="knob"] { position: absolute; top: 50%; width: 14px; height: 22px; translate: -50% -50%; background: repeating-linear-gradient(90deg, rgba(0,0,0,0.28) 0 1px, transparent 1px 3px), linear-gradient(180deg, color-mix(in srgb, var(--jg-text, #fff) 92%, #fff), color-mix(in srgb, var(--jg-text, #fff) 55%, #000)); clip-path: polygon(50% 0, 100% 22%, 100% 100%, 0 100%, 0 22%); box-shadow: inset 0 -3px 0 rgba(0,0,0,0.35); transition: scale calc(120ms * var(--jg-motion-scale, 1)) ease; }
[data-jg-slider]:focus-visible > [data-part="knob"], [data-jg-slider]:active > [data-part="knob"] { scale: 1.18; }
[data-jg-slider]:focus-visible > [data-part="groove"] { box-shadow: inset 0 2px 3px rgba(0,0,0,0.6), 0 0 0 2px var(--jg-accent, #ffd23f); }
[data-jg-slider][data-variant="pips"] > [data-part="pips"] { position: absolute; inset: 4px 0; display: flex; gap: 3px; }
[data-jg-slider][data-variant="pips"] > [data-part="pips"] > i { flex: 1 1 0; background: color-mix(in srgb, var(--jg-text, #fff) 16%, rgba(0,0,0,0.5)); box-shadow: inset 0 1px 2px rgba(0,0,0,0.55); transform: skewX(-14deg); transition: background-color calc(100ms * var(--jg-motion-scale, 1)) ease; }
[data-jg-slider][data-variant="pips"] > [data-part="pips"] > i[data-lit] { background: var(--jg-accent, #ffd23f); box-shadow: 0 0 8px var(--jg-accent-glow, transparent); }
[data-jg-slider][data-variant="pips"]:focus-visible > [data-part="pips"] { outline: 2px solid var(--jg-accent, #ffd23f); outline-offset: 3px; }
}`;

const SLIDER_STYLE_ID = "jg-game-slider-styles";

function ensureSliderStyles(): void {
  if (typeof document === "undefined" || document.getElementById(SLIDER_STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = SLIDER_STYLE_ID;
  style.textContent = SLIDER_CSS;
  document.head.appendChild(style);
}

/** Snaps `raw` to `step` from `min` and clamps it to the range, without float noise. */
export function snapSliderValue(raw: number, min: number, max: number, step: number): number {
  const stepped = step > 0 ? min + Math.round((raw - min) / step) * step : raw;
  return Math.round(Math.min(max, Math.max(min, stepped)) * 1e6) / 1e6;
}

/**
 * A slider drawn as part of the game (a cut groove with a knurled knob, or lit pips), never the
 * browser's range input. Full keyboard (arrows, Page Up/Down, Home/End), pointer drag and screen
 * reader support through `role="slider"`.
 *
 * @capability game-slider drawn game slider (groove or pips) with keyboard, drag and screen reader support, no browser range input
 */
export function GameSlider({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  onCommit,
  label,
  valueText,
  variant = "groove",
  pips = 10,
  disabled = false,
  className,
  style,
}: GameSliderProps): ReactNode {
  useInsertionEffect(ensureSliderStyles, []);
  const track = useRef<HTMLDivElement | null>(null);
  const span = max - min;
  const fraction = span <= 0 ? 0 : Math.min(1, Math.max(0, (value - min) / span));

  const fromPointer = useCallback(
    (clientX: number) => {
      const rect = track.current?.getBoundingClientRect();
      if (rect === undefined || rect.width === 0) return;
      const next = snapSliderValue(min + ((clientX - rect.left) / rect.width) * span, min, max, step);
      if (next !== value) onChange(next);
    },
    [max, min, onChange, span, step, value],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const big = Math.max(step, span / 10);
    // Inside a menu, Up/Down keep moving between rows; only Left/Right (and Page/Home/End) adjust.
    const inMenu = event.currentTarget.closest("[data-jg-menu-nav]") !== null;
    const delta: Record<string, number> = inMenu
      ? { ArrowRight: step, ArrowLeft: -step, PageUp: big, PageDown: -big }
      : { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: big, PageDown: -big };
    let next: number | null = null;
    if (event.key in delta) next = value + delta[event.key]!;
    else if (event.key === "Home") next = min;
    else if (event.key === "End") next = max;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    onChange(snapSliderValue(next, min, max, step));
  };

  return (
    <div
      ref={track}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      aria-disabled={disabled || undefined}
      data-jg-slider=""
      data-variant={variant}
      className={className}
      style={style}
      onKeyDown={onKeyDown}
      onKeyUp={() => onCommit?.()}
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
        if (disabled) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        event.currentTarget.focus();
        fromPointer(event.clientX);
      }}
      onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
        if (disabled || !event.currentTarget.hasPointerCapture?.(event.pointerId)) return;
        fromPointer(event.clientX);
      }}
      onPointerUp={(event: PointerEvent<HTMLDivElement>) => {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        onCommit?.();
      }}
      onBlur={() => onCommit?.()}
    >
      {variant === "pips" ? (
        <span data-part="pips">
          {Array.from({ length: Math.max(2, pips) }, (_, index) => (
            <i key={index} data-lit={(index + 0.5) / Math.max(2, pips) <= fraction ? "" : undefined} />
          ))}
        </span>
      ) : (
        <>
          <span data-part="groove">
            <span data-part="fill" style={{ width: `${fraction * 100}%` }} />
          </span>
          <span data-part="knob" style={{ left: `${fraction * 100}%` }} />
        </>
      )}
    </div>
  );
}
