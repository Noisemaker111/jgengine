import { test, expect } from "bun:test";
import { createGameRuntime } from "./gameRuntime";
import { parseSaveAutoMs, saveScopeIncludesPlayer } from "./save";
import { createRuntimeSnapshot, markPlayerDirty } from "./snapshot";
import { runCommand } from "./commandRunner";

test("parseSaveAutoMs", () => {
  expect(parseSaveAutoMs("5m")).toBe(300_000);
  expect(parseSaveAutoMs("3m")).toBe(180_000);
  expect(parseSaveAutoMs("1s")).toBe(1_000);
});

test("saveScopeIncludesPlayer", () => {
  expect(saveScopeIncludesPlayer("player+chunks")).toBe(true);
  expect(saveScopeIncludesPlayer("chunks")).toBe(false);
});

test("runCommand updates revision and dirty flags", () => {
  const snapshot = createRuntimeSnapshot({ gameId: "demo", serverId: "srv_1" });
  const result = runCommand(
    snapshot,
    {
      "demo.ping": {
        validate: () => null,
        apply: (state) => markPlayerDirty(state, "user_a"),
      },
    },
    "demo.ping",
    {},
    "user_a",
  );
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.snapshot.revision).toBe(1);
    expect(result.snapshot.dirty.players).toContain("user_a");
  }
});

test("createGameRuntime joinPlayer seeds player row", () => {
  const runtime = createGameRuntime({
    gameId: "demo",
    save: "none",
    commands: {},
    loop: {
      onNewPlayer(ctx) {
        if (!ctx.player.isNew) return;
        ctx.setSnapshot({
          ...ctx.snapshot,
          players: {
            ...ctx.snapshot.players,
            [ctx.player.userId]: {
              ...ctx.snapshot.players[ctx.player.userId],
              economy: { gold: 10 },
            },
          },
        });
      },
    },
  });

  const hydrated = runtime.hydrate({
    gameId: "demo",
    serverId: "srv_1",
    serverRow: { entities: [], objects: [], session: {} },
    playersByUserId: {},
    chunksByKey: {},
  });

  const joined = runtime.joinPlayer(hydrated, "user_a", true);
  expect(joined.players.user_a?.economy.gold).toBe(10);
});

test("hydrate invokes onInit once per boot before any onNewPlayer", () => {
  const calls: string[] = [];
  const runtime = createGameRuntime({
    gameId: "demo",
    save: "none",
    commands: {},
    loop: {
      onInit(ctx) {
        calls.push("init");
        ctx.setSnapshot({
          ...ctx.snapshot,
          server: { ...ctx.snapshot.server, session: { seeded: true } },
        });
      },
      onNewPlayer() {
        calls.push("newPlayer");
      },
    },
  });

  const input = {
    gameId: "demo",
    serverId: "srv_1",
    serverRow: { entities: [], objects: [], session: {} },
    playersByUserId: {},
    chunksByKey: {},
  };

  const first = runtime.hydrate(input);
  expect(first.server.session).toEqual({ seeded: true });
  runtime.joinPlayer(first, "user_a", true);
  runtime.hydrate(input);
  expect(calls).toEqual(["init", "newPlayer"]);
});

test("tick runs onTick once per world step with player id fan-in", () => {
  const ticks: Array<{ playerIds: string[]; dt: number }> = [];
  const runtime = createGameRuntime({
    gameId: "demo",
    save: "none",
    commands: {},
    loop: {
      onTick(ctx, dtSeconds) {
        ticks.push({ playerIds: [...ctx.playerIds], dt: dtSeconds });
        ctx.setSnapshot({
          ...ctx.snapshot,
          server: {
            ...ctx.snapshot.server,
            session: {
              ...ctx.snapshot.server.session,
              ticks: ((ctx.snapshot.server.session.ticks as number | undefined) ?? 0) + 1,
            },
          },
          revision: ctx.snapshot.revision + 1,
        });
      },
    },
  });

  let snapshot = runtime.hydrate({
    gameId: "demo",
    serverId: "srv_1",
    serverRow: { entities: [], objects: [], session: {} },
    playersByUserId: {},
    chunksByKey: {},
  });
  snapshot = runtime.joinPlayer(snapshot, "alice", true);
  snapshot = runtime.joinPlayer(snapshot, "bob", true);
  snapshot = runtime.tick(snapshot, 0.05);

  expect(ticks).toHaveLength(1);
  expect(ticks[0]?.playerIds.sort()).toEqual(["alice", "bob"]);
  expect(ticks[0]?.dt).toBe(0.05);
  expect(snapshot.server.session.ticks).toBe(1);
  expect(snapshot.revision).toBe(3);
});
