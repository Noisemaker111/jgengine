import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { gamePhase, setGamePhase } from "@jgengine/core/game/gamePhase";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { settleBootPhase } from "./bootPhase";
import { resetCharacterState } from "./characters";
import { registerCommands } from "./commands";

function bootContext(): GameContext {
  const ctx = createGameContext({
    definition: defineGameDefinition({
      name: "scrap-signal-boot-phase-test",
      assets: createAssetCatalog(),
      multiplayer: "off",
      features: { quest: true, trade: true },
    }),
    content: {},
    player: { userId: "p1", isNew: true },
  });
  ctx.scene.entity.spawn("player", { id: "p1", position: [0, 0, 0] });
  registerCommands(ctx);
  resetCharacterState();
  setGamePhase(ctx, "menu");
  return ctx;
}

describe("scrap-signal boot phase", () => {
  test("a boot with no run started settles on the front end", () => {
    const ctx = bootContext();
    setGamePhase(ctx, "playing");
    settleBootPhase(ctx);
    expect(gamePhase(ctx)).toBe("menu");
  });

  test("a pick made while the save loads keeps the run instead of reopening the menu", () => {
    const ctx = bootContext();
    ctx.game.commands.run("character.pick", { characterId: "gunk" });
    expect(gamePhase(ctx)).toBe("playing");
    settleBootPhase(ctx);
    expect(gamePhase(ctx)).toBe("playing");
  });
});
