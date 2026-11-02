import { describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { boundCellStreaming, type CellStreaming } from "@jgengine/core/visibility/cellStreaming";

import { game } from "../../game.config";
import { loop } from "../../loop";
import { content } from "../content";
import { restartStreaming, tickStreaming } from "./streaming";

function streamingOf(ctx: GameContext): CellStreaming {
  const streaming = boundCellStreaming(ctx);
  if (streaming === null) throw new Error("Harbor Heat did not bind its streaming");
  return streaming;
}

function boot() {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "stream-test", isNew: true } });
  loop.onInit(ctx);
  loop.onNewPlayer(ctx);
  return ctx;
}

describe("Harbor Heat streams the city by block", () => {
  test("blocks out of reach of the spawn are parked at boot, yet a save still holds every prop", () => {
    const ctx = boot();
    const streaming = streamingOf(ctx);
    const live = ctx.scene.object.ids().length;
    const saved = ctx.scene.object.snapshot().length;
    expect(live).toBeLessThan(saved);
    expect(streaming.stats().unloaded).toBeGreaterThan(0);
    expect(streaming.state(streaming.cellAt(250, -250))).toBe("unloaded");
    expect(ctx.scene.object.inBox([250 - 64, -1e4, -250 - 64], [250 + 64, 1e4, -250 + 64]).length).toBe(0);
  });

  test("walking to the far corner brings its block back and parks the spawn's", () => {
    const ctx = boot();
    const streaming = streamingOf(ctx);
    const before = ctx.scene.object.snapshot().length;
    const corner = streaming.cellAt(250, -250);
    const spawnCell = streaming.cellAt(-190, 40);
    ctx.scene.entity.setPose(ctx.player.userId, { position: [250, 2, -250] });
    for (let i = 0; i < 200 && streaming.state(corner) !== "ready"; i += 1) tickStreaming(ctx);
    expect(streaming.state(corner)).toBe("ready");
    expect(ctx.scene.object.inBox([250 - 64, -1e4, -250 - 64], [250 + 64, 1e4, -250 + 64]).length).toBeGreaterThan(0);
    for (let i = 0; i < 200 && streaming.state(spawnCell) !== "unloaded"; i += 1) tickStreaming(ctx);
    expect(streaming.state(spawnCell)).toBe("unloaded");
    expect(ctx.scene.object.snapshot().length).toBe(before);
  });

  test("a restored snapshot streams again from where the player stands", () => {
    const ctx = boot();
    const all = ctx.scene.object.snapshot();
    ctx.scene.object.hydrate(all);
    ctx.scene.entity.setPose(ctx.player.userId, { position: [250, 2, -250] });
    restartStreaming(ctx);
    const streaming = streamingOf(ctx);
    expect(streaming.state(streaming.cellAt(250, -250))).toBe("ready");
    expect(streaming.state(streaming.cellAt(-190, 40))).toBe("unloaded");
    expect(ctx.scene.object.snapshot().length).toBe(all.length);
  });
});
