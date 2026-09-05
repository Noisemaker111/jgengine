import { expect, test } from "bun:test";
import { createGameRuntime, initialPlayerState } from "./gameRuntime";

test("profile resets rerun the join initializer on a fresh player with the host clock", () => {
  const runtime = createGameRuntime({ gameId: "test", save: "none", commands: {}, loop: {
    onNewPlayer(ctx) {
      const id = ctx.player.userId;
      ctx.snapshot.players[id]!.economy.cash = 50;
      ctx.snapshot.players[id]!.session = { createdAt: ctx.nowMs, isNew: ctx.player.isNew };
    },
  } });
  const first = initialPlayerState(runtime, "alice", 1000);
  first.economy.cash = -100;
  expect(initialPlayerState(runtime, "alice", 2000)).toMatchObject({
    userId: "alice", economy: { cash: 50 }, session: { createdAt: 2000, isNew: true },
  });
  expect(initialPlayerState(createGameRuntime({ gameId: "test", save: "none", commands: {} }), "bob").economy).toEqual({});
});
