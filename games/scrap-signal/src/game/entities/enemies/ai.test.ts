import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { huntTargetFor, noteShotNoise, tickFront } from "../../encounters/front";
import { tickEnemies } from "./ai";

describe("scrap-signal enemy ai", () => {
  test("an enemy that heard a shot still attacks the player standing next to it", () => {
    const ctx = createGameContext({
      definition: defineGameDefinition({ name: "scrap-ai-test", assets: createAssetCatalog(), multiplayer: "off" }),
      content: {},
      player: { userId: "p1", isNew: true },
    });
    ctx.scene.entity.spawn("player", { id: "p1", position: [0, 0, 0] });
    ctx.scene.entity.spawn("husk", { id: "husk_1", position: [1.2, 0, 0] });
    const attacks: string[] = [];
    const play = ctx.game.playEntityAnimation.bind(ctx.game);
    ctx.game.playEntityAnimation = (id, clip, ...rest) => {
      if (clip === "attack") attacks.push(id);
      return play(id, clip, ...rest);
    };

    noteShotNoise(ctx, "gun_test", [0, 0, 0]);
    tickFront(ctx, 1);
    expect(huntTargetFor(ctx, "husk_1")).not.toBeNull();

    tickEnemies(ctx, 0.1);
    expect(attacks).toContain("husk_1");
  });
});
