import { describe, expect, test } from "bun:test";

import {
  createUseBehaviorRegistry,
  type UseBehaviorDef,
} from "@jgengine/core/item/useBehavior";

interface World {
  ammo: number;
  charge: number;
  log: string[];
}

function fresh(): World {
  return { ammo: 5, charge: 0, log: [] };
}

// A "charge" behavior with its own serializable per-item state.
const charge: UseBehaviorDef<World> = {
  id: "charge",
  order: 0,
  init: (config) => ({ level: 0, max: (config.max as number | undefined) ?? 3 }),
  apply(ctx) {
    const level = Math.min((ctx.state.level as number) + 1, ctx.state.max as number);
    return { world: { ...ctx.world, charge: level, log: [...ctx.world.log, "charge"] }, state: { ...ctx.state, level } };
  },
};

// A "fire" behavior that gates on ammo and consumes it — requires a host capability.
const fire: UseBehaviorDef<World> = {
  id: "fire",
  order: 10,
  requires: ["projectiles"],
  can: (ctx) => (ctx.world.ammo <= 0 ? { reason: "no-ammo" } : null),
  apply: (ctx) => ({ world: { ...ctx.world, ammo: ctx.world.ammo - 1, log: [...ctx.world.log, "fire"] } }),
};

function registry() {
  const reg = createUseBehaviorRegistry<World>();
  reg.register([fire, charge]);
  return reg;
}

describe("use-behavior registry", () => {
  test("register exposes ids and rejects duplicates", () => {
    const reg = registry();
    expect(reg.ids().sort()).toEqual(["charge", "fire"]);
    expect(reg.has("charge")).toBe(true);
    expect(() => reg.register([charge])).toThrow();
  });

  test("compose orders behaviors by resolved order, then ref order", () => {
    const reg = registry();
    const result = reg.compose([{ id: "fire" }, { id: "charge" }], { capabilities: ["projectiles"] });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    // charge (order 0) before fire (order 10) despite ref order
    expect(result.composed.order()).toEqual(["charge", "fire"]);
  });

  test("a ref order override wins over the def order", () => {
    const reg = registry();
    const result = reg.compose([{ id: "fire", order: -5 }, { id: "charge" }], { capabilities: ["projectiles"] });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.composed.order()).toEqual(["fire", "charge"]);
  });

  test("compose surfaces unknown, duplicate, capability, and conflict errors", () => {
    const reg = registry();
    expect(reg.compose([{ id: "ghost" }])).toEqual({ status: "error", reason: "unknown-behavior", id: "ghost" });
    expect(reg.compose([{ id: "charge" }, { id: "charge" }])).toEqual({ status: "error", reason: "duplicate-behavior", id: "charge" });
    expect(reg.compose([{ id: "fire" }])).toEqual({ status: "error", reason: "missing-capability", id: "fire", capability: "projectiles" });

    const conflicting = createUseBehaviorRegistry<World>();
    conflicting.register([
      { id: "melee", conflicts: ["fire"], apply: (ctx) => ({ world: ctx.world }) },
      { id: "fire", apply: (ctx) => ({ world: ctx.world }) },
    ]);
    expect(conflicting.compose([{ id: "melee" }, { id: "fire" }])).toEqual({
      status: "error",
      reason: "conflict",
      id: "melee",
      conflictsWith: "fire",
    });
  });
});

describe("use-behavior composition — dispatch", () => {
  test("initialState builds per-behavior state from config", () => {
    const reg = registry();
    const result = reg.compose([{ id: "charge", config: { max: 5 } }, { id: "fire" }], { capabilities: ["projectiles"] });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.composed.initialState()).toEqual({ charge: { level: 0, max: 5 }, fire: {} });
  });

  test("apply folds world and per-behavior state across the ordered chain", () => {
    const reg = registry();
    const result = reg.compose([{ id: "charge" }, { id: "fire" }], { capabilities: ["projectiles"] });
    if (result.status !== "ok") throw new Error("expected ok");
    const state = result.composed.initialState();
    const out = result.composed.apply(fresh(), state, { from: "p1", itemId: "chargegun" });
    expect(out.error).toBeUndefined();
    expect(out.world.log).toEqual(["charge", "fire"]);
    expect(out.world.ammo).toBe(4);
    expect(out.world.charge).toBe(1);
    expect(out.state.charge).toEqual({ level: 1, max: 3 });
  });

  test("apply is transactional: a mid-chain rejection discards all partial folds", () => {
    const reg = registry();
    const result = reg.compose([{ id: "charge" }, { id: "fire" }], { capabilities: ["projectiles"] });
    if (result.status !== "ok") throw new Error("expected ok");
    const world: World = { ammo: 0, charge: 0, log: [] };
    const state = result.composed.initialState();
    const out = result.composed.apply(world, state, { from: "p1", itemId: "chargegun" });
    expect(out.error).toBe("no-ammo");
    expect(out.world).toBe(world); // untouched — charge fold rolled back
    expect(out.state).toBe(state);
  });

  test("can returns the first rejection in run order", () => {
    const reg = registry();
    const result = reg.compose([{ id: "charge" }, { id: "fire" }], { capabilities: ["projectiles"] });
    if (result.status !== "ok") throw new Error("expected ok");
    const state = result.composed.initialState();
    expect(result.composed.can(fresh(), state, { from: "p1", itemId: "g" })).toBeNull();
    expect(result.composed.can({ ammo: 0, charge: 0, log: [] }, state, { from: "p1", itemId: "g" })).toEqual({ reason: "no-ammo" });
  });

  test("a stop outcome ends the chain early", () => {
    const reg = createUseBehaviorRegistry<World>();
    reg.register([
      { id: "jam", order: 0, apply: (ctx) => ({ world: { ...ctx.world, log: [...ctx.world.log, "jam"] }, stop: true }) },
      { id: "fireAfter", order: 1, apply: (ctx) => ({ world: { ...ctx.world, log: [...ctx.world.log, "after"] } }) },
    ]);
    const result = reg.compose([{ id: "jam" }, { id: "fireAfter" }]);
    if (result.status !== "ok") throw new Error("expected ok");
    const out = result.composed.apply(fresh(), result.composed.initialState(), { from: "p1", itemId: "g" });
    expect(out.world.log).toEqual(["jam"]);
  });

  test("composed state round-trips through JSON for saves", () => {
    const reg = registry();
    const result = reg.compose([{ id: "charge", config: { max: 4 } }, { id: "fire" }], { capabilities: ["projectiles"] });
    if (result.status !== "ok") throw new Error("expected ok");
    const applied = result.composed.apply(fresh(), result.composed.initialState(), { from: "p1", itemId: "g" });
    const restored = JSON.parse(JSON.stringify(applied.state));
    expect(restored).toEqual(applied.state);
    // resuming from restored state continues to advance charge deterministically
    const next = result.composed.apply(fresh(), restored, { from: "p1", itemId: "g" });
    expect(next.state.charge).toEqual({ level: 2, max: 4 });
  });
});

describe("use-behavior composition — non-weapon item", () => {
  interface PlayerState {
    hp: number;
    fed: number;
  }
  test("a consumable composes heal + nourish behaviors with no combat coupling", () => {
    const reg = createUseBehaviorRegistry<PlayerState>();
    reg.register([
      { id: "heal", order: 0, apply: (ctx) => ({ world: { ...ctx.world, hp: ctx.world.hp + (ctx.config.amount as number) } }) },
      { id: "nourish", order: 1, apply: (ctx) => ({ world: { ...ctx.world, fed: ctx.world.fed + 1 } }) },
    ]);
    const result = reg.compose([{ id: "heal", config: { amount: 20 } }, { id: "nourish" }]);
    if (result.status !== "ok") throw new Error("expected ok");
    const out = result.composed.apply({ hp: 50, fed: 0 }, result.composed.initialState(), { from: "p1", itemId: "stew" });
    expect(out.world).toEqual({ hp: 70, fed: 1 });
  });
});
