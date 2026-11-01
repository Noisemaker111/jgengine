// @skill jgengine-ui
import type { Locale } from "./i18n";

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();
const listFormats = new Map<string, Intl.ListFormat>();
const relativeFormats = new Map<string, Intl.RelativeTimeFormat>();

function cached<T>(store: Map<string, T>, locale: Locale, options: object | undefined, make: () => T): T {
  const key = `${locale}|${options === undefined ? "" : JSON.stringify(options)}`;
  const hit = store.get(key);
  if (hit !== undefined) return hit;
  const made = make();
  store.set(key, made);
  return made;
}

/** Number grouping, decimals and digits for `locale`. */
export function formatNumber(locale: Locale, value: number, options?: Intl.NumberFormatOptions): string {
  return cached(numberFormats, locale, options, () => new Intl.NumberFormat(locale, options)).format(value);
}

/** An amount of money in an ISO 4217 `currency` (`"USD"`, `"JPY"`), with that currency's own decimals. */
export function formatCurrency(locale: Locale, value: number, currency: string, options?: Intl.NumberFormatOptions): string {
  return formatNumber(locale, value, { ...options, style: "currency", currency });
}

/** A fraction as a percentage: `0.256` is `25.6%` with `maximumFractionDigits: 1`. */
export function formatPercent(locale: Locale, fraction: number, options?: Intl.NumberFormatOptions): string {
  return formatNumber(locale, fraction, { ...options, style: "percent" });
}

/** A short large number: `12500` is `12.5K` in English, `1.25万` in Japanese. */
export function formatCompact(locale: Locale, value: number, options?: Intl.NumberFormatOptions): string {
  return formatNumber(locale, value, { ...options, notation: "compact", maximumFractionDigits: options?.maximumFractionDigits ?? 1 });
}

/** A number with a unit (`"kilometer-per-hour"`, `"celsius"`). */
export function formatUnit(locale: Locale, value: number, unit: string, options?: Intl.NumberFormatOptions): string {
  return formatNumber(locale, value, { unitDisplay: "short", ...options, style: "unit", unit });
}

/** An absolute date and time. */
export function formatDate(locale: Locale, value: number | Date, options?: Intl.DateTimeFormatOptions): string {
  return cached(dateFormats, locale, options, () => new Intl.DateTimeFormat(locale, options)).format(value);
}

/** The units a duration is written in, largest first. */
const DURATION_UNITS = [
  { unit: "day", seconds: 86400 },
  { unit: "hour", seconds: 3600 },
  { unit: "minute", seconds: 60 },
  { unit: "second", seconds: 1 },
] as const;

/** Bounds and style of {@link formatDuration}. */
export interface DurationFormatOptions {
  /** Smallest unit shown. Default `second`. */
  smallest?: (typeof DURATION_UNITS)[number]["unit"];
  /** Largest unit shown; time above it rolls into it. Default `day`. */
  largest?: (typeof DURATION_UNITS)[number]["unit"];
  unitDisplay?: "long" | "short" | "narrow";
}

/**
 * A span in seconds as words in the locale: `3725` is `1h 2m 5s` in English. Zero parts are
 * dropped; zero seconds is `0s`.
 *
 * @capability format-duration a span of seconds as locale words (1h 2m 5s)
 */
export function formatDuration(locale: Locale, totalSeconds: number, options: DurationFormatOptions = {}): string {
  const { smallest = "second", largest = "day", unitDisplay = "narrow" } = options;
  const first = DURATION_UNITS.findIndex((entry) => entry.unit === largest);
  const last = DURATION_UNITS.findIndex((entry) => entry.unit === smallest);
  const ordered = DURATION_UNITS.slice(Math.max(0, first), Math.max(first, last) + 1);
  let rest = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const parts: string[] = [];
  for (const { unit, seconds } of ordered) {
    const amount = Math.floor(rest / seconds);
    rest -= amount * seconds;
    if (amount > 0) parts.push(formatNumber(locale, amount, { style: "unit", unit, unitDisplay }));
  }
  if (parts.length === 0) {
    const unit = ordered[ordered.length - 1]?.unit ?? "second";
    parts.push(formatNumber(locale, 0, { style: "unit", unit, unitDisplay }));
  }
  return cached(listFormats, locale, { unitDisplay }, () => new Intl.ListFormat(locale, { type: "unit", style: unitDisplay })).format(parts);
}

/** "in 3 days", "2 hours ago": `value` is negative for the past. */
export function formatRelative(locale: Locale, value: number, unit: Intl.RelativeTimeFormatUnit, options?: Intl.RelativeTimeFormatOptions): string {
  return cached(relativeFormats, locale, options, () => new Intl.RelativeTimeFormat(locale, { numeric: "auto", ...options })).format(value, unit);
}

const RELATIVE_STEPS: readonly { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { unit: "year", seconds: 31536000 },
  { unit: "month", seconds: 2592000 },
  { unit: "day", seconds: 86400 },
  { unit: "hour", seconds: 3600 },
  { unit: "minute", seconds: 60 },
  { unit: "second", seconds: 1 },
];

/** The relative time from `now` to `then` (both epoch milliseconds) in the largest unit that fits. */
export function formatRelativeTo(locale: Locale, thenMs: number, nowMs: number, options?: Intl.RelativeTimeFormatOptions): string {
  const delta = (thenMs - nowMs) / 1000;
  const magnitude = Math.abs(delta);
  const step = RELATIVE_STEPS.find((entry) => magnitude >= entry.seconds) ?? RELATIVE_STEPS[RELATIVE_STEPS.length - 1];
  const unit = step?.unit ?? "second";
  const size = step?.seconds ?? 1;
  return formatRelative(locale, Math.trunc(delta / size), unit, options);
}
