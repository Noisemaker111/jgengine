import { describe, expect, test } from "bun:test";
import {
  applyStatPoolDelta,
  changeMeter,
  changeStatPool,
  createMeter,
  createStatPool,
  patchStatPool,
  tickMeter,
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
      overflow: 0,
      hitMin: false,
      hitMax: false,
    });
  });

  test("reports the amount that did not fit as overflow", () => {
    const pool = createStatPool({ current: 8, max: 10 });
    const overfilled = changeStatPool(pool, 5);
    const overdrawn = changeStatPool(pool, -20);

    expect(overfilled.applied).toBe(2);
    expect(overfilled.overflow).toBe(3);
    expect(overdrawn.applied).toBe(-8);
    expect(overdrawn.overflow).toBe(-12);
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

  test("returns the same pool reference on a clamped no-op change", () => {
    const full = createStatPool({ current: 10, max: 10 });
    const gained = changeStatPool(full, 5);
    expect(gained.pool).toBe(full);
    expect(gained.applied).toBe(0);
    expect(gained.hitMax).toBe(true);

    const empty = createStatPool({ current: 0, max: 10 });
    const drained = changeStatPool(empty, -5);
    expect(drained.pool).toBe(empty);
    expect(drained.applied).toBe(0);
    expect(drained.hitMin).toBe(true);
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

describe("ticking meters", () => {
  test("decays toward min and clamps there", () => {
    const rates = { decay: 1 };
    const full = createMeter({ max: 10 });

    let meter = full;
    for (let i = 0; i < 3; i++) meter = tickMeter(meter, rates, 1).meter;
    expect(meter.pool.current).toBe(7);

    const nearlyEmpty = createMeter({ current: 1, max: 10 });
    const drained = tickMeter(nearlyEmpty, rates, 5);
    expect(drained.meter.pool.current).toBe(0);
    expect(drained.change.hitMin).toBe(true);
    expect(drained.change.overflow).toBe(-4);
  });

  test("regens only once the regen delay has passed", () => {
    const rates = { regen: 2, regenDelay: 1 };
    const dropped = changeMeter(createMeter({ max: 10 }), -4).meter;
    expect(dropped.pool.current).toBe(6);

    const waiting = tickMeter(dropped, rates, 0.5);
    expect(waiting.meter.pool.current).toBe(6);
    expect(waiting.meter.sinceDrop).toBe(0.5);

    const regenerated = tickMeter(waiting.meter, rates, 1);
    expect(regenerated.meter.pool.current).toBe(8);
  });

  test("decay does not restart the regen delay", () => {
    const rates = { regen: 1, decay: 1, regenDelay: 1 };
    let meter = createMeter({ current: 8, max: 10 });

    meter = tickMeter(meter, rates, 1).meter;
    expect(meter.pool.current).toBe(8);
    expect(meter.sinceDrop).toBe(1);

    meter = tickMeter(meter, rates, 1).meter;
    expect(meter.pool.current).toBe(8);
    expect(meter.sinceDrop).toBe(2);
  });

  test("a drop restarts the regen delay but a fill does not", () => {
    const rates = { regen: 1, regenDelay: 1 };
    let meter = tickMeter(createMeter({ current: 4, max: 10 }), {}, 2).meter;
    expect(meter.sinceDrop).toBe(2);

    meter = changeMeter(meter, -3).meter;
    expect(meter.pool.current).toBe(1);
    expect(meter.sinceDrop).toBe(0);

    meter = tickMeter(meter, rates, 0.5).meter;
    meter = changeMeter(meter, 2).meter;
    expect(meter.pool.current).toBe(3);
    expect(meter.sinceDrop).toBe(0.5);
  });

  test("decay waits decayDelay seconds after the last fill", () => {
    const rates = { decay: 1, decayDelay: 1 };
    let meter = changeMeter(createMeter({ current: 6, max: 10 }), 2).meter;
    expect(meter.sinceFill).toBe(0);

    const early = tickMeter(meter, rates, 0.5);
    expect(early.meter.pool.current).toBe(8);
    expect(early.meter.sinceFill).toBe(0.5);

    const started = tickMeter(early.meter, rates, 0.5);
    expect(started.meter.pool.current).toBe(7.5);
    expect(started.meter.sinceFill).toBe(1);

    meter = started.meter;
    for (let i = 0; i < 20; i++) meter = tickMeter(meter, rates, 1).meter;
    expect(meter.pool.current).toBe(0);
  });

  test("a fill restarts the decay delay while a drain leaves it running", () => {
    const rates = { decay: 1, decayDelay: 2 };
    let meter = changeMeter(createMeter({ max: 10 }), -4).meter;
    meter = tickMeter(meter, rates, 1).meter;
    expect(meter.pool.current).toBe(6);

    meter = tickMeter(meter, rates, 1).meter;
    expect(meter.pool.current).toBe(5);

    meter = changeMeter(meter, -1).meter;
    meter = tickMeter(meter, rates, 0.5).meter;
    expect(meter.pool.current).toBe(3.5);

    meter = changeMeter(meter, 1).meter;
    meter = tickMeter(meter, rates, 1).meter;
    expect(meter.pool.current).toBe(4.5);
    meter = tickMeter(meter, rates, 1).meter;
    expect(meter.pool.current).toBe(3.5);
  });

  test("returns the same meter on a no-op tick at max", () => {
    const full = createMeter({ max: 10 });
    const ticked = tickMeter(full, { regen: 5 }, 0);

    expect(ticked.meter).toBe(full);
    expect(ticked.change.pool).toBe(full.pool);
    expect(ticked.change.applied).toBe(0);
    expect(ticked.change.hitMax).toBe(true);
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

  test("keeps map and stat references identical on a no-op pool delta", () => {
    const native = seedStatValues({ energy: { current: 10, max: 10 } });
    const existing = native.energy;
    const result = applyPoolDelta(native, "energy", 5);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.map).toBe(native);
      expect(result.stat).toBe(existing);
    }
  });

  test("leaves the store reference-identical when delta is a no-op", () => {
    const maps = new Map<string, StatValueMap>([
      ["turret", seedStatValues({ heat: { current: 0, max: 100 } })],
    ]);
    const api = createEntityStatsApi((ownerId) => maps.get(ownerId));
    const before = maps.get("turret")!.heat;
    expect(api.delta("turret", "heat", -20)).toBeNull();
    expect(maps.get("turret")!.heat).toBe(before);
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
