import { describe, expect, test } from "bun:test";

import { dateLabel, dayOfYear, seasonOf, yearOf } from "./calendar";

describe("calendar", () => {
  test("years and day-of-year roll over at the configured year length", () => {
    expect(yearOf(0)).toBe(1);
    expect(yearOf(359)).toBe(1);
    expect(yearOf(360)).toBe(2);
    expect(dayOfYear(0)).toBe(0);
    expect(dayOfYear(360)).toBe(0);
  });

  test("season cycles through four bands across the year", () => {
    expect(seasonOf(0)).toBe("Spring");
    expect(seasonOf(95)).toBe("Summer");
    expect(seasonOf(185)).toBe("Autumn");
    expect(seasonOf(275)).toBe("Winter");
  });

  test("dateLabel renders a 1-based day within the current year", () => {
    expect(dateLabel(0)).toBe("Year 1, day 1");
    expect(dateLabel(112)).toBe("Year 1, day 113");
    expect(dateLabel(360)).toBe("Year 2, day 1");
  });
});
