import { describe, expect, test } from "bun:test";
import { seededRng } from "@jgengine/core/random/rng";
import {
  DEFAULT_SEED_PARAM,
  dailySeed,
  seedFromSearch,
  seedFromUrl,
  withSeedParam,
} from "@jgengine/core/random/seedLink";

describe("withSeedParam", () => {
  test("adds a seed to an absolute url while keeping other params", () => {
    expect(withSeedParam("https://x.com/play?a=1", "abc")).toBe("https://x.com/play?a=1&seed=abc");
  });

  test("adds a seed to a bare path", () => {
    expect(withSeedParam("/games/rogue", 42)).toBe("/games/rogue?seed=42");
  });

  test("adds a seed to a root-relative path with no query", () => {
    expect(withSeedParam("/play", "xyz")).toBe("/play?seed=xyz");
  });

  test("replaces an existing seed param", () => {
    expect(withSeedParam("/games/rogue?seed=old&mode=hard", "new")).toBe(
      "/games/rogue?seed=new&mode=hard",
    );
  });

  test("preserves a hash fragment at the end", () => {
    expect(withSeedParam("/games/rogue#intro", "abc")).toBe("/games/rogue?seed=abc#intro");
  });

  test("preserves query params and hash together", () => {
    expect(withSeedParam("/games/rogue?mode=hard#intro", "abc")).toBe(
      "/games/rogue?mode=hard&seed=abc#intro",
    );
  });

  test("stringifies numeric seeds", () => {
    expect(withSeedParam("/games/rogue", 12345)).toBe("/games/rogue?seed=12345");
  });

  test("supports a custom param name", () => {
    expect(withSeedParam("/games/rogue", "abc", "s")).toBe("/games/rogue?s=abc");
  });
});

describe("seedFromUrl", () => {
  test("reads the seed from an absolute url", () => {
    expect(seedFromUrl("https://x.com/play?a=1&seed=abc")).toBe("abc");
  });

  test("reads the seed from a bare path", () => {
    expect(seedFromUrl("/games/rogue?seed=42")).toBe("42");
  });

  test("reads the seed alongside a hash fragment", () => {
    expect(seedFromUrl("/games/rogue?seed=abc#intro")).toBe("abc");
  });

  test("returns null when the param is absent", () => {
    expect(seedFromUrl("/games/rogue?mode=hard")).toBeNull();
  });

  test("returns null when the param is an empty string", () => {
    expect(seedFromUrl("/games/rogue?seed=")).toBeNull();
  });

  test("returns null for a url with no query at all", () => {
    expect(seedFromUrl("/games/rogue")).toBeNull();
  });

  test("supports a custom param name", () => {
    expect(seedFromUrl("/games/rogue?s=abc", "s")).toBe("abc");
  });
});

describe("seedFromSearch", () => {
  test("accepts a leading-? search string", () => {
    expect(seedFromSearch("?seed=x")).toBe("x");
  });

  test("accepts a search string without the leading ?", () => {
    expect(seedFromSearch("seed=x")).toBe("x");
  });

  test("finds the seed among several params", () => {
    expect(seedFromSearch("?a=1&seed=x&b=2")).toBe("x");
  });

  test("returns null when absent", () => {
    expect(seedFromSearch("?a=1&b=2")).toBeNull();
  });

  test("returns null when the value is empty", () => {
    expect(seedFromSearch("?seed=")).toBeNull();
  });

  test("supports a custom param name", () => {
    expect(seedFromSearch("?s=x", "s")).toBe("x");
  });

  test("uses the default seed param constant", () => {
    expect(seedFromSearch(`?${DEFAULT_SEED_PARAM}=x`)).toBe("x");
  });
});

describe("seed round-trip", () => {
  test("round-trips a plain seed through an absolute url", () => {
    const link = withSeedParam("https://x.com/play", "abc123");
    expect(seedFromUrl(link)).toBe("abc123");
  });

  test("round-trips a numeric seed", () => {
    const link = withSeedParam("/games/rogue", 987654);
    expect(seedFromUrl(link)).toBe(String(987654));
  });

  test("round-trips a seed containing spaces", () => {
    const link = withSeedParam("/games/rogue", "hello world");
    expect(seedFromUrl(link)).toBe("hello world");
  });

  test("round-trips a seed containing & and =", () => {
    const link = withSeedParam("/games/rogue", "a&b=c");
    expect(seedFromUrl(link)).toBe("a&b=c");
  });

  test("round-trips a unicode seed", () => {
    const link = withSeedParam("/games/rogue", "季节种子-☃");
    expect(seedFromUrl(link)).toBe("季节种子-☃");
  });

  test("round-trips with a custom param name and other params intact", () => {
    const link = withSeedParam("/games/rogue?mode=hard", "abc", "s");
    expect(link).toContain("mode=hard");
    expect(seedFromUrl(link, "s")).toBe("abc");
  });
});

describe("dailySeed", () => {
  test("formats the UTC calendar date with zero-padding", () => {
    const nowMs = Date.UTC(2026, 2, 5, 12, 0, 0);
    expect(dailySeed(nowMs)).toBe("2026-03-05");
  });

  test("zero-pads single-digit months and days", () => {
    const nowMs = Date.UTC(2026, 0, 9, 0, 0, 0);
    expect(dailySeed(nowMs)).toBe("2026-01-09");
  });

  test("appends a non-empty salt", () => {
    const nowMs = Date.UTC(2026, 2, 5, 12, 0, 0);
    expect(dailySeed(nowMs, "daily-run")).toBe("2026-03-05:daily-run");
  });

  test("ignores an empty-string salt", () => {
    const nowMs = Date.UTC(2026, 2, 5, 12, 0, 0);
    expect(dailySeed(nowMs, "")).toBe("2026-03-05");
  });

  test("maps a late-day timestamp by UTC, not local time", () => {
    const nowMs = Date.UTC(2026, 2, 5, 23, 59, 59);
    expect(dailySeed(nowMs)).toBe("2026-03-05");
  });

  test("two players on the same UTC day derive the same daily seed", () => {
    const morning = Date.UTC(2026, 2, 5, 1, 0, 0);
    const night = Date.UTC(2026, 2, 5, 23, 0, 0);
    expect(dailySeed(morning)).toBe(dailySeed(night));
  });
});

describe("seed link composition with seededRng", () => {
  test("two players deriving the same link get identical first rng values", () => {
    const link = withSeedParam("https://x.com/play", "shared-seed-42");
    const seedA = seedFromUrl(link);
    const seedB = seedFromUrl(link);
    expect(seedA).not.toBeNull();
    expect(seedB).not.toBeNull();

    const rngA = seededRng(seedA!);
    const rngB = seededRng(seedB!);
    expect(rngA()).toBe(rngB());
    expect(rngA()).toBe(rngB());
  });
});
