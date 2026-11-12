import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { tickUnits } from "./ai/units";
import { content } from "./content";
import { initResourceField, resetSession, session } from "./session";
import { earn, openTreasury, spend, treasuryBooks } from "./treasury";
import { GOLD, LUMBER, STARTING_GOLD, STARTING_LUMBER } from "./tuning";

function boot(): GameContext {
  const definition = defineGameDefinition({ name: "EmberCommandTreasuryTest", multiplayer: "off" });
  return createGameContext({ definition, content, player: { userId: "commander", isNew: true } });
}

const balance = (ctx: GameContext, currency: string) => ctx.game.economy.balance("commander", currency);

describe("the vale's stockpile moves only through its books", () => {
  test("opening, a haul, bounty, the trickle and spends each post their reason, and the history explains the balance", () => {
    const ctx = boot();
    resetSession();
    ctx.game.economy.grant("commander", GOLD, 999); // left over from a previous battle
    openTreasury(ctx, { [GOLD]: STARTING_GOLD, [LUMBER]: STARTING_LUMBER });
    expect(balance(ctx, GOLD)).toBe(STARTING_GOLD);
    expect(treasuryBooks(ctx).entries().map((entry) => [entry.reason, entry.currency, entry.amount])).toEqual([
      ["starting-stockpile", GOLD, STARTING_GOLD],
      ["starting-stockpile", LUMBER, STARTING_LUMBER],
    ]);

    // A peasant hauls lumber home: the deposit is booked as a harvest by that worker.
    ctx.scene.entity.spawn("keep_player", { id: "hall", position: [0, 0, 0], role: "npc" });
    session.units.set("hall", { id: "hall", catalogId: "keep_player", faction: "player", kind: "building", command: { kind: "idle" }, guardPoint: { x: 0, z: 0 }, leash: 0, attackCooldown: 0 });
    ctx.scene.entity.spawn("peasant", { id: "p1", position: [1, 0, 0], role: "npc" });
    session.nodes.set("wood", { id: "wood", resource: LUMBER, x: 6, z: 0 });
    initResourceField(() => 0.5);
    session.units.set("p1", { id: "p1", catalogId: "peasant", faction: "player", kind: "unit", command: { kind: "gather", nodeId: "wood", resource: LUMBER, phase: "toNode", carried: 0, timer: 0 }, leash: 0, attackCooldown: 0 });
    for (let i = 0; i < 250; i++) tickUnits(ctx, 0.1);
    const hauls = treasuryBooks(ctx).entries({ reason: "harvest" });
    expect(hauls.length).toBeGreaterThan(0);
    expect(hauls.every((entry) => entry.currency === LUMBER && entry.ref === "p1" && entry.amount > 0)).toBe(true);

    earn(ctx, GOLD, 5, "kill-bounty", "grunt");
    earn(ctx, GOLD, 1, "income-trickle");
    expect(spend(ctx, { [GOLD]: 120, [LUMBER]: 40 }, "build", "barracks")).toBe(true);
    // A cost the stockpile cannot cover moves nothing and books nothing.
    const entries = treasuryBooks(ctx).entries().length;
    expect(spend(ctx, { [GOLD]: 100_000 }, "train", "knight")).toBe(false);
    expect(treasuryBooks(ctx).entries().length).toBe(entries);

    for (const currency of [GOLD, LUMBER]) {
      const history = treasuryBooks(ctx).entries().filter((entry) => entry.currency === currency);
      expect(history.reduce((sum, entry) => sum + entry.amount, 0)).toBe(balance(ctx, currency));
    }
    expect(treasuryBooks(ctx).unexplained()).toEqual({ [GOLD]: 0, [LUMBER]: 0 });
    expect(treasuryBooks(ctx).totals()["build"]).toEqual({ count: 2, net: -160 });
  });
});
