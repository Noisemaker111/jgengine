import { expect, test } from "bun:test";

import type { GameServerRecord, PlayerProfileRecord } from "@jgengine/core/runtime/hostPersistence";
import { createEmptyServerRow } from "@jgengine/core/runtime/snapshot";

import { createHttpReads } from "./httpReads";
import { createReadsHandler, type ReadsPersistence } from "./readsHandler";

function makeServer(overrides: Partial<GameServerRecord> = {}): GameServerRecord {
  return {
    serverId: "srv-1",
    gameId: "demo",
    status: "running",
    memberUserIds: ["alice"],
    slotsPerServer: 16,
    save: { auto: "5s", scope: "player+chunks" },
    serverState: createEmptyServerRow(),
    sessionPlayers: {},
    revision: 0,
    tickAnchorMs: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<PlayerProfileRecord> = {}): PlayerProfileRecord {
  return {
    userId: "alice",
    gameId: "demo",
    playerState: { userId: "alice", inventories: {}, economy: {}, unlocks: [] },
    revision: 3,
    updatedAt: 42,
    ...overrides,
  };
}

function fakePersistence(overrides: Partial<ReadsPersistence> = {}): ReadsPersistence {
  return {
    listServers: async () => [],
    loadProfile: async () => null,
    getLeaderboardTop: async () => [],
    getLeaderboardProfile: async () => ({}),
    ...overrides,
  };
}

const get = (handler: (request: Request) => Promise<Response>, path: string) =>
  handler(new Request(`http://host${path}`));

test("servers route shapes, filters, sorts, and limits listings", async () => {
  const handler = createReadsHandler({
    persistence: fakePersistence({
      listServers: async (gameId) => {
        expect(gameId).toBe("demo");
        return [
          makeServer({ serverId: "old", updatedAt: 1 }),
          makeServer({ serverId: "stopped", status: "stopped", updatedAt: 9 }),
          makeServer({ serverId: "new", updatedAt: 5 }),
        ];
      },
    }),
  });
  const response = await get(handler, "/api/servers?gameId=demo");
  expect(response.status).toBe(200);
  const listings = (await response.json()) as { serverId: string; memberCount: number }[];
  expect(listings.map((listing) => listing.serverId)).toEqual(["new", "old"]);
  expect(listings[0]?.memberCount).toBe(1);

  const limited = await get(handler, "/api/servers?gameId=demo&limit=1");
  expect(((await limited.json()) as unknown[]).length).toBe(1);
});

test("servers route prefers the listOpenServers override", async () => {
  const handler = createReadsHandler({
    persistence: fakePersistence({
      listServers: async () => {
        throw new Error("must not hit persistence");
      },
    }),
    listOpenServers: async ({ gameId, limit }) => {
      expect(gameId).toBe("demo");
      expect(limit).toBe(3);
      return [];
    },
  });
  const response = await get(handler, "/api/servers?gameId=demo&limit=3");
  expect(await response.json()).toEqual([]);
});

test("leaderboard route validates scope and forwards params", async () => {
  const handler = createReadsHandler({
    persistence: fakePersistence({
      getLeaderboardTop: async (args) => {
        expect(args).toEqual({ gameId: "demo", stat: "kills", scope: "server", serverId: "srv-1", limit: 5 });
        return [{ userId: "alice", value: 10 }];
      },
    }),
  });
  const bad = await get(handler, "/api/leaderboard/kills?gameId=demo&scope=bogus");
  expect(bad.status).toBe(400);

  const response = await get(handler, "/api/leaderboard/kills?gameId=demo&scope=server&serverId=srv-1&limit=5");
  expect(await response.json()).toEqual([{ userId: "alice", value: 10 }]);
});

test("profile route rejects unauthenticated reads by default", async () => {
  const handler = createReadsHandler({
    persistence: fakePersistence({
      loadProfile: async () => makeProfile(),
    }),
  });
  const response = await get(handler, "/api/profile/alice?gameId=demo");
  expect(response.status).toBe(401);
});

test("profile route allows the authenticated owner only", async () => {
  const handler = createReadsHandler({
    persistence: fakePersistence({
      loadProfile: async (args) => (args.userId === "alice" ? makeProfile() : null),
    }),
    authenticate: (request) => {
      const header = request.headers.get("x-user-id");
      return header;
    },
  });
  const denied = await handler(
    new Request("http://host/api/profile/alice?gameId=demo", {
      headers: { "x-user-id": "bob" },
    }),
  );
  expect(denied.status).toBe(401);

  const found = await handler(
    new Request("http://host/api/profile/alice?gameId=demo", {
      headers: { "x-user-id": "alice" },
    }),
  );
  expect(await found.json()).toEqual({
    userId: "alice",
    gameId: "demo",
    playerState: { userId: "alice", inventories: {}, economy: {}, unlocks: [] },
    updatedAt: 42,
  });
});

test("profile route projects when public profiles are explicitly enabled", async () => {
  const handler = createReadsHandler({
    persistence: fakePersistence({
      loadProfile: async (args) => (args.userId === "alice" ? makeProfile() : null),
    }),
    allowPublicProfiles: true,
  });
  const found = await get(handler, "/api/profile/alice?gameId=demo");
  expect(await found.json()).toEqual({
    userId: "alice",
    gameId: "demo",
    playerState: { userId: "alice", inventories: {}, economy: {}, unlocks: [] },
    updatedAt: 42,
  });
  const missing = await get(handler, "/api/profile/nobody?gameId=demo");
  expect(await missing.json()).toBeNull();
});

test("unknown routes 404 and non-GET 405", async () => {
  const handler = createReadsHandler({ persistence: fakePersistence() });
  expect((await get(handler, "/api/unknown")).status).toBe(404);
  expect((await get(handler, "/elsewhere")).status).toBe(404);
  expect((await handler(new Request("http://host/api/servers", { method: "POST" }))).status).toBe(405);
});

test("basePath override rebases every route", async () => {
  const handler = createReadsHandler({ persistence: fakePersistence(), basePath: "/reads/v1" });
  expect((await get(handler, "/reads/v1/servers?gameId=demo")).status).toBe(200);
  expect((await get(handler, "/api/servers?gameId=demo")).status).toBe(404);
});

test("lazy persistence factory is called once and memoized", async () => {
  let calls = 0;
  const handler = createReadsHandler({
    persistence: async () => {
      calls += 1;
      return fakePersistence();
    },
  });
  await get(handler, "/api/servers?gameId=demo");
  await get(handler, "/api/servers?gameId=demo");
  expect(calls).toBe(1);
});

test("createHttpReads round-trips against the handler", async () => {
  const handler = createReadsHandler({
    persistence: fakePersistence({
      listServers: async () => [makeServer()],
      getLeaderboardTop: async () => [{ userId: "alice", value: 7 }],
      getLeaderboardProfile: async ({ userId }) => ({ kills: userId === "alice" ? 7 : 0 }),
      loadProfile: async () => makeProfile(),
    }),
    allowPublicProfiles: true,
  });
  const reads = createHttpReads({
    baseUrl: "http://host",
    gameId: "demo",
    fetchImpl: ((input: RequestInfo | URL, init?: RequestInit) =>
      handler(new Request(input, init))) as typeof fetch,
  });
  expect((await reads.listOpenServers()).map((listing) => listing.serverId)).toEqual(["srv-1"]);
  expect(await reads.getTop({ stat: "kills", scope: "global" })).toEqual([{ userId: "alice", value: 7 }]);
  expect(await reads.getLeaderboardProfile("alice")).toEqual({ kills: 7 });
  expect((await reads.getPlayerProfile("alice"))?.userId).toBe("alice");
});

test("public server listings omit join codes", async () => {
  const handler = createReadsHandler({
    persistence: fakePersistence({
      listServers: async () => [
        makeServer({
          serverId: "private-room",
          visibility: "private",
          joinCode: "SECRET1",
        }),
      ],
    }),
  });
  const response = await get(handler, "/api/servers?gameId=demo");
  const listings = (await response.json()) as { serverId: string; joinCode?: string }[];
  expect(listings).toHaveLength(1);
  expect(listings[0]?.serverId).toBe("private-room");
  expect(listings[0]?.joinCode).toBeUndefined();
});
