import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { tickUnits } from "./ai/units";
import { content } from "./content";
import { GOLD } from "./tuning";
import { initResourceField, resetSession, session } from "./session";

function boot(): GameContext {
  const definition = defineGameDefinition({ name: "IronholdEconTest", multiplayer: "off" });
  return createGameContext({ definition, content, player: { userId: "commander", isNew: true } });
}

describe("worker gather economy (real context)", () => {
  test("a peasant hauls gold from the mine back to the Town Hall and deposits it", () => {
    const ctx = boot();
    resetSession();

    // Town Hall acts as the depot.
    ctx.scene.entity.spawn("keep_player", { id: "hall", position: [0, 0, 0], role: "npc" });
    session.units.set("hall", { id: "hall", catalogId: "keep_player", faction: "player", kind: "building", command: { kind: "idle" }, guardPoint: { x: 0, z: 0 }, leash: 0, attackCooldown: 0 });

    // A gold mine a short walk away.
    ctx.scene.entity.spawn("goldmine", { id: "mine", position: [6, 0, 0], role: "npc" });
    session.nodes.set("mine", { id: "mine", resource: "gold", x: 6, z: 0 });
    initResourceField();

    // A peasant ordered to gather it.
    ctx.scene.entity.spawn("peasant", { id: "p1", position: [1, 0, 0], role: "npc" });
    session.units.set("p1", {
      id: "p1",
      catalogId: "peasant",
      faction: "player",
      kind: "unit",
      command: { kind: "gather", nodeId: "mine", resource: GOLD, phase: "toNode", carried: 0, timer: 0 },
      leash: 0,
      attackCooldown: 0,
    });

    const before = ctx.game.economy.balance("commander", GOLD);
    for (let i = 0; i < 250; i++) tickUnits(ctx, 0.1);
    const after = ctx.game.economy.balance("commander", GOLD);

    expect(after).toBeGreaterThan(before); // at least one full haul deposited
  });

  test("a depleting mine eventually stops yielding", () => {
    const ctx = boot();
    resetSession();
    ctx.scene.entity.spawn("goldmine", { id: "mine", position: [0, 0, 0], role: "npc" });
    session.nodes.set("mine", { id: "mine", resource: "gold", x: 0, z: 0 });
    initResourceField();
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
