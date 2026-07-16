/** Options for {@link formatDuration}. */
export interface DurationFormat {
  /** Fractional-second digits to show (0, 1, or 2). Defaults to 0. */
  decimals?: 0 | 1 | 2;
  /** Force an `h:mm:ss` layout even under an hour. Defaults to auto (hours shown only when present). */
  hours?: boolean;
}

/** Left-pad a non-negative integer to `width` digits with leading zeros. */
export function padNumber(value: number, width: number): string {
  return Math.trunc(value).toString().padStart(width, "0");
}

/**
 * Format a duration in seconds as a clock string (`m:ss`, `m:ss.ff`, or `h:mm:ss`), the shape every timer and racing HUD needs.
 *
 * @capability clock-format render seconds as m:ss / m:ss.ff / h:mm:ss for timers and race HUDs
 */
export function formatDuration(seconds: number, options: DurationFormat = {}): string {
  const decimals = options.decimals ?? 0;
  const total = Math.max(0, seconds);
  const whole = Math.floor(total);
  const frac = decimals > 0 ? (total - whole).toFixed(decimals).slice(1) : "";
  const showHours = options.hours ?? total >= 3600;
  if (showHours) {
    const h = Math.floor(whole / 3600);
    const m = Math.floor((whole % 3600) / 60);
    const s = whole % 60;
    return `${h}:${padNumber(m, 2)}:${padNumber(s, 2)}${frac}`;
  }
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${padNumber(s, 2)}${frac}`;
}

/**
 * Format a duration as a short humanized string — the two most-significant non-zero units, e.g.
 * `2h 15m`, `45m`, `1m 30s`, `30s`. Unlike {@link formatDuration}'s clock layout, this reads like a
 * countdown label (auction expiry, cooldown-until, "ready in") rather than a stopwatch. Negative input
 * clamps to `0s`; the value is floored to whole seconds.
 *
 * @capability duration-compact humanize a duration as short "2h 15m" / "45m" / "30s" countdown text
 */
export function formatDurationCompact(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

/**
 * Format a signed time gap as `+m:ss.ff` / `-m:ss.ff`, for race deltas and split times.
 *
 * @capability clock-format format a signed time gap like a race split (+/- m:ss.ff)
 */
export function formatDelta(seconds: number, decimals: 0 | 1 | 2 = 2): string {
  const sign = seconds < 0 ? "-" : "+";
  return `${sign}${formatDuration(Math.abs(seconds), { decimals })}`;
}

/**
 * English ordinal for a placement number: 1 → "1st", 2 → "2nd", 3 → "3rd", 11 → "11th".
 *
 * @capability ordinal-format format a placement number as 1st/2nd/3rd for HUD ranks
 */
export function formatOrdinal(value: number): string {
  const n = Math.trunc(value);
  const abs = Math.abs(n) % 100;
  const suffix = abs >= 11 && abs <= 13 ? "th" : ["th", "st", "nd", "rd"][Math.abs(n) % 10] ?? "th";
  return `${n}${suffix}`;
}
