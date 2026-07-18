import { beforeEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { tick as tickQueue } from "@jgengine/core/gameplay";

import { tickUnits } from "./ai/units";
import { canResearch, registerCommands } from "./commands";
import { content } from "./content";
import { GOLD, LUMBER } from "./tuning";
import { resetSession, session, type UnitRuntime } from "./session";
import { grantResearch, RESEARCH_CONFIG, resolveDamage, upgradeRank } from "./upgrades";

function boot(): GameContext {
  const definition = defineGameDefinition({ name: "IronholdResearchTest", multiplayer: "off" });
  return createGameContext({ definition, content, player: { userId: "commander", isNew: true } });
}

function spawn(ctx: GameContext, catalogId: string, id: string, pos: EntityPosition, faction: "player" | "enemy", command: UnitRuntime["command"]): void {
  ctx.scene.entity.spawn(catalogId, { id, position: pos, role: "npc" });
  session.units.set(id, { id, catalogId, faction, kind: catalogId.startsWith("keep") || catalogId === "barracks" ? "building" : "unit", command, leash: 0, attackCooldown: 0 });
}

function health(ctx: GameContext, id: string): number {
  return ctx.scene.entity.stats.get(id, "health")?.current ?? -1;
}

/** Enemy HP left after a fixed melee exchange with a player footman at the given weapon rank. */
function enemyHealthAfterMelee(weaponsRank: number, ticks: number): number {
  const ctx = boot();
  resetSession();
  session.research.ranks.weapons = weaponsRank;
  spawn(ctx, "footman", "f1", [0, 0, 0], "player", { kind: "idle" });
  spawn(ctx, "grunt", "e1", [1.5, 0, 0], "enemy", { kind: "idle" });
  for (let i = 0; i < ticks; i += 1) tickUnits(ctx, 0.2);
  return health(ctx, "e1");
}

/** Player HP left after a fixed melee exchange against a grunt at the given armor rank. */
function playerHealthAfterMelee(armorRank: number, ticks: number): number {
  const ctx = boot();
  resetSession();
  session.research.ranks.armor = armorRank;
  spawn(ctx, "footman", "f1", [0, 0, 0], "player", { kind: "idle" });
  spawn(ctx, "grunt", "e1", [1.5, 0, 0], "enemy", { kind: "idle" });
  for (let i = 0; i < ticks; i += 1) tickUnits(ctx, 0.2);
  return health(ctx, "f1");
}

describe("upgrade math", () => {
  beforeEach(() => resetSession());

  test("Iron Weapons adds player damage; Iron Armor removes damage taken; enemy gets neither", () => {
    session.research.ranks.weapons = 2;
    session.research.ranks.armor = 1;
    // Player attacker: base 9 + 2×3 weapon = 15 onto an unarmoured enemy.
    expect(resolveDamage(9, "player", "enemy")).toBe(15);
    // Enemy attacker onto the player: base 8 − 1×2 armor = 6 (enemy has no weapon upgrade).
    expect(resolveDamage(8, "enemy", "player")).toBe(6);
  });

  test("a swing always chips at least 1 through heavy armor", () => {
    session.research.ranks.armor = 3; // −6 reduction
    expect(resolveDamage(4, "enemy", "player")).toBe(1);
  });
});

describe("research effect on real combat", () => {
  test("Iron Weapons makes player hits land harder", () => {
    expect(enemyHealthAfterMelee(2, 12)).toBeLessThan(enemyHealthAfterMelee(0, 12));
  });

  test("Iron Armor lets a footman weather a grunt longer", () => {
    expect(playerHealthAfterMelee(3, 16)).toBeGreaterThan(playerHealthAfterMelee(0, 16));
  });
});

describe("research economy + gating", () => {
  beforeEach(() => resetSession());

  test("Iron Weapons needs a Barracks, is affordable, and completes to a rank that costs gold", () => {
    const ctx = boot();
    registerCommands(ctx);
    // No Barracks yet → gated.
    ctx.game.economy.grant("commander", GOLD, 1000);
    ctx.game.economy.grant("commander", LUMBER, 1000);
    expect(canResearch(ctx, "weapons")).toBe(false);

    // Stand a Barracks; now it can be researched.
    spawn(ctx, "barracks", "rax", [0, 0, 0], "player", { kind: "idle" });
    expect(canResearch(ctx, "weapons")).toBe(true);

    const goldBefore = ctx.game.economy.balance("commander", GOLD);
    ctx.game.commands.run("research.weapons", {});
    expect(ctx.game.economy.balance("commander", GOLD)).toBeLessThan(goldBefore); // charged
    // A second start is blocked while rank 1 is still in the queue (can't research a rank twice).
    expect(canResearch(ctx, "weapons")).toBe(false);

    // Drive the research queue to completion, exactly as the system does.
    for (let i = 0; i < 200 && upgradeRank("weapons") < 1; i += 1) {
      const r = tickQueue(session.research.queue, RESEARCH_CONFIG, 0.5);
      session.research.queue = r.state;
      for (const e of r.events) if (e.type === "completed") grantResearch(e.output);
    }
    expect(upgradeRank("weapons")).toBe(1);
  });

  test("research stops at the rank cap", () => {
    const ctx = boot();
    registerCommands(ctx);
    ctx.game.economy.grant("commander", GOLD, 100000);
    ctx.game.economy.grant("commander", LUMBER, 100000);
    spawn(ctx, "barracks", "rax", [0, 0, 0], "player", { kind: "idle" });
    session.research.ranks.weapons = 3; // maxRank
    expect(canResearch(ctx, "weapons")).toBe(false);
  });
});
