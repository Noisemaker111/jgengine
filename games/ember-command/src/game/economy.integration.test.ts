import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { tickUnits } from "./ai/units";
import { registerCommands } from "./commands";
import { content } from "./content";
import { SUGAR } from "./tuning";
import { initResourceField, resetSession, session } from "./session";
import { HARVEST_SECONDS } from "./tuning";

function boot(): GameContext {
  const definition = defineGameDefinition({ name: "EmberCommandEconTest", multiplayer: "off" });
  return createGameContext({ definition, content, player: { userId: "commander", isNew: true } });
}

describe("worker gather economy (real context)", () => {
  test("a worker hauls sugar from the mine back to the Nest and deposits it", () => {
    const ctx = boot();
    resetSession();

    // Nest acts as the depot.
    ctx.scene.entity.spawn("keep_player", { id: "hall", position: [0, 0, 0], role: "npc" });
    session.units.set("hall", { id: "hall", catalogId: "keep_player", faction: "player", kind: "building", command: { kind: "idle" }, guardPoint: { x: 0, z: 0 }, leash: 0, attackCooldown: 0 });

    // A sugar mine a short walk away.
    ctx.scene.entity.spawn("crumbs", { id: "mine", position: [6, 0, 0], role: "npc" });
    session.nodes.set("mine", { id: "mine", catalogId: "crumbs", resource: "sugar", x: 6, z: 0 });
    initResourceField(() => 0.5);

    // A worker ordered to gather it.
    ctx.scene.entity.spawn("worker", { id: "p1", position: [1, 0, 0], role: "npc" });
    session.units.set("p1", {
      id: "p1",
      catalogId: "worker",
      faction: "player",
      kind: "unit",
      command: { kind: "gather", nodeId: "mine", resource: SUGAR, phase: "toNode", carried: 0, timer: 0 },
      leash: 0,
      attackCooldown: 0,
    });

    const before = ctx.game.economy.balance("commander", SUGAR);
    for (let i = 0; i < 250; i++) tickUnits(ctx, 0.1);
    const after = ctx.game.economy.balance("commander", SUGAR);

    expect(after).toBeGreaterThan(before); // at least one full haul deposited
  });

  test("a depleting mine eventually stops yielding", () => {
    const ctx = boot();
    resetSession();
    ctx.scene.entity.spawn("crumbs", { id: "mine", position: [0, 0, 0], role: "npc" });
    session.nodes.set("mine", { id: "mine", catalogId: "crumbs", resource: "sugar", x: 0, z: 0 });
    initResourceField(() => 0.5);
    const field = session.resourceField!;
    let hits = 0;
    for (let i = 0; i < 10000; i++) {
      const r = field.harvest("mine", { power: 1, defaultBias: 1 });
      if (!r.harvested) break;
      hits += 1;
    }
    expect(hits).toBeGreaterThan(0);
    expect(field.harvest("mine", { power: 1, defaultBias: 1 }).harvested).toBe(false);
  });
});

function gatherBoot(resource: "sugar" | "leaf", workers = 1): GameContext {
  const ctx = boot();
  resetSession();
  ctx.scene.entity.spawn("keep_player", { id: "hall", position: [0, 0, 0], role: "npc" });
  session.units.set("hall", { id: "hall", catalogId: "keep_player", faction: "player", kind: "building", command: { kind: "idle" }, guardPoint: { x: 0, z: 0 }, leash: 0, attackCooldown: 0 });
  session.nodes.set("node", { id: "node", catalogId: resource === "sugar" ? "crumbs" : "leaves", resource, x: 12, z: 0 });
  session.nodes.set("other", { id: "other", catalogId: resource === "sugar" ? "crumbs" : "leaves", resource, x: -12, z: 0 });
  initResourceField(() => 0.5);
  for (let i = 0; i < workers; i++) {
    const id = `worker${i}`;
    ctx.scene.entity.spawn("worker", { id, position: [12, 0, 0], role: "npc" });
    session.units.set(id, { id, catalogId: "worker", faction: "player", kind: "unit", command: { kind: "idle" }, leash: 0, attackCooldown: 0 });
  }
  registerCommands(ctx);
  orderNode(ctx, Array.from({ length: workers }, (_, i) => `worker${i}`));
  return ctx;
}

function orderNode(ctx: GameContext, selection = ["worker0"], x = 12): void {
  ctx.game.commands.run("unit.order", { selection, point: [x, 0, 0] });
}

describe("repeating a worker's current gather order", () => {
  for (const [resource, yieldAmount, budget] of [["sugar", 12, 600], ["leaf", 8, 500]] as const) {
    test(`preserves earned ${resource} and deposits it exactly once`, () => {
      const ctx = gatherBoot(resource);
      tickUnits(ctx, 0.1);
      tickUnits(ctx, HARVEST_SECONDS);
      const worker = session.units.get("worker0")!;
      expect(worker.command).toMatchObject({ kind: "gather", phase: "toDepot", carried: yieldAmount });
      expect(session.resourceField!.state("node").budget).toBe(budget - 1);
      const haul = worker.command;
      for (let repeat = 0; repeat < 3; repeat++) orderNode(ctx);
      expect(worker.command).toBe(haul);
      for (let frame = 0; frame < 100 && ctx.game.economy.balance("commander", resource) === 0; frame++) tickUnits(ctx, 0.1);
      expect(ctx.game.economy.balance("commander", resource)).toBe(yieldAmount);
      expect(worker.command).toMatchObject({ kind: "gather", phase: "toNode", carried: 0 });
      expect(session.resourceField!.state("node").budget).toBe(budget - 1);
      orderNode(ctx);
      tickUnits(ctx, 0);
      expect(ctx.game.economy.balance("commander", resource)).toBe(yieldAmount);
    });
  }

  test("preserves partial harvest time instead of restarting work", () => {
    const ctx = gatherBoot("sugar");
    tickUnits(ctx, 0.1);
    tickUnits(ctx, 1);
    const working = session.units.get("worker0")!.command;
    expect(working).toMatchObject({ kind: "gather", phase: "harvest", timer: HARVEST_SECONDS - 1 });
    orderNode(ctx);
    expect(session.units.get("worker0")!.command).toBe(working);
    tickUnits(ctx, HARVEST_SECONDS - 1);
    expect(session.units.get("worker0")!.command).toMatchObject({ kind: "gather", phase: "toDepot", carried: 12 });
    expect(session.resourceField!.state("node").budget).toBe(599);
  });

  test("a repeated order cannot erase the last load from a depleted mine", () => {
    const ctx = gatherBoot("sugar");
    // Exhaust the finite field through its public harvest API, leaving one final worker trip.
    const field = session.resourceField!;
    while (field.state("node").budget > 1) field.harvest("node", { power: 1, defaultBias: 1 });
    tickUnits(ctx, 0.1);
    tickUnits(ctx, HARVEST_SECONDS);
    expect(field.isDepleted("node")).toBe(true);
    expect(session.units.get("worker0")!.command).toMatchObject({ phase: "toDepot", carried: 12 });
    orderNode(ctx);
    for (let frame = 0; frame < 200; frame++) tickUnits(ctx, 0.1);
    expect(ctx.game.economy.balance("commander", "sugar")).toBe(12);
    expect(session.units.get("worker0")!.command).toEqual({ kind: "idle" });
    expect(field.state("node").budget).toBe(0);
    expect(field.harvest("node", { power: 1 }).harvested).toBe(false);
  });

  test("preserves each worker's haul in a mixed selection while ordering soldiers", () => {
    const ctx = gatherBoot("sugar", 2);
    ctx.scene.entity.spawn("soldier", { id: "soldier", position: [0, 0, 0], role: "npc" });
    session.units.set("soldier", { id: "soldier", catalogId: "soldier", faction: "player", kind: "unit", command: { kind: "idle" }, leash: 0, attackCooldown: 0 });
    tickUnits(ctx, 0.1);
    tickUnits(ctx, HARVEST_SECONDS);
    const hauls = [session.units.get("worker0")!.command, session.units.get("worker1")!.command];
    expect(hauls.every(command => command.kind === "gather" && command.carried === 12)).toBe(true);
    orderNode(ctx, ["worker0", "worker1", "soldier"]);
    expect(session.units.get("worker0")!.command).toBe(hauls[0]);
    expect(session.units.get("worker1")!.command).toBe(hauls[1]);
    expect(session.units.get("soldier")!.command.kind).toBe("move");
    for (let frame = 0; frame < 100 && ctx.game.economy.balance("commander", "sugar") < 24; frame++) tickUnits(ctx, 0.1);
    expect(ctx.game.economy.balance("commander", "sugar")).toBe(24);
    expect(session.resourceField!.state("node").budget).toBe(598);
  });

  test("a different node still replaces the gathering intent", () => {
    const ctx = gatherBoot("sugar");
    tickUnits(ctx, 0.1);
    const previous = session.units.get("worker0")!.command;
    orderNode(ctx, ["worker0"], -12);
    expect(session.units.get("worker0")!.command).not.toBe(previous);
    expect(session.units.get("worker0")!.command).toEqual({ kind: "gather", nodeId: "other", resource: "sugar", phase: "toNode", carried: 0, timer: 0 });
  });

  test("a changed resource is a new intent even with the same node identity", () => {
    const ctx = gatherBoot("sugar");
    tickUnits(ctx, 0.1);
    session.nodes.get("node")!.resource = "leaf";
    orderNode(ctx);
    expect(session.units.get("worker0")!.command).toEqual({ kind: "gather", nodeId: "node", resource: "leaf", phase: "toNode", carried: 0, timer: 0 });
  });

  test("moving away still replaces a gathering intent", () => {
    const ctx = gatherBoot("sugar");
    tickUnits(ctx, 0.1);
    ctx.game.commands.run("unit.order", { selection: ["worker0"], point: [0, 0, 24] });
    expect(session.units.get("worker0")!.command.kind).toBe("move");
  });
});
