import { expect, test } from "bun:test";

import { createGameRuntime } from "@jgengine/core/runtime/gameRuntime";
import type { GameRuntimeSnapshot } from "@jgengine/core/runtime/snapshot";

import { createGameHost, memoryPersistence, OP_LEDGER_LIMIT } from "./host";

function coinsRuntime() {
  return createGameRuntime({
    gameId: "shop",
    save: "none",
    commands: {
      buy: {
        validate: () => null,
        apply: (snapshot: GameRuntimeSnapshot) => {
          const coins = (snapshot.server.session.coins as number | undefined) ?? 0;
          return {
            ...snapshot,
            server: { ...snapshot.server, session: { ...snapshot.server.session, coins: coins + 1 } },
          };
        },
      },
    },
  });
}

function coinsOf(view: { serverState: unknown } | null): number {
  return ((view?.serverState as { session: { coins?: number } } | undefined)?.session.coins) ?? 0;
}

test("private server is absent from listOpenServers", async () => {
  const host = createGameHost({ persistence: memoryPersistence() });
  const { serverId: publicId } = await host.joinServer({ userId: "alice", gameId: "demo" });
  const { serverId: privateId } = await host.joinServer({
    userId: "bob",
    gameId: "demo",
    attributes: { visibility: "private", joinCode: "SECRET1" },
  });
  expect(privateId).not.toBe(publicId);

  const listings = await host.listOpenServers({ gameId: "demo" });
  expect(listings.map((listing) => listing.serverId)).toEqual([publicId]);
});

test("private server is absent from browseServers", async () => {
  const host = createGameHost({ persistence: memoryPersistence() });
  await host.joinServer({ userId: "alice", gameId: "demo" });
  await host.joinServer({
    userId: "bob",
    gameId: "demo",
    attributes: { visibility: "private", joinCode: "SECRET1" },
  });

  const listings = await host.browseServers({ gameId: "demo" });
  expect(listings.every((listing) => listing.visibility !== "private")).toBe(true);
});

test("a direct-serverId join to a private server without the code is rejected", async () => {
  const host = createGameHost({ persistence: memoryPersistence() });
  const { serverId } = await host.joinServer({
    userId: "bob",
    gameId: "demo",
    attributes: { visibility: "private", joinCode: "SECRET1" },
  });

  await expect(host.joinServer({ userId: "carol", gameId: "demo", serverId })).rejects.toThrow(
    "Server is private",
  );
  await expect(
    host.joinServer({ userId: "carol", gameId: "demo", serverId, code: "WRONGCODE" }),
  ).rejects.toThrow("Server is private");
  expect(await host.isMember({ userId: "carol", serverId })).toBe(false);
});

test("a direct-serverId join to a private server with the correct code is accepted", async () => {
  const host = createGameHost({ persistence: memoryPersistence() });
  const { serverId } = await host.joinServer({
    userId: "bob",
    gameId: "demo",
    attributes: { visibility: "private", joinCode: "SECRET1" },
  });

  const result = await host.joinServer({ userId: "carol", gameId: "demo", serverId, code: "secret1" });
  expect(result.serverId).toBe(serverId);
  expect(await host.isMember({ userId: "carol", serverId })).toBe(true);
});

test("an existing member can rejoin a private server directly without a code", async () => {
  const host = createGameHost({ persistence: memoryPersistence() });
  const { serverId } = await host.joinServer({
    userId: "bob",
    gameId: "demo",
    attributes: { visibility: "private", joinCode: "SECRET1" },
  });

  const rejoined = await host.joinServer({ userId: "bob", gameId: "demo", serverId });
  expect(rejoined.serverId).toBe(serverId);
});

test("joinByCode resolves a private server by its code", async () => {
  const host = createGameHost({ persistence: memoryPersistence() });
  const { serverId } = await host.joinServer({
    userId: "bob",
    gameId: "demo",
    attributes: { visibility: "private", joinCode: "SECRET1" },
  });

  const result = await host.joinByCode({ userId: "carol", gameId: "demo", code: "SECRET1" });
  expect(result?.serverId).toBe(serverId);
});

test("direct-serverId join to a public server needs no code", async () => {
  const host = createGameHost({ persistence: memoryPersistence() });
  const { serverId } = await host.joinServer({ userId: "alice", gameId: "demo" });

  const rejoined = await host.joinServer({ userId: "bob", gameId: "demo", serverId });
  expect(rejoined.serverId).toBe(serverId);
});

test("a replayed op ID after a lost reply mutates once and both calls resolve", async () => {
  const host = createGameHost({ persistence: memoryPersistence(), runtimes: [coinsRuntime()] });
  const { serverId } = await host.joinServer({ userId: "alice", gameId: "shop" });

  const envelope = { qty: 1, __jgWsOpId: "op-1" };
  const first = await host.runCommand({ userId: "alice", serverId, command: "buy", input: envelope });
  const second = await host.runCommand({ userId: "alice", serverId, command: "buy", input: envelope });

  expect(first).toEqual({ ok: true });
  expect(second).toEqual({ ok: true });
  expect(coinsOf(await host.getServerView({ userId: "alice", serverId }))).toBe(1);
});

test("two distinct op IDs each apply their own mutation", async () => {
  const host = createGameHost({ persistence: memoryPersistence(), runtimes: [coinsRuntime()] });
  const { serverId } = await host.joinServer({ userId: "alice", gameId: "shop" });

  await host.runCommand({ userId: "alice", serverId, command: "buy", input: { __jgWsOpId: "op-1" } });
  await host.runCommand({ userId: "alice", serverId, command: "buy", input: { __jgWsOpId: "op-2" } });

  expect(coinsOf(await host.getServerView({ userId: "alice", serverId }))).toBe(2);
});

test("the op ledger evicts the oldest ID once past its bound", async () => {
  const host = createGameHost({ persistence: memoryPersistence(), runtimes: [coinsRuntime()] });
  const { serverId } = await host.joinServer({ userId: "alice", gameId: "shop" });

  for (let i = 0; i < OP_LEDGER_LIMIT; i++) {
    await host.runCommand({ userId: "alice", serverId, command: "buy", input: { __jgWsOpId: `op-${i}` } });
  }
  expect(coinsOf(await host.getServerView({ userId: "alice", serverId }))).toBe(OP_LEDGER_LIMIT);

  await host.runCommand({ userId: "alice", serverId, command: "buy", input: { __jgWsOpId: "op-0" } });
  expect(coinsOf(await host.getServerView({ userId: "alice", serverId }))).toBe(OP_LEDGER_LIMIT);

  await host.runCommand({
    userId: "alice",
    serverId,
    command: "buy",
    input: { __jgWsOpId: `op-${OP_LEDGER_LIMIT}` },
  });
  expect(coinsOf(await host.getServerView({ userId: "alice", serverId }))).toBe(OP_LEDGER_LIMIT + 1);

  await host.runCommand({ userId: "alice", serverId, command: "buy", input: { __jgWsOpId: "op-0" } });
  expect(coinsOf(await host.getServerView({ userId: "alice", serverId }))).toBe(OP_LEDGER_LIMIT + 2);
});

test("two concurrent writers on the same room both apply, no update lost to a stale snapshot read", async () => {
  const host = createGameHost({ persistence: memoryPersistence(), runtimes: [coinsRuntime()] });
  const { serverId } = await host.joinServer({ userId: "alice", gameId: "shop" });
  await host.joinServer({ userId: "bob", gameId: "shop", serverId });

  const [first, second] = await Promise.all([
    host.runCommand({ userId: "alice", serverId, command: "buy", input: {} }),
    host.runCommand({ userId: "bob", serverId, command: "buy", input: {} }),
  ]);

  expect(first).toEqual({ ok: true });
  expect(second).toEqual({ ok: true });
  expect(coinsOf(await host.getServerView({ userId: "alice", serverId }))).toBe(2);
});

test("a burst of concurrent runCommand calls from one player serializes through the host queue", async () => {
  const host = createGameHost({ persistence: memoryPersistence(), runtimes: [coinsRuntime()] });
  const { serverId } = await host.joinServer({ userId: "alice", gameId: "shop" });

  const results = await Promise.all(
    Array.from({ length: 10 }, () => host.runCommand({ userId: "alice", serverId, command: "buy", input: {} })),
  );

  expect(results.every((result) => result.ok === true)).toBe(true);
  expect(coinsOf(await host.getServerView({ userId: "alice", serverId }))).toBe(10);
});

test("a concurrent join and runCommand on a fresh server never race past server creation", async () => {
  const host = createGameHost({ persistence: memoryPersistence(), runtimes: [coinsRuntime()] });

  const { serverId } = await host.joinServer({ userId: "alice", gameId: "shop" });
  const [joinResult, commandResult] = await Promise.all([
    host.joinServer({ userId: "bob", gameId: "shop", serverId }),
    host.runCommand({ userId: "alice", serverId, command: "buy", input: {} }),
  ]);

  expect(joinResult.serverId).toBe(serverId);
  expect(commandResult).toEqual({ ok: true });
  expect(await host.isMember({ userId: "bob", serverId })).toBe(true);
  expect(coinsOf(await host.getServerView({ userId: "alice", serverId }))).toBe(1);
});

test("leaving a server forgets its op ledger", async () => {
  const host = createGameHost({ persistence: memoryPersistence(), runtimes: [coinsRuntime()] });
  const { serverId } = await host.joinServer({ userId: "alice", gameId: "shop" });

  await host.runCommand({ userId: "alice", serverId, command: "buy", input: { __jgWsOpId: "op-1" } });
  await host.leaveServer({ userId: "alice", serverId });
  await host.joinServer({ userId: "alice", gameId: "shop", serverId });

  await host.runCommand({ userId: "alice", serverId, command: "buy", input: { __jgWsOpId: "op-1" } });
  expect(coinsOf(await host.getServerView({ userId: "alice", serverId }))).toBe(2);
});
