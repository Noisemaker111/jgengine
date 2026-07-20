import { afterEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { content } from "../content";
import { resetSession, session } from "../session";
import { setupSkirmish } from "./scene";

/** Boot a real headless context and wire the skirmish (spawns the roster, subscribes win/lose). */
function boot(): GameContext {
  const definition = defineGameDefinition({ name: "IronholdPhaseTest", multiplayer: "off" });
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

describe("ironhold run phase", () => {
  afterEach(() => resetSession());

  test("boots live into playing", () => {
    const ctx = boot();
    expect(gamePhase(ctx)).toBe("playing");
    expect(session.over).toBe(false);
  });

  test("razing the enemy keep wins the run — phase ends (dock off)", () => {
    const ctx = boot();
    killKeep(ctx, "keep_enemy");
    expect(session.over).toBe(true);
    expect(session.victory).toBe(true);
    expect(gamePhase(ctx)).toBe("ended");
  });

  test("losing the player keep ends the run — phase ends (dock off)", () => {
    const ctx = boot();
    killKeep(ctx, "keep_player");
    expect(session.over).toBe(true);
    expect(session.victory).toBe(false);
    expect(gamePhase(ctx)).toBe("ended");
  });
});
