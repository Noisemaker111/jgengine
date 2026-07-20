import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { content } from "../content";
import { BASE_CATALOG_ID } from "../entities/base/catalog";
import { session } from "../session";
import { setupWorld } from "./setup";

/** Boot a real headless context and wire the defense (grants gold, spawns the keep, subscribes death). */
function boot(): GameContext {
  const definition = defineGameDefinition({ name: "TowerGuardPhaseTest", multiplayer: "off" });
  const ctx = createGameContext({ definition, content, player: { userId: "p1", isNew: true } });
  setupWorld(ctx);
  // The loop mirrors this after setupWorld; assert both the boot phase and the terminal transition.
  return ctx;
}

describe("tower-guard run phase", () => {
  test("the keep falling ends the run — game over reads as ended (dock off)", () => {
    const ctx = boot();
    expect(session.gameOver).toBe(false);
    ctx.game.events.emit("entity.died", {
      instanceId: BASE_CATALOG_ID,
      catalogId: BASE_CATALOG_ID,
      reason: { kind: "environment", source: "test" },
      position: [0, 0, 0],
    });
    expect(session.gameOver).toBe(true);
    expect(gamePhase(ctx)).toBe("ended");
  });
});
