import { afterEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { content } from "../content";
import { resetSession, session } from "../session";
import { setupSkirmish } from "./scene";
import { preferences } from "../preferences";
import { canTrain } from "../commands";

/** Boot a real headless context and wire the skirmish (spawns the roster, subscribes win/lose). */
function boot(): GameContext {
  const definition = defineGameDefinition({ name: "EmberCommandPhaseTest", multiplayer: "off" });
  const ctx = createGameContext({ definition, content, player: { userId: "p1", isNew: true } });
  setupSkirmish(ctx);
  return ctx;
}

/** Fake the death of one keep so the win/lose branch fires without a full combat sim. */
function killKeep(ctx: GameContext, catalogId: "keep_enemy" | "keep_player"): void {
  ctx.game.events.emit("entity.died", {
    instanceId: catalogId,
    catalogId,
    reason: { kind: "environment", source: "test" },
    position: [0, 0, 0],
  });
}

describe("ember-command run phase", () => {
  afterEach(() => resetSession());

  test("boots frozen at the title and starts through the command", () => {
    const ctx = boot();
    expect(gamePhase(ctx)).toBe("menu");
    expect(ctx.time.isPaused()).toBe(true);
    ctx.game.commands.run("match.start", {});
    expect(gamePhase(ctx)).toBe("playing");
    expect(ctx.time.isPaused()).toBe(false);
    expect(session.over).toBe(false);
  });

  test("razing the enemy keep wins the run — phase ends (dock off)", () => {
    const ctx = boot();
    ctx.game.commands.run("match.start", {});
    killKeep(ctx, "keep_enemy");
    expect(session.over).toBe(true);
    expect(session.victory).toBe(true);
    expect(gamePhase(ctx)).toBe("ended");
  });

  test("losing the player keep ends the run — phase ends (dock off)", () => {
    const ctx = boot();
    ctx.game.commands.run("match.start", {});
    killKeep(ctx, "keep_player");
    expect(session.over).toBe(true);
    expect(session.victory).toBe(false);
    expect(gamePhase(ctx)).toBe("ended");
  });

  test("pause gates spending and restart restores the roster, economy and one outcome listener", () => {
    const ctx = boot();
    const startingRoster = ctx.scene.entity.list().length;
    ctx.game.commands.run("match.start", {});
    ctx.game.commands.run("match.pause", {});
    expect(gamePhase(ctx)).toBe("paused");
    expect(ctx.time.isPaused()).toBe(true);
    expect(canTrain(ctx, "peasant")).toBe(false);
    ctx.game.commands.run("match.resume", {});
    expect(canTrain(ctx, "peasant")).toBe(true);
    ctx.game.economy.grant("p1", "gold", 1000);
    ctx.game.commands.run("match.restart", {});
    expect(ctx.game.economy.balance("p1", "gold")).toBe(250);
    expect(ctx.scene.entity.list().length).toBe(startingRoster);
    expect(gamePhase(ctx)).toBe("playing");
    const wins = preferences(ctx).get().wins;
    killKeep(ctx, "keep_enemy");
    killKeep(ctx, "keep_enemy");
    expect(preferences(ctx).get().wins).toBe(wins + 1);
    ctx.game.commands.run("match.title", {});
    expect(gamePhase(ctx)).toBe("menu");
    expect(ctx.time.isPaused()).toBe(true);
  });
});
