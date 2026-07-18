import { describe, expect, test } from "bun:test";

import { formatSavedRelative } from "./formatSavedRelative";

describe("formatSavedRelative", () => {
  const now = Date.parse("2026-07-18T12:00:00.000Z");

  test("reports just now for sub-minute ages", () => {
    expect(formatSavedRelative(now - 5_000, now)).toBe("just now");
    expect(formatSavedRelative(now - 44_000, now)).toBe("just now");
  });

  test("reports minutes and hours", () => {
    expect(formatSavedRelative(now - 2 * 60_000, now)).toBe("2m ago");
    expect(formatSavedRelative(now - 90 * 60_000, now)).toBe("1h ago");
    expect(formatSavedRelative(now - 5 * 60 * 60_000, now)).toBe("5h ago");
  });

  test("reports days after two days", () => {
    expect(formatSavedRelative(now - 50 * 60 * 60_000, now)).toBe("2d ago");
  });
});
