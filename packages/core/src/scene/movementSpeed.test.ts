import { describe, expect, test } from "bun:test";

import { applyStatDrivenSpeed, deriveWalkSpeed, type MovementSpeedDeps } from "./movementSpeed";
import { createEntityStatsApi, seedStatValues, type StatValueMap } from "./entityStats";
import { createEntityStore } from "./entityStore";

describe("deriveWalkSpeed", () => {
  test("neutral modifiers leave base speed unchanged", () => {
    expect(deriveWalkSpeed(5, {})).toBe(5);
  });

  test("multiplier and flat bonus combine", () => {
    expect(deriveWalkSpeed(5, { multiplier: 1.5, flatBonus: 2 })).toBe(9.5);
  });

  test("clamps to zero when modifiers would go negative", () => {
    expect(deriveWalkSpeed(5, { multiplier: 0, flatBonus: -10 })).toBe(0);
    expect(deriveWalkSpeed(5, { multiplier: -2 })).toBe(0);
  });
});

describe("applyStatDrivenSpeed", () => {
  function stubDeps(): MovementSpeedDeps {
    const movementById = new Map<string, { walkSpeed?: number }>([["hero", {}]]);
    const statsById = new Map<string, StatValueMap>([
      [
        "hero",
        seedStatValues({
          haste: { max: 2, current: 1.5 },
          gearBonus: { max: 10, current: 3 },
          penalty: { max: 0, min: -100, current: -100 },
        }),
      ],
    ]);
    return {
      stats: { get: (id, statId) => statsById.get(id)?.[statId] ?? null },
      entities: {
        get: (id) => (movementById.has(id) ? { movement: movementById.get(id) } : null),
        update: (id, patch) => {
          if (!movementById.has(id)) return false;
          movementById.set(id, patch.movement);
          return true;
        },
      },
    };
  }

  test("missing stat ids fall back to neutral defaults", () => {
    const deps = stubDeps();
    const ok = applyStatDrivenSpeed(deps, "hero", { baseSpeed: 4 });
    expect(ok).toBe(true);
    expect(deps.entities.get("hero")).toEqual({ movement: { walkSpeed: 4 } });
  });

  test("multiplier and flat bonus stats compute walk speed", () => {
    const deps = stubDeps();
    applyStatDrivenSpeed(deps, "hero", { baseSpeed: 4, multiplierStat: "haste", flatBonusStat: "gearBonus" });
    expect(deps.entities.get("hero")).toEqual({ movement: { walkSpeed: 9 } });
  });

  test("clamps the derived speed at zero", () => {
    const deps = stubDeps();
    applyStatDrivenSpeed(deps, "hero", { baseSpeed: 4, multiplierStat: "haste", flatBonusStat: "penalty" });
    expect(deps.entities.get("hero")).toEqual({ movement: { walkSpeed: 0 } });
  });

  test("returns false and writes nothing for an unknown entity", () => {
    const deps = stubDeps();
    const ok = applyStatDrivenSpeed(deps, "ghost", { baseSpeed: 4 });
    expect(ok).toBe(false);
  });

  test("integrates with the real entity store and stats api", () => {
    const entities = createEntityStore();
    const id = entities.spawn("hero", { id: "hero", movement: { frozen: true } });
    const statsMap: StatValueMap = seedStatValues({ haste: { max: 2, current: 2 } });
    const stats = createEntityStatsApi((instanceId) => (instanceId === id ? statsMap : undefined));

    const ok = applyStatDrivenSpeed({ stats, entities }, id, { baseSpeed: 3, multiplierStat: "haste" });

    expect(ok).toBe(true);
    const entity = entities.get(id)!;
    expect(entity.movement.walkSpeed).toBe(6);
    expect(entity.movement.frozen).toBe(true);
  });
});
