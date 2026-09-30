import { expect, test } from "bun:test";
import { defineGameDefinition } from "../game/defineGame";
import { createAssetCatalog } from "../scene/assetCatalog";
import { bindCommandTransport, dispatchCommand } from "./commandDispatch";
import { createGameContext } from "./gameContext";
import type { GameRuntimeTransport } from "./transport";

test("hosted dispatch awaits acknowledgement, rejects before join and never applies to the replica", async () => {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "dispatch", assets: createAssetCatalog(), multiplayer: "off" }),
    content: {}, player: { userId: "alice", isNew: true },
  });
  let local = 0;
  ctx.game.commands.define("buy", { apply: () => { local++; } });
  const sent: unknown[] = [];
  let serverId: string | null = null;
  let acknowledge!: (result: { ok: true } | { ok: false; reason: string }) => void;
  const transport: GameRuntimeTransport = {
    joinServer: async () => ({ ok: true, serverId: "room", isNew: true }), leaveServer: async () => {},
    runCommand: (args) => { sent.push(args); return new Promise((resolve) => { acknowledge = resolve; }); },
  };
  const unbind = bindCommandTransport(ctx, { transport, serverId: () => serverId });
  expect(await dispatchCommand(ctx, "buy", {})).toEqual({ status: "rejected", reason: "not-joined" });
  serverId = "room";
  const pending = dispatchCommand(ctx, "buy", { count: 2 });
  expect(pending).toBeInstanceOf(Promise);
  expect(local).toBe(0);
  expect(sent).toEqual([{ serverId: "room", command: "buy", input: { count: 2 } }]);
  acknowledge({ ok: false, reason: "insufficient-funds" });
  expect(await pending).toEqual({ status: "rejected", reason: "insufficient-funds" });
  const accepted = dispatchCommand(ctx, "buy", {});
  acknowledge({ ok: true });
  expect((await accepted).status).toBe("applied");
  expect(local).toBe(0);
  unbind();
  expect(dispatchCommand(ctx, "buy", {})).toEqual({ status: "applied", state: ctx });
  expect(local).toBe(1);
});
