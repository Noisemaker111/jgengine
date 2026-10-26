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

test("a tame follows its owner and holds still when told to stay or knocked out", () => {
  const ctx = world();
  ctx.scene.entity.spawn("raptor", { id: "r1", position: [20, 0, 0], role: "npc" });
  const driver = createCreatureDriver();
  driver.add("r1", [20, 0, 0]);
  const record: CompanionRecord = { id: "r1", ownerId: "p1", sourceId: null, command: "follow", home: null, leash: 30, level: 1, unspentPoints: 0, stats: {} };
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
