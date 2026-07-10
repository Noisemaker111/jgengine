import { describe, expect, test } from "bun:test";

import { COMPACTOR_BASE_SPEED, COMPACTOR_SURGES, activeSurge, compactorSpeedAt, compactorZAt, compactorGap, isCaught } from "./schedule";
import { COMPACTOR_START_Z } from "../run/constants";

describe("wreckway compactor schedule", () => {
  test("starts behind the yard and is monotonically non-decreasing", () => {
    expect(compactorZAt(0)).toBeCloseTo(COMPACTOR_START_Z, 5);
    let previous = compactorZAt(0);
    for (let t = 1; t <= 100; t += 1) {
      const z = compactorZAt(t);
      expect(z).toBeGreaterThanOrEqual(previous);
      previous = z;
    }
  });

  test("is deterministic — same time always yields the same position", () => {
    expect(compactorZAt(47.3)).toBe(compactorZAt(47.3));
    expect(compactorZAt(47.3)).toBe(compactorZAt(47.3));
  });

  test("moves at base speed outside surge windows", () => {
    expect(compactorSpeedAt(5)).toBe(COMPACTOR_BASE_SPEED);
    expect(compactorSpeedAt(45)).toBe(COMPACTOR_BASE_SPEED);
  });

  test("reports two surge windows with elevated speed", () => {
    expect(COMPACTOR_SURGES).toHaveLength(2);
    for (const surge of COMPACTOR_SURGES) {
      const midpoint = (surge.startT + surge.endT) / 2;
      expect(compactorSpeedAt(midpoint)).toBe(surge.speed);
      expect(surge.speed).toBeGreaterThan(COMPACTOR_BASE_SPEED);
      expect(activeSurge(midpoint)?.id).toBe(surge.id);
    }
    expect(activeSurge(0)).toBeNull();
  });

  test("catch condition trips once the compactor reaches the crush buffer", () => {
    expect(isCaught(100, 99)).toBe(true);
    expect(isCaught(100, 50)).toBe(false);
    expect(compactorGap(100, 40)).toBe(60);
  });
});
