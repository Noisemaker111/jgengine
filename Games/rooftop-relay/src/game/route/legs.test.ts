import { describe, expect, test } from "bun:test";

import { allCheckpoints, allGaps, allPlatforms, buildRoute, totalParSeconds } from "./legs";

describe("rooftop-relay route", () => {
  test("has 5 legs of 5 platforms each", () => {
    const route = buildRoute();
    expect(route.legs.length).toBe(5);
    for (const leg of route.legs) expect(leg.platforms.length).toBe(5);
    expect(allPlatforms(route).length).toBe(25);
  });

  test("every platform footprint is odd so it centers on an integer cell", () => {
    for (const platform of allPlatforms()) {
      expect(platform.footprint[0] % 2).toBe(1);
      expect(platform.footprint[1] % 2).toBe(1);
    }
  });

  test("records exactly 10 distinct rooftop checkpoints, two per leg", () => {
    const checkpoints = allCheckpoints();
    expect(checkpoints.length).toBe(10);
    expect(new Set(checkpoints.map((cp) => cp.id)).size).toBe(10);
  });

  test("leg N+1's start checkpoint sits at leg N's handoff position", () => {
    const route = buildRoute();
    for (let i = 1; i < route.legs.length; i += 1) {
      const previous = route.legs[i - 1]!;
      const current = route.legs[i]!;
      expect(current.startCheckpoint.position).toEqual(previous.handoffCheckpoint.position);
    }
  });

  test("gap widths stay within the jumpable band (2..7 units)", () => {
    for (const gap of allGaps()) {
      expect(gap.width).toBeGreaterThanOrEqual(2);
      expect(gap.width).toBeLessThanOrEqual(7);
    }
  });

  test("difficulty escalates: leg5's gaps are wider on average than leg1's", () => {
    const route = buildRoute();
    const avg = (legIndex: number) => {
      const gaps = route.legs[legIndex]!.gaps;
      return gaps.reduce((sum, g) => sum + g.width, 0) / gaps.length;
    };
    expect(avg(4)).toBeGreaterThan(avg(0));
  });

  test("par time sums to the relay par", () => {
    expect(totalParSeconds()).toBe(24 + 27 + 30 + 28 + 34);
  });

  test("is deterministic under the same specs", () => {
    const a = buildRoute();
    const b = buildRoute();
    expect(a).toEqual(b);
  });
});
