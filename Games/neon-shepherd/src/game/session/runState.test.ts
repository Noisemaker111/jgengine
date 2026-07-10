import { describe, expect, test } from "bun:test";
import { CREATURE_COUNT, SANCTUARY_Z } from "../constants";
import { CREATURES } from "../entities/creatures/catalog";
import { hasLost, hasWon, nearestRoadIndex, nextRoadAhead, resolveMedal } from "./runState";

describe("medal thresholds", () => {
  test("20 alive is gold", () => expect(resolveMedal(20)).toBe("gold"));
  test("17 alive is silver", () => expect(resolveMedal(17)).toBe("silver"));
  test("14 alive is bronze", () => expect(resolveMedal(14)).toBe("bronze"));
  test("13 alive earns no medal", () => expect(resolveMedal(13)).toBeNull());
  test("boundaries are inclusive on the low end of each tier", () => {
    expect(resolveMedal(19)).toBe("silver");
    expect(resolveMedal(16)).toBe("bronze");
  });
});

describe("win/lose conditions", () => {
  test("loses below 14 lights", () => {
    expect(hasLost(13)).toBe(true);
    expect(hasLost(14)).toBe(false);
  });

  test("wins only at the sanctuary with at least 14 lights", () => {
    expect(hasWon(SANCTUARY_Z, SANCTUARY_Z, 14)).toBe(true);
    expect(hasWon(SANCTUARY_Z - 5, SANCTUARY_Z, 20)).toBe(false);
    expect(hasWon(SANCTUARY_Z, SANCTUARY_Z, 13)).toBe(false);
  });
});

describe("nearest / next road lookup", () => {
  const roadZs = [-50, -30, -10, 10, 30, 50];

  test("nearestRoadIndex finds the closest road by z", () => {
    expect(nearestRoadIndex(-9, roadZs)).toBe(2);
    expect(nearestRoadIndex(51, roadZs)).toBe(5);
  });

  test("nextRoadAhead finds the first road at or ahead of z", () => {
    expect(nextRoadAhead(-51, roadZs)).toBe(0);
    expect(nextRoadAhead(-45, roadZs)).toBe(1);
    expect(nextRoadAhead(11, roadZs)).toBe(3);
    expect(nextRoadAhead(52, roadZs)).toBeNull();
  });
});

describe("creature catalog determinism", () => {
  test("generates the full seeded roster with stable ids", () => {
    expect(CREATURES.length).toBe(CREATURE_COUNT);
    expect(new Set(CREATURES.map((c) => c.id)).size).toBe(CREATURE_COUNT);
  });

  test("tint and size vary across the roster (not a single repeated placeholder)", () => {
    const tints = new Set(CREATURES.map((c) => c.tint));
    const sizes = new Set(CREATURES.map((c) => c.sizeScale));
    expect(tints.size).toBeGreaterThan(1);
    expect(sizes.size).toBeGreaterThan(1);
  });

  test("every creature has a well-formed tint and a size within bounds", () => {
    for (const creature of CREATURES) {
      expect(creature.tint).toMatch(/^#[0-9a-f]{6}$/i);
      expect(creature.sizeScale).toBeGreaterThan(0.5);
      expect(creature.sizeScale).toBeLessThan(1.5);
    }
  });
});
