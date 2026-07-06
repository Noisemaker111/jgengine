import { describe, expect, test } from "bun:test";
import {
  applyPoolDelta,
  createEntityStatsApi,
  getStatValue,
  seedStatValues,
  setStatValue,
  type StatValueMap,
} from "@jgengine/core/scene/entityStats";

describe("pool stats", () => {
  test("seedStatValues defaults current to max and min to 0", () => {
    const map = seedStatValues({ health: { max: 100 }, mana: { max: 50, min: 10 } });
    expect(map["health"]).toEqual({ current: 100, max: 100, min: 0 });
    expect(map["mana"]).toEqual({ current: 50, max: 50, min: 10 });
  });

  test("seedStatValues honors a declared current and clamps it into [min, max]", () => {
    const map = seedStatValues({
      level: { max: 60, min: 1, current: 1 },
      xp: { max: 400, current: 0 },
      overflow: { max: 10, current: 25 },
      underflow: { max: 10, min: 2, current: 0 },
    });
    expect(map["level"]).toEqual({ current: 1, max: 60, min: 1 });
    expect(map["xp"]).toEqual({ current: 0, max: 400, min: 0 });
    expect(map["overflow"]).toEqual({ current: 10, max: 10, min: 0 });
    expect(map["underflow"]).toEqual({ current: 2, max: 10, min: 2 });
  });

  test("getStatValue returns the stat or null", () => {
    const map = seedStatValues({ health: { max: 100 } });
    expect(getStatValue(map, "health")?.current).toBe(100);
    expect(getStatValue(map, "mana")).toBeNull();
  });

  test("setStatValue clamps current into [min, max] and leaves the input untouched", () => {
    const map = seedStatValues({ health: { max: 100 } });
    const next = setStatValue(map, "health", { current: 250 });
    expect(next["health"]).toEqual({ current: 100, max: 100, min: 0 });
    expect(map["health"]?.current).toBe(100);

    const lowered = setStatValue(next, "health", { max: 40 });
    expect(lowered["health"]).toEqual({ current: 40, max: 40, min: 0 });
  });

  test("setStatValue creates a missing stat from the patch", () => {
    const next = setStatValue({}, "xp", { current: 30, max: 120 });
    expect(next["xp"]).toEqual({ current: 30, max: 120, min: 0 });
  });

  test("applyPoolDelta clamps and reports hitMin and hitMax", () => {
    const map = seedStatValues({ health: { max: 100 } });

    const damaged = applyPoolDelta(map, "health", -30);
    expect(damaged.status).toBe("ok");
    if (damaged.status !== "ok") throw new Error("unreachable");
    expect(damaged.stat.current).toBe(70);
    expect(damaged.hitMin).toBe(false);
    expect(damaged.hitMax).toBe(false);

    const dead = applyPoolDelta(damaged.map, "health", -500);
    if (dead.status !== "ok") throw new Error("unreachable");
    expect(dead.stat.current).toBe(0);
    expect(dead.hitMin).toBe(true);

    const healed = applyPoolDelta(dead.map, "health", 999);
    if (healed.status !== "ok") throw new Error("unreachable");
    expect(healed.stat.current).toBe(100);
    expect(healed.hitMax).toBe(true);
  });

  test("applyPoolDelta rejects unknown stat ids", () => {
    const result = applyPoolDelta({}, "rage", 5);
    expect(result.status).toBe("rejected");
  });

  test("bound api reads, writes, and deltas through the resolver", () => {
    const maps = new Map<string, StatValueMap>([["mob-1", seedStatValues({ health: { max: 20 } })]]);
    const api = createEntityStatsApi((instanceId) => maps.get(instanceId));

    expect(api.get("mob-1", "health")).toEqual({ current: 20, max: 20, min: 0 });
    expect(api.get("missing", "health")).toBeNull();

    expect(api.set("mob-1", "health", { max: 30 })).toBe(true);
    expect(api.set("missing", "health", { max: 30 })).toBe(false);
    expect(api.get("mob-1", "health")?.max).toBe(30);

    expect(api.delta("mob-1", "health", -5)).toBeNull();
    expect(api.get("mob-1", "health")?.current).toBe(15);
    expect(api.delta("mob-1", "mana", -5)).not.toBeNull();
    expect(api.delta("missing", "health", -5)).not.toBeNull();
  });
});
