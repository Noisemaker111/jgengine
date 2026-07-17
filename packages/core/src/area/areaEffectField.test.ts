import { describe, expect, test } from "bun:test";

import type { EntityPosition } from "../scene/entityStore";
import { createSpatialIndex } from "../visibility/spatialIndex";
import { createAreaEffectField, type AreaShape } from "./areaEffectField";
import {
  cappedStacks,
  extremumStack,
  independentStacks,
  sumMagnitude,
  uniqueByStackKey,
} from "./stackPolicy";

/** A tiny movable world of receivers; `candidates` is the broad phase, `positionOf` the refine. */
function world(initial: Record<string, EntityPosition>) {
  const positions = new Map<string, EntityPosition>(Object.entries(initial));
  return {
    move: (id: string, p: EntityPosition) => positions.set(id, p),
    remove: (id: string) => positions.delete(id),
    input: {
      candidates: () => positions.keys(),
      positionOf: (id: string) => positions.get(id),
    },
  };
}

const sphere = (center: EntityPosition, radius: number): AreaShape => ({ kind: "sphere", center, radius });

describe("createAreaEffectField membership", () => {
  test("enter and leave fire as a receiver crosses a static source's boundary", () => {
    const field = createAreaEffectField<{ tag: string }>();
    field.setSource({ id: "aura", shape: sphere([0, 0, 0], 5), payload: { tag: "warmth" } });
    const w = world({ hero: [10, 0, 0] });

    expect(field.step({ dtMs: 16, ...w.input })).toEqual([]);

    w.move("hero", [3, 0, 0]);
    const entered = field.step({ dtMs: 16, ...w.input });
    expect(entered).toHaveLength(1);
    expect(entered[0]).toMatchObject({ kind: "enter", sourceId: "aura", receiverId: "hero", stackKey: "aura" });
    expect(field.isMember("aura", "hero")).toBe(true);

    // Staying inside emits nothing when the source has no refresh cadence.
    expect(field.step({ dtMs: 16, ...w.input })).toEqual([]);

    w.move("hero", [9, 0, 0]);
    const left = field.step({ dtMs: 16, ...w.input });
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ kind: "leave", receiverId: "hero", reason: "exit" });
    expect(field.isMember("aura", "hero")).toBe(false);
  });

  test("membership follows a moving source", () => {
    const field = createAreaEffectField();
    const w = world({ target: [20, 0, 0] });

    // Source starts far from target -> no membership.
    field.setSource({ id: "cloud", shape: sphere([0, 0, 0], 4), payload: null });
    expect(field.step({ dtMs: 16, ...w.input })).toEqual([]);

    // Source drifts onto the (stationary) target -> enter, purely because the source moved.
    field.setSource({ id: "cloud", shape: sphere([18, 0, 0], 4), payload: null });
    const events = field.step({ dtMs: 16, ...w.input });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "enter", receiverId: "target" });
  });

  test("custom shape seam refines the broad-phase candidates", () => {
    const field = createAreaEffectField();
    // A half-plane volume: only receivers with x >= 0 are inside, within a bounding sphere.
    field.setSource({
      id: "zone",
      shape: { kind: "custom", center: [0, 0, 0], radius: 100, contains: (p) => p[0] >= 0 },
      payload: null,
    });
    const w = world({ east: [5, 0, 0], west: [-5, 0, 0] });
    const entered = field.step({ dtMs: 16, ...w.input }).filter((e) => e.kind === "enter");
    expect(entered.map((e) => e.receiverId).sort()).toEqual(["east"]);
  });
});

describe("refresh cadence", () => {
  test("refresh edges fire on cadence and coalesce multiple crossings per step", () => {
    const field = createAreaEffectField<{ dps: number }>();
    field.setSource({ id: "poison", shape: sphere([0, 0, 0], 5), payload: { dps: 3 }, refreshMs: 1000 });
    const w = world({ hero: [1, 0, 0] });

    // Enter: no refresh yet, phase starts at 0.
    expect(field.step({ dtMs: 0, ...w.input })[0]).toMatchObject({ kind: "enter" });

    // 600ms + 600ms = 1200ms -> one cadence crossed.
    expect(field.step({ dtMs: 600, ...w.input })).toEqual([]);
    const first = field.step({ dtMs: 600, ...w.input });
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ kind: "refresh", ticks: 1 });

    // A big step crosses several cadences at once and coalesces into one edge with ticks > 1.
    // Phase carried 200ms after the previous tick, so 200 + 2500 = 2700ms -> 2 cadences (700ms remains).
    const big = field.step({ dtMs: 2500, ...w.input });
    expect(big).toHaveLength(1);
    expect(big[0]).toMatchObject({ kind: "refresh", ticks: 2 });
  });

  test("no refreshMs means membership tracks enter/leave only", () => {
    const field = createAreaEffectField();
    field.setSource({ id: "ring", shape: sphere([0, 0, 0], 5), payload: null });
    const w = world({ a: [0, 0, 0] });
    field.step({ dtMs: 16, ...w.input });
    expect(field.step({ dtMs: 100000, ...w.input })).toEqual([]);
  });
});

describe("cleanup", () => {
  test("removeSource emits leave for every member and drops the source", () => {
    const field = createAreaEffectField();
    field.setSource({ id: "fire", shape: sphere([0, 0, 0], 10), payload: null, refreshMs: 500 });
    const w = world({ a: [1, 0, 0], b: [2, 0, 0] });
    field.step({ dtMs: 16, ...w.input });

    const leaves = field.removeSource("fire");
    expect(leaves.map((e) => e.receiverId).sort()).toEqual(["a", "b"]);
    expect(leaves.every((e) => e.reason === "source-removed")).toBe(true);
    expect(field.hasSource("fire")).toBe(false);
  });

  test("a vanished receiver (death/despawn) leaves on the next step", () => {
    const field = createAreaEffectField();
    field.setSource({ id: "aura", shape: sphere([0, 0, 0], 10), payload: null });
    const w = world({ mob: [1, 0, 0] });
    field.step({ dtMs: 16, ...w.input });

    w.remove("mob");
    const events = field.step({ dtMs: 16, ...w.input });
    expect(events).toEqual([{ kind: "leave", sourceId: "aura", receiverId: "mob", stackKey: "aura", payload: null, reason: "exit" }]);
  });

  test("disabling a source releases its members, re-enabling re-enters", () => {
    const field = createAreaEffectField();
    field.setSource({ id: "s", shape: sphere([0, 0, 0], 10), payload: null });
    const w = world({ a: [1, 0, 0] });
    field.step({ dtMs: 16, ...w.input });

    field.setSource({ id: "s", shape: sphere([0, 0, 0], 10), payload: null, enabled: false });
    expect(field.step({ dtMs: 16, ...w.input })[0]).toMatchObject({ kind: "leave", reason: "disabled" });

    field.setSource({ id: "s", shape: sphere([0, 0, 0], 10), payload: null, enabled: true });
    expect(field.step({ dtMs: 16, ...w.input })[0]).toMatchObject({ kind: "enter" });
  });

  test("clear releases every member and wipes all sources", () => {
    const field = createAreaEffectField();
    field.setSource({ id: "s1", shape: sphere([0, 0, 0], 10), payload: null });
    field.setSource({ id: "s2", shape: sphere([0, 0, 0], 10), payload: null });
    const w = world({ a: [1, 0, 0] });
    field.step({ dtMs: 16, ...w.input });

    const leaves = field.clear();
    expect(leaves).toHaveLength(2);
    expect(leaves.every((e) => e.reason === "cleared")).toBe(true);
    expect(field.sourceIds()).toEqual([]);
  });
});

describe("serialize round-trip", () => {
  test("membership and refresh phase survive save/load", () => {
    const field = createAreaEffectField<{ dps: number }>();
    field.setSource({ id: "poison", shape: sphere([0, 0, 0], 5), payload: { dps: 4 }, refreshMs: 1000 });
    const w = world({ hero: [1, 0, 0] });
    field.step({ dtMs: 0, ...w.input }); // enter
    field.step({ dtMs: 700, ...w.input }); // phase = 700ms, no tick yet

    const snapshot = JSON.parse(JSON.stringify(field.serialize())) as ReturnType<typeof field.serialize>;
    const restored = createAreaEffectField<{ dps: number }>(snapshot);
    // Shapes are transient: re-register the live source before stepping.
    restored.setSource({ id: "poison", shape: sphere([0, 0, 0], 5), payload: { dps: 4 }, refreshMs: 1000 });
    expect(restored.isMember("poison", "hero")).toBe(true);

    // 700ms carried over + 400ms = 1100ms -> exactly one cadence, proving phase persisted.
    const events = restored.step({ dtMs: 400, ...w.input });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "refresh", ticks: 1 });
  });
});

describe("stacking policies", () => {
  function overlap() {
    const field = createAreaEffectField<{ mag: number }>();
    // Three overlapping sources on one receiver: two share stackKey "chill", one is "burn".
    field.setSource({ id: "s1", shape: sphere([0, 0, 0], 10), payload: { mag: 2 }, stackKey: "chill" });
    field.setSource({ id: "s2", shape: sphere([0, 0, 0], 10), payload: { mag: 5 }, stackKey: "chill" });
    field.setSource({ id: "s3", shape: sphere([0, 0, 0], 10), payload: { mag: 9 }, stackKey: "burn" });
    const w = world({ hero: [0, 0, 0] });
    field.step({ dtMs: 16, ...w.input });
    return field.membershipsOf("hero");
  }
  const mag = (m: { payload: { mag: number } }) => m.payload.mag;

  test("independent keeps every overlapping membership", () => {
    expect(independentStacks()(overlap())).toHaveLength(3);
  });

  test("uniqueByStackKey keeps the strongest per key", () => {
    const kept = uniqueByStackKey(mag)(overlap());
    expect(kept.map((m) => m.sourceId).sort()).toEqual(["s2", "s3"]);
  });

  test("cappedStacks limits per key", () => {
    const kept = cappedStacks(1, mag)(overlap());
    expect(kept.map((m) => m.stackKey).sort()).toEqual(["burn", "chill"]);
  });

  test("extremumStack picks the single strongest or weakest", () => {
    expect(extremumStack(mag)(overlap())[0]?.sourceId).toBe("s3");
    expect(extremumStack(mag, true)(overlap())[0]?.sourceId).toBe("s1");
  });

  test("sumMagnitude adds overlapping magnitudes", () => {
    expect(sumMagnitude(overlap(), mag)).toBe(2 + 5 + 9);
  });
});

describe("thin compositions (genre-agnostic consumers)", () => {
  test("damage/heal field: route refresh edges through a caller HP pipeline", () => {
    const field = createAreaEffectField<{ perTick: number }>();
    const hp = new Map<string, number>([["hero", 100]]);
    field.setSource({ id: "brazier", shape: sphere([0, 0, 0], 6), payload: { perTick: -8 }, refreshMs: 1000 });
    const w = world({ hero: [2, 0, 0] });

    for (const events of [field.step({ dtMs: 0, ...w.input }), field.step({ dtMs: 1000, ...w.input })]) {
      for (const e of events) {
        if (e.kind === "refresh") hp.set(e.receiverId, (hp.get(e.receiverId) ?? 0) - e.payload.perTick * (e.ticks ?? 1));
      }
    }
    expect(hp.get("hero")).toBe(108); // one heal tick of +8
  });

  test("stat aura: enter/leave add and remove a buff source keyed by (source, stat)", () => {
    const field = createAreaEffectField<{ stat: string; amount: number }>();
    const buffs = new Map<string, number>();
    const key = (receiver: string, source: string) => `${receiver}:${source}`;
    field.setSource({ id: "banner", shape: sphere([0, 0, 0], 8), payload: { stat: "armor", amount: 10 } });
    const w = world({ ally: [3, 0, 0] });

    for (const e of field.step({ dtMs: 16, ...w.input })) {
      if (e.kind === "enter") buffs.set(key(e.receiverId, e.sourceId), e.payload.amount);
    }
    expect(buffs.get("ally:banner")).toBe(10);

    w.move("ally", [20, 0, 0]);
    for (const e of field.step({ dtMs: 16, ...w.input })) {
      if (e.kind === "leave") buffs.delete(key(e.receiverId, e.sourceId));
    }
    expect(buffs.has("ally:banner")).toBe(false);
  });

  test("non-stat consumer: a capture zone accrues progress only while occupied", () => {
    const field = createAreaEffectField<{ ratePerTick: number }>();
    let progress = 0;
    field.setSource({ id: "point", shape: sphere([0, 0, 0], 5), payload: { ratePerTick: 1 }, refreshMs: 500 });
    const w = world({ unit: [1, 0, 0] });

    field.step({ dtMs: 0, ...w.input }); // enter
    for (const e of field.step({ dtMs: 1000, ...w.input })) if (e.kind === "refresh") progress += (e.ticks ?? 0);
    expect(progress).toBe(2);

    w.move("unit", [50, 0, 0]);
    field.step({ dtMs: 500, ...w.input }); // leaves the point
    const before = progress;
    field.step({ dtMs: 5000, ...w.input }); // no members -> no progress
    expect(progress).toBe(before);
  });
});

describe("bounded candidate query", () => {
  test("drives membership from a spatial index sphere query, not a full scan", () => {
    const index = createSpatialIndex({ cellSize: 8 });
    const positions = new Map<string, EntityPosition>([
      ["near", [1, 0, 0]],
      ["far", [200, 0, 0]],
    ]);
    for (const [id, [x, y, z]] of positions) index.insert(id, { minX: x, minY: y, minZ: z, maxX: x, maxY: y, maxZ: z }, true);

    const field = createAreaEffectField();
    field.setSource({ id: "aura", shape: sphere([0, 0, 0], 5), payload: null });
    const out: string[] = [];
    const events = field.step({
      dtMs: 16,
      candidates: (shape) => index.querySphere(shape.center[0], shape.center[1], shape.center[2], shape.radius, out),
      positionOf: (id) => positions.get(id),
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "enter", receiverId: "near" });
  });
});
