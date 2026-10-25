import { afterEach, beforeEach, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { EXIT, FRAGMENTS, GARAGE, LIFTS, NODES, physics, SUPPLIES, world, type Point } from "../world";
import { captureProbe, initialize, keybinds, seatPlayer, tick, viewStore, whenReady, whenWritten } from "./controls";
import { marrowOf, marrowSpec } from "./marrow";
import { rollItem } from "./items";
import { broadcast, createSenses, tickCreatures } from "./descent";
import { createSpeciesSenses } from "./fauna";
import { newDive } from "./state";

/**
 * The descent as a player plays it, through the real commands and tick: ride the lifts, scan,
 * work a seam, carry supplies home to the galley, print gear and build a bay, and the strata's
 * pressure and prints pushing back. Everything is read back from a fresh context to prove the
 * record keeps it.
 */
let data: Map<string, string>;
const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
beforeEach(() => {
  data = new Map();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => data.get(key) ?? null, removeItem: (key: string) => { data.delete(key); }, setItem: (key: string, value: string) => { data.set(key, value); } } });
});
afterEach(() => {
  if (original) Object.defineProperty(globalThis, "localStorage", original);
  else Reflect.deleteProperty(globalThis, "localStorage");
});
async function create(): Promise<GameContext> {
  const definition = defineGameDefinition({ name: "Descent", world, physics, input: keybinds, persist: false, lifecycle: "always-live", systems: [marrowSpec.system] });
  const ctx = createGameContext({ definition, player: { userId: "diver", isNew: true }, content: { entityById: id => id === "diver" ? { stats: { health: { max: 100 }, oxygen: { max: 110 }, ammo: { max: 6 } } } : id === "fitter" ? { stats: { health: { max: 80 } } } : null } });
  initialize(ctx); seatPlayer(ctx);
  await whenReady(ctx);
  viewStore.update(ctx, v => ({ ...v, mode: v.mode === "loading" ? "home" : v.mode }));
  ctx.time.play();
  return ctx;
}
const stand = (ctx: GameContext, at: Point) => ctx.scene.entity.setPose(ctx.player.userId, { position: at, dt: 0 });
const run = (ctx: GameContext, seconds: number) => { for (let t = 0; t < seconds; t += 0.1) tick(ctx, 0.1); };
async function depart(ctx: GameContext): Promise<void> {
  stand(ctx, GARAGE);
  ctx.game.commands.run("deepward.depart", {});
  await whenWritten(ctx);
  expect(viewStore.read(ctx).mode).toBe("dive");
}
function ride(ctx: GameContext, id: string): void {
  stand(ctx, LIFTS.find(lift => lift.id === id)!.at);
  ctx.game.commands.run("deepward.interact", {});
}
function hold(ctx: GameContext, at: Point, seconds = 3): void {
  stand(ctx, at);
  ctx.game.commands.run("deepward.interact", {});
  expect(viewStore.read(ctx).dive!.channel).not.toBeNull();
  run(ctx, seconds);
}

test("lifts chart the strata, the scanner teaches blueprints, and the cold stores' shelves feed the galley", async () => {
  const ctx = await create();
  await depart(ctx);
  ride(ctx, "lift-vault-down");
  expect(viewStore.read(ctx).dive!.stratum).toBe("cold");
  expect(viewStore.read(ctx).deep.charted).toEqual(["vault", "cold"]);
  expect(captureProbe(ctx).stratum).toBe(2);

  // Two cart wrecks teach the plasma cutter: the first leaves it half-learned.
  hold(ctx, FRAGMENTS.find(fragment => fragment.id === "cold-cart-wreck")!.at);
  expect(viewStore.read(ctx).deep.codex.progress?.cutter).toBe(1);
  expect(viewStore.read(ctx).hint).toContain("fragment 1 of 2");

  // A cable run needs the cutter.
  stand(ctx, NODES.find(node => node.id === "cold-cable-wire")!.at);
  ctx.game.commands.run("deepward.interact", {});
  expect(viewStore.read(ctx).dive!.channel).toBeNull();
  expect(viewStore.read(ctx).hint).toContain("fabricator");

  // Scrap is worked by hand and lands in the cache.
  hold(ctx, NODES.find(node => node.id === "cold-scrap-polymer")!.at);
  expect(viewStore.read(ctx).dive!.cache.some(item => item.baseId === "polymer")).toBe(true);

  // A ration crate goes on the belt; Q eats from it once the body wants it.
  hold(ctx, SUPPLIES.find(supply => supply.id === "cold-ration-crate-1")!.at, 1.2);
  expect(viewStore.read(ctx).dive!.belt.ration).toBe(2);
  viewStore.update(ctx, v => ({ ...v, deep: { ...v.deep, body: { ...v.deep.body, values: { ...v.deep.body.values, food: 20 } } } }));
  ctx.game.commands.run("deepward.eat", {});
  expect(viewStore.read(ctx).dive!.belt.ration).toBe(1);
  expect(viewStore.read(ctx).deep.body.values.food).toBeCloseTo(65, 0);

  // Back up and out by rail: the belt's last ration goes into Marrow's galley.
  ride(ctx, "lift-cold-up");
  expect(viewStore.read(ctx).dive!.stratum).toBe("vault");
  const galley = marrowOf(ctx).num("marrow.food");
  stand(ctx, EXIT);
  ctx.game.commands.run("deepward.interact", {});
  await whenWritten(ctx);
  expect(viewStore.read(ctx).error).toBe("");
  expect(viewStore.read(ctx).mode).toBe("home");
  expect(marrowOf(ctx).num("marrow.food")).toBe(galley + 1);
  expect(viewStore.read(ctx).home.stash.some(item => item.baseId === "polymer")).toBe(true);

  // A fresh boot reads all of it back.
  const reloaded = await create();
  expect(viewStore.read(reloaded).deep.charted).toEqual(["vault", "cold"]);
  expect(viewStore.read(reloaded).deep.codex.progress?.cutter).toBe(1);
  expect(marrowOf(reloaded).num("marrow.food")).toBe(galley + 1);
});

test("the fabricator prints learned gear and builds bays, and Marrow runs them while you are gone", async () => {
  const ctx = await create();
  const stash = ["wire", "cells", "cells", "cells", "wire", "polymer"].map((kind, i) => rollItem(kind as "wire", 1, `seed:${i}`, `purchase-${i + 1}:${kind}`));
  viewStore.update(ctx, v => ({ ...v, home: { ...v.home, stash }, deep: { ...v.deep, codex: { discovered: { cutter: 1 }, progress: {} } }, panel: "fabricator" }));
  ctx.game.commands.run("deepward.print", { gear: "seal2" });
  expect(viewStore.read(ctx).error).toContain("Scan");
  ctx.game.commands.run("deepward.print", { gear: "cutter" });
  await whenWritten(ctx);
  expect(viewStore.read(ctx).error).toBe("");
  expect(viewStore.read(ctx).deep.gear).toEqual(["cutter"]);
  expect(viewStore.read(ctx).home.stash).toHaveLength(4);
  ctx.game.commands.run("deepward.build", { module: "generator" });
  ctx.game.commands.run("deepward.build", { module: "still" });
  await whenWritten(ctx);
  const base = marrowOf(ctx);
  expect(base.instances().map(instance => instance.kind).sort()).toEqual(["generator", "still"]);
  expect(viewStore.read(ctx).home.stash).toHaveLength(0);
  // The world model builds them and then the still fills the galley from the generator's power.
  for (let t = 0; t < 200; t += 0.5) marrowSpec.system.update?.(ctx, 0.5);
  expect(base.num("marrow.power")).toBe(2);
  expect(base.num("marrow.water")).toBeGreaterThan(4);
  ctx.game.commands.run("deepward.close", {});
  await whenWritten(ctx);
  const reloaded = await create();
  expect(viewStore.read(reloaded).deep.gear).toEqual(["cutter"]);
  expect(marrowOf(reloaded).instances()).toHaveLength(2);
});

test("pressure past the seal crushes the hull, and a courier that sees a lit diver strikes after its windup", async () => {
  const ctx = await create();
  // A diver who has the cage code and a crawler can be landed in the wells with an issue seal.
  marrowOf(ctx).set("story.signal", true);
  viewStore.update(ctx, v => ({ ...v, deep: { ...v.deep, charted: ["vault", "cold", "wells"], gear: ["crawler"] }, departTo: "wells" }));
  await depart(ctx);
  expect(viewStore.read(ctx).dive!.stratum).toBe("wells");
  const health = viewStore.read(ctx).dive!.health;
  stand(ctx, LIFTS.find(lift => lift.id === "lift-wells-up")!.at);
  run(ctx, 1);
  expect(viewStore.read(ctx).dive!.health).toBeLessThan(health - 5);
  expect(viewStore.read(ctx).hint).toContain("seal");
  // The crawler takes the up-lift all the way home.
  ctx.game.commands.run("deepward.interact", {});
  await whenWritten(ctx);
  expect(viewStore.read(ctx).mode).toBe("home");

  // In the cold stores (inside the issue seal), stand lit in front of the courier.
  viewStore.update(ctx, v => ({ ...v, departTo: "cold" }));
  await depart(ctx);
  const courier = Object.values(viewStore.read(ctx).dive!.fauna).find(creature => creature.id === "cold-courier-1")!;
  const near: Point = [courier.at[0], 0, courier.at[2] + 1.2];
  stand(ctx, near);
  ctx.game.commands.run("deepward.lamp", {});
  expect(viewStore.read(ctx).dive!.lamp).toBe(true);
  const before = viewStore.read(ctx).dive!.health;
  run(ctx, 3);
  expect(viewStore.read(ctx).dive!.health).toBeLessThanOrEqual(before - 16);
});

test("a thrown lure pulls a courier off a dark, still diver and is eaten; a hand flees a sprinting diver", () => {
  const senses = createSenses(species => createSpeciesSenses(species, () => "cold"));
  let dive = { ...newDive(1, { refits: [] }, null, { stratum: "cold" }) };
  const courier = dive.fauna["cold-courier-1"]!;
  const lureAt: Point = [courier.at[0] + 4, 0, courier.at[2]];
  dive = { ...dive, thrown: [{ id: "lure-1", at: lureAt, remaining: 25 }] };
  const far: Point = [0, 0, 16];
  let ate = false;
  for (let t = 0; t < 12 && !ate; t += 0.1) {
    broadcast(senses, { kind: "scent", sourceId: "lure-1", position: [lureAt[0], 0.4, lureAt[2]], loudness: 2, at: t * 1000 });
    const step = tickCreatures(dive, { id: "diver", at: far, lamp: false }, senses, 0.1, t * 1000);
    dive = { ...dive, fauna: step.fauna, thrown: step.thrown };
    ate = step.thrown.length === 0;
  }
  expect(ate).toBe(true);
  expect(Math.hypot(dive.fauna["cold-courier-1"]!.at[0] - lureAt[0], dive.fauna["cold-courier-1"]!.at[2] - lureAt[2])).toBeLessThan(2.5);

  const hand = dive.fauna["cold-hand-1"]!;
  const loud: Point = [hand.at[0] + 2, 0, hand.at[2]];
  const start = Math.hypot(hand.at[0] - loud[0], hand.at[2] - loud[2]);
  for (let t = 12; t < 15; t += 0.1) {
    broadcast(senses, { kind: "sound", sourceId: "diver", position: [loud[0], 1.2, loud[2]], loudness: 0.7, at: t * 1000 });
    dive = { ...dive, fauna: tickCreatures(dive, { id: "diver", at: loud, lamp: true }, senses, 0.1, t * 1000).fauna };
  }
  const fled = dive.fauna["cold-hand-1"]!;
  expect(fled.mode).toBe("flee");
  expect(Math.hypot(fled.at[0] - hand.at[0], fled.at[2] - hand.at[2])).toBeGreaterThan(1.5);
  expect(Math.hypot(fled.at[0] - loud[0], fled.at[2] - loud[2])).toBeGreaterThan(start);
});
