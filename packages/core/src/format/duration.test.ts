import { describe, expect, test } from "bun:test";
import { formatDelta, formatDuration, formatOrdinal, padNumber } from "./duration";

describe("formatDuration", () => {
  test("m:ss by default", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(9)).toBe("0:09");
    expect(formatDuration(75)).toBe("1:15");
  });
  test("fractional seconds", () => {
    expect(formatDuration(75.5, { decimals: 1 })).toBe("1:15.5");
    expect(formatDuration(83.25, { decimals: 2 })).toBe("1:23.25");
  });
  test("hours shown when present or forced", () => {
    expect(formatDuration(3661)).toBe("1:01:01");
    expect(formatDuration(65, { hours: true })).toBe("0:01:05");
  });
  test("negative clamps to zero", () => {
    expect(formatDuration(-5)).toBe("0:00");
  });
});

describe("formatDelta", () => {
  test("signed", () => {
    expect(formatDelta(1.23)).toBe("+0:01.23");
    expect(formatDelta(83.25)).toBe("+1:23.25");
    expect(formatDelta(-0.5)).toBe("-0:00.50");
  });
});

describe("formatOrdinal", () => {
  test("suffixes", () => {
    expect(formatOrdinal(1)).toBe("1st");
    expect(formatOrdinal(2)).toBe("2nd");
    expect(formatOrdinal(3)).toBe("3rd");
    expect(formatOrdinal(4)).toBe("4th");
    expect(formatOrdinal(11)).toBe("11th");
    expect(formatOrdinal(12)).toBe("12th");
    expect(formatOrdinal(13)).toBe("13th");
    expect(formatOrdinal(21)).toBe("21st");
    expect(formatOrdinal(102)).toBe("102nd");
  });
});

describe("padNumber", () => {
  test("zero pads", () => {
    expect(padNumber(5, 2)).toBe("05");
    expect(padNumber(123, 2)).toBe("123");
  });
});
