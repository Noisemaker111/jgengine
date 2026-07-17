import { describe, expect, test } from "bun:test";

import {
  createLayerRegistry,
  diffParams,
  orderLayers,
  resolveParams,
  resolveSelection,
  validateLayers,
  type ParamLayer,
} from "./paramLayers";

describe("resolveParams", () => {
  test("folds set/add/multiply/clamp/curve in a well-defined order", () => {
    const base = { damage: 100 };
    const layers: ParamLayer[] = [
      { id: "tier", ops: { damage: { kind: "multiply", value: 2 } } },
      { id: "buff", ops: { damage: { kind: "add", value: 50 } } },
      { id: "cap", ops: { damage: { kind: "clamp", max: 200 } } },
    ];
    // 100 * 2 = 200, + 50 = 250, clamp<=200 => 200
    expect(resolveParams(base, layers).values.damage).toBe(200);
  });

  test("layer precedence is by priority then stable active-list index", () => {
    // Two layers both set the value; higher priority applies later and wins.
    const layers: ParamLayer[] = [
      { id: "high", priority: 10, ops: { hp: { kind: "set", value: 5 } } },
      { id: "low", priority: 0, ops: { hp: { kind: "set", value: 1 } } },
    ];
    expect(orderLayers(layers).map((l) => l.id)).toEqual(["low", "high"]);
    expect(resolveParams({ hp: 0 }, layers).values.hp).toBe(5);
  });

  test("equal priority breaks ties by declaration order (stable)", () => {
    const layers: ParamLayer[] = [
      { id: "first", ops: { x: { kind: "add", value: 1 } } },
      { id: "second", ops: { x: { kind: "multiply", value: 10 } } },
    ];
    // (0 + 1) * 10 = 10  — first then second
    expect(resolveParams({ x: 0 }, layers).values.x).toBe(10);
    // reversed declaration order changes the result deterministically
    expect(resolveParams({ x: 0 }, [layers[1], layers[0]]).values.x).toBe(1);
  });

  test("ops list within a layer folds left-to-right", () => {
    const layers: ParamLayer[] = [
      { id: "combo", ops: { v: [{ kind: "add", value: 10 }, { kind: "multiply", value: 3 }, { kind: "clamp", max: 20 }] } },
    ];
    // (0 + 10) * 3 = 30, clamp<=20 => 20
    expect(resolveParams({ v: 0 }, layers).values.v).toBe(20);
  });

  test("curve op remaps the running value through a progression curve", () => {
    const layers: ParamLayer[] = [
      { id: "shape", ops: { level: { kind: "curve", curve: { kind: "linear", base: 0, per: 2 } } } },
    ];
    expect(resolveParams({ level: 5 }, layers).values.level).toBe(10);
  });

  test("records full contribution provenance per parameter", () => {
    const layers: ParamLayer[] = [
      { id: "a", ops: { g: { kind: "add", value: 5 } } },
      { id: "b", ops: { g: { kind: "multiply", value: 2 } } },
    ];
    const trace = resolveParams({ g: 0 }, layers).contributions.g;
    expect(trace).toEqual([
      { layerId: "a", op: { kind: "add", value: 5 }, from: 0, to: 5 },
      { layerId: "b", op: { kind: "multiply", value: 2 }, from: 5, to: 10 },
    ]);
  });

  test("parameters introduced by a layer but absent from base start at 0", () => {
    const layers: ParamLayer[] = [{ id: "new", ops: { fresh: { kind: "add", value: 7 } } }];
    expect(resolveParams({}, layers).values.fresh).toBe(7);
  });

  test("is deterministic — identical inputs yield identical snapshots", () => {
    const base = { a: 3, b: 4 };
    const layers: ParamLayer[] = [
      { id: "l1", priority: 1, ops: { a: { kind: "multiply", value: 2 }, b: { kind: "add", value: 1 } } },
      { id: "l2", priority: 2, ops: { a: { kind: "add", value: 1 } } },
    ];
    expect(resolveParams(base, layers)).toEqual(resolveParams(base, layers));
  });
});

describe("validateLayers", () => {
  test("clean set has no conflicts", () => {
    expect(validateLayers([{ id: "a", ops: { x: { kind: "add", value: 1 } } }])).toEqual([]);
  });

  test("flags duplicate ids", () => {
    const conflicts = validateLayers([
      { id: "dup", ops: {} },
      { id: "dup", ops: {} },
    ]);
    expect(conflicts).toContainEqual({ kind: "duplicate-id", layerIds: ["dup"] });
  });

  test("flags competing set ops on the same param at the same priority", () => {
    const conflicts = validateLayers([
      { id: "a", priority: 0, ops: { hp: { kind: "set", value: 1 } } },
      { id: "b", priority: 0, ops: { hp: { kind: "set", value: 2 } } },
    ]);
    expect(conflicts).toContainEqual({ kind: "set-conflict", param: "hp", layerIds: ["a", "b"] });
  });

  test("set ops at different priorities are not a conflict", () => {
    const conflicts = validateLayers([
      { id: "a", priority: 0, ops: { hp: { kind: "set", value: 1 } } },
      { id: "b", priority: 1, ops: { hp: { kind: "set", value: 2 } } },
    ]);
    expect(conflicts.filter((c) => c.kind === "set-conflict")).toEqual([]);
  });
});

describe("diffParams", () => {
  test("reports only changed params with signed delta, sorted by name", () => {
    const before = resolveParams({ dmg: 100, hp: 50 }, []).values;
    const after = resolveParams({ dmg: 100, hp: 50 }, [
      { id: "hard", ops: { dmg: { kind: "multiply", value: 1.5 }, hp: { kind: "add", value: 25 } } },
    ]).values;
    expect(diffParams(before, after)).toEqual([
      { param: "dmg", from: 100, to: 150, delta: 50 },
      { param: "hp", from: 50, to: 75, delta: 25 },
    ]);
  });
});

describe("createLayerRegistry / resolveSelection", () => {
  test("rejects duplicate registration", () => {
    const registry = createLayerRegistry([{ id: "t1", ops: {} }]);
    expect(() => registry.register({ id: "t1", ops: {} })).toThrow(/already registered/);
  });

  test("resolves saved ids in order and reports unknown ids without throwing", () => {
    const registry = createLayerRegistry([
      { id: "t1", ops: { dmg: { kind: "multiply", value: 2 } } },
      { id: "t2", ops: { dmg: { kind: "add", value: 10 } } },
    ]);
    const { snapshot, unknown } = resolveSelection({ dmg: 5 }, registry, ["t1", "ghost", "t2"]);
    // (5 * 2) + 10 = 20; unknown id "ghost" dropped
    expect(snapshot.values.dmg).toBe(20);
    expect(unknown).toEqual(["ghost"]);
  });

  test("resolveSelection is reproducible from base + registry + ids", () => {
    const registry = createLayerRegistry([{ id: "t1", ops: { x: { kind: "add", value: 1 } } }]);
    const a = resolveSelection({ x: 0 }, registry, ["t1"]);
    const b = resolveSelection({ x: 0 }, registry, ["t1"]);
    expect(a.snapshot.values).toEqual(b.snapshot.values);
  });
});
