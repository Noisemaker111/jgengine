import { describe, expect, test } from "bun:test";

import {
  formatCompact,
  formatCurrency,
  formatDate,
  formatDuration,
  formatNumber,
  formatPercent,
  formatRelative,
  formatRelativeTo,
  formatUnit,
} from "./localeFormat";

describe("locale formatting", () => {
  test("numbers group and separate by locale", () => {
    expect(formatNumber("en", 1234567.891, { maximumFractionDigits: 2 })).toBe("1,234,567.89");
    expect(formatNumber("de", 1234567.891, { maximumFractionDigits: 2 })).toBe("1.234.567,89");
    expect(formatNumber("fr", 1234.5)).toBe("1 234,5");
  });

  test("currency uses the currency's own decimals", () => {
    expect(formatCurrency("en-US", 1234.5, "USD")).toBe("$1,234.50");
    expect(formatCurrency("ja-JP", 1234, "JPY")).toMatch(/^[¥￥]1,234$/);
    expect(formatCurrency("de-DE", 1234.5, "EUR")).toBe("1.234,50 €");
  });

  test("percent and compact", () => {
    expect(formatPercent("en", 0.256, { maximumFractionDigits: 1 })).toBe("25.6%");
    expect(formatCompact("en", 12500)).toBe("12.5K");
    expect(formatCompact("ja", 12500)).toBe("1.3万");
  });

  test("units", () => {
    expect(formatUnit("en", 90, "kilometer-per-hour")).toBe("90 km/h");
  });

  test("dates follow the locale's order", () => {
    const day = Date.UTC(2026, 2, 4, 12);
    expect(formatDate("en-US", day, { dateStyle: "short", timeZone: "UTC" })).toBe("3/4/26");
    expect(formatDate("de-DE", day, { dateStyle: "short", timeZone: "UTC" })).toBe("04.03.26");
  });

  test("durations drop zero parts and bound by largest and smallest", () => {
    expect(formatDuration("en", 3725)).toBe("1h 2m 5s");
    expect(formatDuration("en", 3600)).toBe("1h");
    expect(formatDuration("en", 0)).toBe("0s");
    expect(formatDuration("en", 90061, { largest: "hour", smallest: "minute" })).toBe("25h 1m");
    expect(formatDuration("en", 125, { unitDisplay: "long" })).toBe("2 minutes, 5 seconds");
  });

  test("relative times, explicit and from timestamps", () => {
    expect(formatRelative("en", -2, "hour")).toBe("2 hours ago");
    expect(formatRelative("en", 1, "day")).toBe("tomorrow");
    expect(formatRelative("es", -3, "day")).toBe("hace 3 días");
    const now = 1_000_000_000_000;
    expect(formatRelativeTo("en", now - 5 * 60_000, now)).toBe("5 minutes ago");
    expect(formatRelativeTo("en", now + 3 * 86_400_000, now)).toBe("in 3 days");
  });
});
