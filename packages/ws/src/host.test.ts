import { expect, test } from "bun:test";

import { createGameHost, memoryPersistence } from "./host";

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
