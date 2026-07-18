import { describe, expect, test } from "bun:test";
import {
  applyStatPoolDelta,
  changeStatPool,
  createStatPool,
  patchStatPool,
  type StatPool,
  type StatPoolAccess,
} from "@jgengine/core/stats/statPool";
import {
  applyPoolDelta,
  createEntityStatsApi,
  seedStatValues,
  type StatValueMap,
} from "@jgengine/core/scene/entityStats";

describe("portable stat pools", () => {
  test("normalizes any caller-named resource without privileging health", () => {
    expect(createStatPool({ max: 80 })).toEqual({ current: 80, max: 80, min: 0 });
    expect(createStatPool({ current: 120, max: 100, min: 10 })).toEqual({ current: 100, max: 100, min: 10 });
    expect(createStatPool({ current: -5, max: 40, min: 3 })).toEqual({ current: 3, max: 40, min: 3 });
  });

  test("patches and changes plain state without mutating caller data", () => {
    const stamina = createStatPool({ current: 30, max: 50 });
    const retuned = patchStatPool(stamina, { max: 20 });
    const spent = changeStatPool(retuned, -7);

    expect(stamina).toEqual({ current: 30, max: 50, min: 0 });
    expect(retuned).toEqual({ current: 20, max: 20, min: 0 });
    expect(spent).toEqual({
      previous: retuned,
      pool: { current: 13, max: 20, min: 0 },
      applied: -7,
      hitMin: false,
      hitMax: false,
    });
  });

  test("reports the actual clamped amount and boundaries", () => {
    const durability = createStatPool({ current: 4, max: 10 });
    const broken = changeStatPool(durability, -20);
    const repaired = changeStatPool(broken.pool, 30);

    expect(broken.applied).toBe(-4);
    expect(broken.hitMin).toBe(true);
    expect(repaired.applied).toBe(10);
    expect(repaired.hitMax).toBe(true);
  });

  test("round-trips through JSON as caller-owned save data", () => {
    const save = {
      units: {
        pilot: {
          shields: createStatPool({ current: 17, max: 25 }),
          energy: createStatPool({ current: 6, max: 12, min: 2 }),
        },
      },
    };

    expect(JSON.parse(JSON.stringify(save))).toEqual(save);
  });
});

describe("stat pool access conformance", () => {
  test("replaces state through a structural adapter over an existing save model", () => {
    type Resource = "energy" | "durability";
    const state: Record<string, Partial<Record<Resource, StatPool>>> = {
      rover: { energy: createStatPool({ current: 8, max: 10 }) },
    };
    const writes: StatPool[] = [];
    const access: StatPoolAccess<string, Resource> = {
      get(ownerId, statId) {
        return state[ownerId]?.[statId] ?? null;
      },
      set(ownerId, statId, next) {
        state[ownerId] ??= {};
        state[ownerId]![statId] = next;
        writes.push(next);
      },
    };

    const result = applyStatPoolDelta(access, "rover", "energy", -3);

    expect(result).toMatchObject({ status: "ok", applied: -3, hitMin: false, hitMax: false });
    expect(state.rover?.energy).toEqual({ current: 5, max: 10, min: 0 });
    expect(writes).toEqual([{ current: 5, max: 10, min: 0 }]);
  });

  test("rejects a missing pool without creating or writing state", () => {
    let writes = 0;
    const access: StatPoolAccess = {
      get: () => null,
      set: () => {
        writes += 1;
      },
    };

    expect(applyStatPoolDelta(access, "pilot", "mana", 5)).toEqual({
      status: "rejected",
      reason: 'unknown stat "mana"',
    });
    expect(writes).toBe(0);
  });

  test("keeps native entity-stat transitions behaviorally aligned", () => {
    const native = seedStatValues({ shields: { current: 8, max: 10 } });
    const result = applyPoolDelta(native, "shields", -3);
    expect(result).toMatchObject({
      status: "ok",
      stat: { current: 5, max: 10, min: 0 },
      hitMin: false,
      hitMax: false,
    });
  });

  test("uses the native entity API directly as a portable access adapter", () => {
    const maps = new Map<string, StatValueMap>([
      ["drone", seedStatValues({ battery: { current: 9, max: 12 } })],
    ]);
    const access: StatPoolAccess = createEntityStatsApi((ownerId) => maps.get(ownerId));

    expect(applyStatPoolDelta(access, "drone", "battery", -4)).toMatchObject({
      status: "ok",
      pool: { current: 5, max: 12, min: 0 },
    });
    expect(maps.get("drone")?.battery?.current).toBe(5);
  });
});
