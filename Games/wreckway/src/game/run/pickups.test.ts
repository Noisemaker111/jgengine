import { describe, expect, test } from "bun:test";

import { PARTS, partById } from "../parts/catalog";
import { nearestUncollected, PICKUP_RADIUS, PICKUPS } from "./pickups";
import { ROUTE_GATES } from "../route/gates";

function zOf(partId: string): number {
  return PICKUPS.find((p) => p.partId === partId)!.position[2];
}

function lastDropZForSlot(category: string): number {
  const slotZs = PICKUPS.filter((p) => partById(p.partId)!.category === category).map((p) => p.position[2]);
  return Math.max(...slotZs);
}

function firstGateZ(requirement: "plow" | "jump"): number {
  return Math.min(...ROUTE_GATES.filter((g) => g.requirement === requirement).map((g) => g.atZ));
}

describe("wreckway debris pickups", () => {
  test("places exactly one pickup per catalog part", () => {
    expect(PICKUPS).toHaveLength(PARTS.length);
    const partIds = new Set(PICKUPS.map((pickup) => pickup.partId));
    expect(partIds.size).toBe(PARTS.length);
  });

  test("every drop sits within a kart-radius of the centerline, so the corridor run collects the route parts", () => {
    for (const pickup of PICKUPS) {
      expect(Math.abs(pickup.position[0])).toBeLessThan(PICKUP_RADIUS);
    }
  });

  test("the plow blade is the last front drop, reachable before the first plow wall gates progress", () => {
    // Grabbing the whole route ends with the plow equipped (no later front drop ejects it),
    // and the drop lands before the first plow barricade so the kart can smash through it.
    expect(zOf("plow_blade")).toBe(lastDropZForSlot("front"));
    expect(zOf("plow_blade")).toBeLessThan(firstGateZ("plow"));
  });

  test("the coil springs are the last wheels drop, reachable before the first jump ramp gates progress", () => {
    expect(zOf("coil_springs")).toBe(lastDropZForSlot("wheels"));
    expect(zOf("coil_springs")).toBeLessThan(firstGateZ("jump"));
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
