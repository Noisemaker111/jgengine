import { expect, test } from "bun:test";

import { defineGameDefinition } from "../game/defineGame";
import { createGameContext } from "../runtime/gameContext";
import { resolveCompanionIntent, type CompanionRecord } from "../scene/companion";

import { createCreatureDriver, type CreatureBody } from "./creatureDriver";

function world() {
  const definition = defineGameDefinition({ name: "Creatures", multiplayer: "off" });
  const ctx = createGameContext({ definition, content: {}, player: { userId: "p1", isNew: true } });
  ctx.scene.entity.spawn("player", { id: "p1", position: [0, 0, 0], role: "player" });
  return ctx;
}

const GRAZER: CreatureBody = { walk: 1, sprint: 3, attack: null, wander: { radius: 6, linger: [0, 0] } };
const HUNTER: CreatureBody = { walk: 4.8, sprint: 9.9, attack: { effect: "damage", amount: 15, interval: 0.8, reach: 2 } };

function run(ctx: ReturnType<typeof world>, seconds: number, tick: (dt: number) => void): void {
  for (let t = 0; t < seconds; t += 0.1) {
    ctx.time.advance(0.1);
    tick(0.1);
  }
}

test("an oblivious grazer ignores a survivor beside it until it is hit, then runs from them", () => {
  const ctx = world();
  ctx.scene.entity.spawn("dodo", { id: "d1", position: [3, 0, 0], role: "npc" });
  const driver = createCreatureDriver({ rng: () => 0.5 });
  driver.add("d1", [3, 0, 0]);
  const oblivious = { kind: "wild" as const, temperament: { kind: "passive" as const, fleeRange: 0 } };
  run(ctx, 2, (dt) => expect(driver.step(ctx, "d1", oblivious, GRAZER, dt).mode).not.toBe("flee"));
  const before = ctx.scene.entity.distance("d1", "p1")!;
  driver.hurt(ctx, "d1", "p1");
  let fled = false;
  run(ctx, 2, (dt) => {
    if (driver.step(ctx, "d1", oblivious, GRAZER, dt).mode === "flee") fled = true;
  });
  expect(fled).toBe(true);
  expect(ctx.scene.entity.distance("d1", "p1")!).toBeGreaterThan(before + 3);
});

test("an aggressive hunter closes on a survivor it sees and bites on its interval", () => {
  const ctx = world();
  ctx.scene.entity.spawn("raptor", { id: "r1", position: [15, 0, 0], role: "npc" });
  const driver = createCreatureDriver();
  driver.add("r1", [15, 0, 0]);
  const aggressive = { kind: "wild" as const, temperament: { kind: "predator" as const, attackRange: 2, breakAt: 0 } };
  let bites = 0;
  run(ctx, 4, (dt) => (bites += driver.step(ctx, "r1", aggressive, HUNTER, dt).struck ? 1 : 0));
  expect(ctx.scene.entity.distance("r1", "p1")!).toBeLessThanOrEqual(2);
  // Reaching the survivor takes about 1.4 s at a sprint; the rest of the four seconds is bites every 0.8 s.
  expect(bites).toBeGreaterThanOrEqual(3);
  expect(bites).toBeLessThanOrEqual(4);
});

test("a hunter charges to where its body reaches, whatever range its temperament was tuned with", () => {
  const ctx = world();
  ctx.scene.entity.spawn("raptor", { id: "r1", position: [0, 0, 8], role: "npc" });
  const driver = createCreatureDriver();
  driver.add("r1", [0, 0, 8]);
  // Tuned for a 1 m strike, but this body bites at 2 m: it must not stall in between.
  const aggressive = { kind: "wild" as const, temperament: { kind: "predator" as const, attackRange: 1, breakAt: 0 } };
  let bites = 0;
  run(ctx, 3, (dt) => (bites += driver.step(ctx, "r1", aggressive, HUNTER, dt).struck ? 1 : 0));
  expect(bites).toBeGreaterThan(0);
});

test("a hunter blocked head-on by a trunk veers around it instead of standing behind it", () => {
  const ctx = world();
  // A tree trunk right between the raptor and the survivor, square to its line of approach.
  ctx.world.solids.set("trees", [{ center: [0, 1, 4], halfExtents: [0.6, 1, 0.6] }]);
  ctx.scene.entity.spawn("raptor", { id: "r1", position: [0, 0, 12], role: "npc" });
  const driver = createCreatureDriver();
  driver.add("r1", [0, 0, 12]);
  const aggressive = { kind: "wild" as const, temperament: { kind: "predator" as const, attackRange: 2, breakAt: 0 } };
  let bites = 0;
  run(ctx, 6, (dt) => (bites += driver.step(ctx, "r1", aggressive, HUNTER, dt).struck ? 1 : 0));
  expect(ctx.scene.entity.distance("r1", "p1")!).toBeLessThanOrEqual(2);
  expect(bites).toBeGreaterThan(0);
});

test("a tame follows its owner and holds still when told to stay or knocked out", () => {
  const ctx = world();
  ctx.scene.entity.spawn("raptor", { id: "r1", position: [20, 0, 0], role: "npc" });
  const driver = createCreatureDriver();
  driver.add("r1", [20, 0, 0]);
  const record: CompanionRecord = { id: "r1", ownerId: "p1", sourceId: null, command: "follow", stance: "neutral", home: null, leash: 30, level: 1, unspentPoints: 0, stats: {} };
  run(ctx, 4, (dt) => driver.step(ctx, "r1", { kind: "tamed", intent: resolveCompanionIntent(record, { ownerPosition: [0, 0, 0] }) }, HUNTER, dt));
  expect(ctx.scene.entity.distance("r1", "p1")!).toBeLessThan(3.5);

  const stay = { ...record, command: "stay" as const, home: [3, 0, 0] as const };
  ctx.scene.entity.setPose("p1", { position: [-30, 0, 0] });
  run(ctx, 2, (dt) => driver.step(ctx, "r1", { kind: "tamed", intent: resolveCompanionIntent(stay, { ownerPosition: [-30, 0, 0] }) }, HUNTER, dt));
  const held = ctx.scene.entity.get("r1")!.position[0];
  expect(Math.abs(held - 3)).toBeLessThan(1);

  run(ctx, 2, (dt) => driver.step(ctx, "r1", { kind: "still" }, HUNTER, dt));
  expect(ctx.scene.entity.get("r1")!.position[0]).toBe(held);
});

test("a skittish grazer runs from a survivor who comes close, and its den round-trips", () => {
  const ctx = world();
  ctx.scene.entity.spawn("phiomia", { id: "ph", position: [5, 0, 0], role: "npc" });
  const driver = createCreatureDriver();
  driver.add("ph", [5, 0, 0]);
  const skittish = { kind: "wild" as const, temperament: { kind: "passive" as const, fleeRange: 10 } };
  run(ctx, 1, (dt) => driver.step(ctx, "ph", skittish, GRAZER, dt));
  expect(ctx.scene.entity.get("ph")!.position[0]).toBeGreaterThan(6.5);

  driver.setHome("ph", [40, 0, 0]);
  const saved = JSON.parse(JSON.stringify(driver.snapshot()));
  driver.reset();
  expect(driver.state("ph")).toBeNull();
  driver.restore(saved);
  expect(driver.state("ph")!.home).toEqual([40, 0, 0]);
});

test("a hunter that has just bitten cannot bite again until its interval has run out", () => {
  const ctx = world();
  ctx.scene.entity.spawn("raptor", { id: "r1", position: [1, 0, 0], role: "npc" });
  const driver = createCreatureDriver();
  driver.add("r1", [1, 0, 0]);
  const aggressive = { kind: "wild" as const, temperament: { kind: "predator" as const, attackRange: 2, breakAt: 0 } };
  const struck: number[] = [];
  for (let step = 0; step < 20; step += 1) {
    if (driver.step(ctx, "r1", aggressive, HUNTER, 0.1).struck) struck.push(step);
  }
  expect(struck.length).toBeGreaterThanOrEqual(2);
  const gaps = struck.slice(1).map((step, i) => step - (struck[i] ?? 0));
  for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(8);
});

test("a hunter with a targeting preference goes for the target it prefers, not the nearest", () => {
  const ctx = world();
  ctx.scene.entity.spawn("player", { id: "p2", position: [0, 0, 14], role: "player" });
  ctx.scene.entity.spawn("raptor", { id: "r1", position: [0, 0, 4], role: "npc" });
  const driver = createCreatureDriver();
  driver.add("r1", [0, 0, 4]);
  const plain = { kind: "wild" as const, temperament: { kind: "predator" as const, attackRange: 2, breakAt: 0 } };
  expect(driver.step(ctx, "r1", plain, HUNTER, 0.1).targetId).toBe("p1");
  const prefersP2 = { ...plain, focus: (id: string) => (id === "p2" ? 1 : 0) };
  expect(driver.step(ctx, "r1", prefersP2, HUNTER, 0.1).targetId).toBe("p2");
});

test("a light-drawn grazer walks toward a lit survivor the driver is told about", () => {
  const ctx = world();
  ctx.scene.entity.spawn("moth", { id: "m1", position: [0, 0, 16], role: "npc" });
  const driver = createCreatureDriver({ rng: () => 0.5 });
  driver.add("m1", [0, 0, 16]);
  const drawn = { kind: "wild" as const, temperament: { kind: "passive" as const, fleeRange: 2, light: "attracted" as const }, lightOf: () => 1 };
  expect(driver.step(ctx, "m1", drawn, GRAZER, 0.1).mode).toBe("investigate");
  expect(driver.step(ctx, "m1", { ...drawn, lightOf: () => 0 }, GRAZER, 0.1).mode).not.toBe("investigate");
});

test("terrain: a land creature keeps off blocked ground, a water creature never leaves the water and swims under its surface, an amphibious one goes both ways", () => {
  // Water east of x = 10, a surface at height 0 over a seabed at -3; dry land west of it at height 1.
  const definition = defineGameDefinition({ name: "Shore", multiplayer: "off" });
  const ctx = createGameContext({ definition, content: {}, player: { userId: "p1", isNew: true } });
  ctx.scene.entity.spawn("player", { id: "p1", position: [-20, 0, 0], role: "player" });
  const wet = (x: number) => x > 10;
  (ctx.world as { groundHeightAt: (x: number, z: number) => number }).groundHeightAt = (x) => (wet(x) ? -3 : 1);
  const driver = createCreatureDriver({
    rng: () => 0.5,
    blocked: (_ctx, x) => wet(x),
    waterSurface: (_ctx, x) => (wet(x) ? 0 : null),
  });
  const swim = (id: string, start: number, terrain: "land" | "water" | "amphibious") => {
    ctx.scene.entity.spawn("bot", { id, position: [start, wet(start) ? -0.6 : 1, 0], role: "npc" });
    driver.add(id, [start, 0, 0]);
    const body: CreatureBody = { walk: 4, sprint: 6, attack: null, terrain };
    const mind = { kind: "tamed" as const, intent: { kind: "follow" as const, targetId: null, leashTo: [start < 10 ? 30 : -30, 0, 0] as [number, number, number], anchor: "home" as const } };
    run(ctx, 8, (dt) => driver.step(ctx, id, mind, body, dt));
    return ctx.scene.entity.get(id)!.position;
  };
  const walker = swim("walker", 0, "land");
  expect(walker[0]).toBeLessThanOrEqual(10.01);
  const fish = swim("fish", 20, "water");
  expect(fish[0]).toBeGreaterThan(10);
  expect(fish[1]).toBeCloseTo(-0.6, 5);
  const frog = swim("frog", 0, "amphibious");
  expect(frog[0]).toBeGreaterThan(20);
  expect(frog[1]).toBeCloseTo(-0.6, 5);
});
