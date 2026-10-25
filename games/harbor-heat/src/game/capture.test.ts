import { describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";

import { game } from "../game.config";
import { loop } from "../loop";
import { content } from "./content";
import { stageChase, stageReadout } from "./capture";

function boot() {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "chase-test", isNew: true } });
  loop.onInit(ctx);
  loop.onNewPlayer(ctx);
  ctx.game.commands.run("game.start", {});
  return ctx;
}

describe("staged chase capture", () => {
  test("three stars puts cruisers on the scene with the player driving", () => {
    const ctx = boot();
    stageChase(ctx, "chase");
    const read = stageReadout(ctx);
    console.log("chase readout", read);
    expect(read.stars).toBeGreaterThanOrEqual(3);
    expect(read.cruisers).toBeGreaterThan(0);
    expect(read.driving).toBe(true);
  });

  test("reproduces from a fresh boot", () => {
    const first = boot();
    stageChase(first, "chase");
    const read = stageReadout(first);
    const second = boot();
    stageChase(second, "chase");
    expect(stageReadout(second)).toEqual(read);
  });
});
