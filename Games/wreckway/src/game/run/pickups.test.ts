import { describe, expect, test } from "bun:test";

import { PARTS } from "../parts/catalog";
import { nearestUncollected, PICKUP_RADIUS, PICKUPS } from "./pickups";
import { MID_LANE_HALF_WIDTH } from "./constants";

describe("wreckway debris pickups", () => {
  test("places exactly one pickup per catalog part", () => {
    expect(PICKUPS).toHaveLength(PARTS.length);
    const partIds = new Set(PICKUPS.map((pickup) => pickup.partId));
    expect(partIds.size).toBe(PARTS.length);
  });

  test("every pickup sits in the always-open mid lane", () => {
    for (const pickup of PICKUPS) {
      expect(Math.abs(pickup.position[0])).toBeLessThanOrEqual(MID_LANE_HALF_WIDTH);
    }
  });

  test("pickup z ordering is strictly increasing, spread across the route", () => {
    const zs = PICKUPS.map((pickup) => pickup.position[2]);
    for (let i = 1; i < zs.length; i += 1) expect(zs[i]!).toBeGreaterThan(zs[i - 1]!);
  });

  test("nearestUncollected finds a pickup within radius and ignores collected ones", () => {
    const first = PICKUPS[0]!;
    const found = nearestUncollected(first.position, new Set());
    expect(found?.id).toBe(first.id);

    const afterCollected = nearestUncollected(first.position, new Set([first.id]));
    expect(afterCollected?.id).not.toBe(first.id);
  });

  test("nearestUncollected returns null outside the pickup radius", () => {
    const first = PICKUPS[0]!;
    const far: readonly [number, number, number] = [first.position[0] + PICKUP_RADIUS * 5, 0, first.position[2]];
    expect(nearestUncollected(far, new Set())).toBeNull();
  });
});
