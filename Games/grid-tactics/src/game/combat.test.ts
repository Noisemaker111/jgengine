import { describe, expect, test } from "bun:test";

import { clampHealth, resolveAttack } from "./combat";

describe("resolveAttack", () => {
  test("plain attacker deals its damage with no push", () => {
    const result = resolveAttack({ damage: 4 }, [0, 0], [1, 0]);
    expect(result.damage).toBe(4);
    expect(result.pushDirection).toBeNull();
  });

  test("pushing attacker returns the unit direction away from itself", () => {
    const result = resolveAttack({ damage: 5, pushTiles: 1 }, [3, 3], [3, 4]);
    expect(result.pushDirection).toEqual([0, 1]);
  });

  test("pushing attacker on the opposite axis still resolves a direction", () => {
    const result = resolveAttack({ damage: 5, pushTiles: 1 }, [3, 3], [2, 3]);
    expect(result.pushDirection).toEqual([-1, 0]);
  });

  test("damage floors at 1 even for a misconfigured zero-damage unit", () => {
    expect(resolveAttack({ damage: 0 }, [0, 0], [0, 1]).damage).toBe(1);
  });
});

describe("clampHealth", () => {
  test("clamps into [0, max]", () => {
    expect(clampHealth(-5, 10)).toBe(0);
    expect(clampHealth(15, 10)).toBe(10);
    expect(clampHealth(4, 10)).toBe(4);
  });
});
