import { describe, expect, test } from "bun:test";
import { GOAL_HALF_WIDTH, PITCH_RX } from "../arena/geometry";
import { generateArenaDressing, generateBanners, generateCrowdStands, generateFloodlightTowers, generateWallSegments } from "./dressing";

describe("craterball arena dressing", () => {
  test("wall ring leaves both goal mouths open", () => {
    const segments = generateWallSegments(64);
    for (const segment of segments) {
      expect(Math.abs(segment.z)).toBeGreaterThan(GOAL_HALF_WIDTH);
    }
    const nearGoalX = segments.filter((s) => Math.abs(Math.abs(s.x) - PITCH_RX) < 3);
    expect(nearGoalX.length).toBeGreaterThan(0);
    expect(segments.length).toBeGreaterThan(40);
  });

  test("four floodlight towers dress the corners", () => {
    expect(generateFloodlightTowers()).toHaveLength(4);
  });

  test("crowd stands generate on both long sides across tiers", () => {
    const stands = generateCrowdStands(9, 2);
    expect(stands.length).toBe(9 * 2 * 2);
    const sides = new Set(stands.map((s) => Math.sign(s.z)));
    expect(sides.has(-1)).toBe(true);
    expect(sides.has(1)).toBe(true);
  });

  test("banners come in both team colors, evenly split", () => {
    const banners = generateBanners(3);
    const cyan = banners.filter((b) => b.catalogId === "banner_cyan");
    const magenta = banners.filter((b) => b.catalogId === "banner_magenta");
    expect(cyan).toHaveLength(3);
    expect(magenta).toHaveLength(3);
  });

  test("full dressing combines every zone", () => {
    const all = generateArenaDressing();
    expect(all.length).toBeGreaterThan(60);
  });
});
