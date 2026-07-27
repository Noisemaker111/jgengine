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

test("runCommand passes actor identity into validate and apply", () => {
  const snapshot = createRuntimeSnapshot({
    gameId: "demo",
    serverId: "srv_1",
    players: {
      user_a: {
        userId: "user_a",
        inventories: {},
        economy: { gold: 0 },
        unlocks: [],
        session: {},
      },
      user_b: {
        userId: "user_b",
        inventories: {},
        economy: { gold: 0 },
        unlocks: [],
        session: {},
      },
    },
  });
  let seenActor: string | undefined;
  const result = runCommand(
    snapshot,
    {
      "gold.grant": {
        validate: (_state, input: { userId: string }, actorUserId) => {
          seenActor = actorUserId;
          if (input.userId !== actorUserId) return { reason: "cannot grant gold to another player" };
          return null;
        },
        apply: (state, _input, actorUserId) => markPlayerDirty(state, actorUserId),
      },
    },
    "gold.grant",
    { userId: "user_b" },
    "user_a",
  );
  expect(seenActor).toBe("user_a");
  expect(result).toEqual({ ok: false, reason: "cannot grant gold to another player" });
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

test("joinPlayer marks server and player dirty, and a rejoin does not duplicate the dirty entry", () => {
  const runtime = createGameRuntime({ gameId: "demo", save: "none", commands: {} });
  const hydrated = runtime.hydrate({
    gameId: "demo",
    serverId: "srv_1",
    serverRow: { entities: [], objects: [], session: {} },
    playersByUserId: {},
    chunksByKey: {},
  });

  const joined = runtime.joinPlayer(hydrated, "alice", true);
  expect(joined.revision).toBe(1);
  expect(joined.dirty.server).toBe(true);
  expect(joined.dirty.players).toEqual(["alice"]);

  const rejoined = runtime.joinPlayer(joined, "alice", false);
  expect(rejoined.revision).toBe(2);
  expect(rejoined.dirty.players).toEqual(["alice"]);
});

test("joinPlayer preserves an already-seeded player row on rejoin instead of resetting it", () => {
  const runtime = createGameRuntime({ gameId: "demo", save: "none", commands: {} });
  const hydrated = runtime.hydrate({
    gameId: "demo",
    serverId: "srv_1",
    serverRow: { entities: [], objects: [], session: {} },
    playersByUserId: {
      alice: { userId: "alice", inventories: {}, economy: { gold: 42 }, unlocks: ["sword"], session: {} },
    },
    chunksByKey: {},
  });

  const rejoined = runtime.joinPlayer(hydrated, "alice", false);
  expect(rejoined.players.alice?.economy.gold).toBe(42);
  expect(rejoined.players.alice?.unlocks).toEqual(["sword"]);
});

test("toProfileRow returns null for an unknown player and a row for a known one", () => {
  const runtime = createGameRuntime({ gameId: "demo", save: "none", commands: {} });
  const hydrated = runtime.hydrate({
    gameId: "demo",
    serverId: "srv_1",
    serverRow: { entities: [], objects: [], session: {} },
    playersByUserId: {},
    chunksByKey: {},
  });

  expect(runtime.toProfileRow(hydrated, "ghost")).toBeNull();

  const joined = runtime.joinPlayer(hydrated, "alice", true);
  const row = runtime.toProfileRow(joined, "alice");
  expect(row?.userId).toBe("alice");
  expect(row?.gameId).toBe("demo");
  expect(row?.player.userId).toBe("alice");
});

test("tick with no onTick hook returns the same snapshot unchanged", () => {
  const runtime = createGameRuntime({ gameId: "demo", save: "none", commands: {} });
  const hydrated = runtime.hydrate({
    gameId: "demo",
    serverId: "srv_1",
    serverRow: { entities: [], objects: [], session: {} },
    playersByUserId: {},
    chunksByKey: {},
  });

  const ticked = runtime.tick(hydrated, 0.1);
  expect(ticked).toBe(hydrated);
  expect(ticked.revision).toBe(0);
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

test("the host clock reaches onInit, onNewPlayer, onTick, and a command", () => {
  const seen: Record<string, number | undefined> = {};
  const runtime = createGameRuntime({
    gameId: "demo",
    save: "none",
    commands: {
      "demo.stamp": {
        validate: (_snapshot, _input, _actor, nowMs) => {
          seen.validate = nowMs;
          return null;
        },
        apply: (snapshot, _input, _actor, nowMs) => {
          seen.apply = nowMs;
          return snapshot;
        },
      },
    },
    loop: {
      onInit: (ctx) => {
        seen.init = ctx.nowMs;
      },
      onNewPlayer: (ctx) => {
        seen.join = ctx.nowMs;
      },
      onTick: (ctx) => {
        seen.tick = ctx.nowMs;
      },
    },
  });

  let snapshot = runtime.hydrate({
    gameId: "demo",
    serverId: "srv_1",
    serverRow: { entities: [], objects: [], session: {} },
    playersByUserId: {},
    chunksByKey: {},
    nowMs: 1_000,
  });
  snapshot = runtime.joinPlayer(snapshot, "alice", true, 2_000);
  snapshot = runtime.tick(snapshot, 0.05, 3_000);
  runtime.runCommand(snapshot, "alice", "demo.stamp", {}, 4_000);

  expect(seen).toEqual({ init: 1_000, join: 2_000, tick: 3_000, validate: 4_000, apply: 4_000 });
});

test("a host that passes no clock gets the wall clock rather than zero", () => {
  let ticked: number | undefined;
  const runtime = createGameRuntime({
    gameId: "demo",
    save: "none",
    commands: {},
    loop: {
      onTick: (ctx) => {
        ticked = ctx.nowMs;
      },
    },
  });
  const before = Date.now();
  runtime.tick(
    runtime.hydrate({
      gameId: "demo",
      serverId: "srv_1",
      serverRow: { entities: [], objects: [], session: {} },
      playersByUserId: {},
      chunksByKey: {},
    }),
    0.05,
  );
  expect(ticked).toBeGreaterThanOrEqual(before);
});
