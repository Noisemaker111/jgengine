import { expect, test } from "bun:test";

import { createGameHost } from "./host";
import { memoryPersistence } from "./persistence";
import { createTestRuntime } from "./testFixtures";

function makeHost() {
  let t = 0;
  const host = createGameHost({
    runtimes: [createTestRuntime()],
    persistence: memoryPersistence(() => t),
    now: () => t,
    tickMs: 10,
  });
  return host;
}

test("browseServers hides private lobbies but exposes public ones with attributes", async () => {
  const host = makeHost();
  const pub = await host.joinServer({
    userId: "alice",
    gameId: "test-game",
    attributes: { visibility: "public", mode: "ranked", label: "Ranked US", tags: ["us"], joinCode: "PUB001" },
  });
  await host.joinServer({
    userId: "bob",
    gameId: "test-game",
    attributes: { visibility: "private", joinCode: "SECRET1" },
  });

  const listings = await host.browseServers({ gameId: "test-game" });
  expect(listings.map((l) => l.serverId)).toEqual([pub.serverId]);
  expect(listings[0]!.mode).toBe("ranked");
  expect(listings[0]!.tags).toEqual(["us"]);
  expect(listings[0]!.joinCode).toBeUndefined();
});

test("browseServers filters by mode", async () => {
  const host = makeHost();
  await host.joinServer({ userId: "a", gameId: "test-game", attributes: { mode: "ranked" } });
  await host.joinServer({ userId: "b", gameId: "test-game", attributes: { mode: "casual" } });

  const ranked = await host.browseServers({ gameId: "test-game", filter: { mode: "ranked" } });
  expect(ranked.length).toBe(1);
  expect(ranked[0]!.mode).toBe("ranked");
});

test("joinByCode drops a player into the private lobby that owns the code", async () => {
  const host = makeHost();
  const created = await host.joinServer({
    userId: "host",
    gameId: "test-game",
    attributes: { visibility: "private", joinCode: "web-fish-42" },
  });

  const joined = await host.joinByCode({ userId: "friend", gameId: "test-game", code: "WEBFISH42" });
  expect(joined).not.toBeNull();
  expect(joined!.serverId).toBe(created.serverId);

  const view = await host.getServerView({ userId: "friend", serverId: created.serverId });
  expect(view!.memberUserIds.sort()).toEqual(["friend", "host"]);
});

test("joinByCode returns null for an unknown code", async () => {
  const host = makeHost();
  await host.joinServer({ userId: "host", gameId: "test-game", attributes: { joinCode: "REALONE" } });
  const joined = await host.joinByCode({ userId: "x", gameId: "test-game", code: "NOPE" });
  expect(joined).toBeNull();
});
