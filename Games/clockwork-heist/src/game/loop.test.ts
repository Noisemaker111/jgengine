import { describe, expect, test } from "bun:test";
import { defineGame } from "@jgengine/core/game/defineGame";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { content } from "./content";
import { NORMAL_WALK_SPEED, SNEAK_WALK_SPEED } from "./entities/player";
import { heistStore } from "./state/heistState";
import { lifecycle, onInit, onNewPlayer } from "../loop";
import { world } from "../world";

function boot(): GameContext {
  const ctx = createGameContext({
    definition: defineGame({ name: "ClockworkHeistTest", assets: createAssetCatalog(), multiplayer: "off", world, lifecycle }),
    content,
    player: { userId: "p1", isNew: true },
  });
  onInit(ctx);
  onNewPlayer(ctx);
  return ctx;
}

describe("clockwork-heist lifecycle", () => {
  test("registers startHeist (renamed) and restart (default) commands", () => {
    const ctx = boot();
    expect(ctx.game.commands.has("startHeist")).toBe(true);
    expect(ctx.game.commands.has("restart")).toBe(true);
    expect(ctx.game.commands.has("start")).toBe(false);
  });

  test("startHeist begins the run and derives the playing phase", () => {
    const ctx = boot();
    ctx.game.commands.run("startHeist", {});
    expect(heistStore.read(ctx).status).toBe("playing");
    expect(gamePhase(ctx)).toBe("playing");
  });

  test("restart resets the heist, sneaking speed, and player pose", () => {
    const ctx = boot();
    ctx.game.commands.run("startHeist", {});
    ctx.scene.entity.update("p1", { movement: { walkSpeed: SNEAK_WALK_SPEED } });

    ctx.game.commands.run("restart", {});

    const heist = heistStore.read(ctx);
    expect(heist.status).toBe("playing");
    expect(heist.strikes).toBe(0);
    expect(gamePhase(ctx)).toBe("playing");
    expect(ctx.scene.entity.get("p1")?.movement?.walkSpeed).toBe(NORMAL_WALK_SPEED);
  });
});
