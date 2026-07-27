import { expect, test } from "bun:test";
import type { UserIdentity } from "convex/server";

import { createGameRuntime } from "@jgengine/core/runtime/gameRuntime";
import { markPlayerDirty, type GameRuntimeSnapshot } from "@jgengine/core/runtime/snapshot";

import {
  REVISION_CONFLICT_REASON,
  applyCommandWithOcc,
  commitIfRevisionMatch,
} from "./occ";
import {
  JG_MAX_MEMBERS_PER_SERVER,
  MAX_CHUNKS_PER_QUERY,
  canJoinPrivateServer,
  createGameServerFunctions,
  isListablePublicly,
  resolveActor,
  type JGMutationCtx,
} from "./server";
import { handlerOf, makeDb, profileDoc, serverDoc, type Doc } from "./testFixtures";

function identity(overrides: Partial<UserIdentity> = {}): UserIdentity {
  return {
    tokenIdentifier: "issuer|alice",
    subject: "alice",
    issuer: "issuer",
    ...overrides,
  };
}

function authCtx(user: UserIdentity | null) {
  return { auth: { getUserIdentity: async () => user } };
}

type GoldGrantInput = { userId: string; amount: number };

function isGoldGrantInput(input: unknown): input is GoldGrantInput {
  return (
    typeof input === "object" &&
    input !== null &&
    typeof (input as GoldGrantInput).userId === "string" &&
    typeof (input as GoldGrantInput).amount === "number"
  );
}

function makeRuntime() {
  return createGameRuntime({
    gameId: "occ-demo",
    save: { auto: "5s", scope: "player" },
    commands: {
      "gold.grant": {
        validate: (_snapshot: GameRuntimeSnapshot, input: unknown) =>
          isGoldGrantInput(input) ? null : { reason: "userId and amount required" },
        apply: (snapshot: GameRuntimeSnapshot, input: unknown) => {
          const { userId, amount } = input as GoldGrantInput;
          const player = snapshot.players[userId];
          if (!player) return snapshot;
          return markPlayerDirty(
            {
              ...snapshot,
              players: {
                ...snapshot.players,
                [userId]: {
                  ...player,
                  economy: { ...player.economy, gold: (player.economy.gold ?? 0) + amount },
                },
              },
            },
            userId,
          );
        },
      },
    },
  });
}

function hydrateAt(revision: number, gold: number): GameRuntimeSnapshot {
  return makeRuntime().hydrate({
    gameId: "occ-demo",
    serverId: "srv-1",
    serverRow: { entities: [], objects: [], session: {} },
    playersByUserId: {
      alice: {
        userId: "alice",
        inventories: {},
        economy: { gold },
        unlocks: [],
        session: {},
      },
    },
    chunksByKey: {},
    revision,
  });
}

test("commitIfRevisionMatch rejects concurrent writers", () => {
  expect(commitIfRevisionMatch(3, 3)).toEqual({ ok: true });
  expect(commitIfRevisionMatch(3, 4)).toEqual({ ok: false, reason: REVISION_CONFLICT_REASON });
});

test("applyCommandWithOcc seeds from stored revision and advances it", () => {
  const runtime = makeRuntime();
  const snapshot = hydrateAt(7, 10);
  expect(snapshot.revision).toBe(7);

  const result = applyCommandWithOcc({
    loadedRevision: 7,
    currentRevision: 7,
    snapshot,
    runtime,
    actorUserId: "alice",
    command: "gold.grant",
    input: { userId: "alice", amount: 5 },
  });

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.snapshot.revision).toBe(8);
    expect(result.snapshot.players.alice?.economy.gold).toBe(15);
  }
});

test("applyCommandWithOcc isolates concurrent mutations via revision CAS", () => {
  const runtime = makeRuntime();
  let store = { revision: 2, snapshot: hydrateAt(2, 0) };

  const first = applyCommandWithOcc({
    loadedRevision: store.revision,
    currentRevision: store.revision,
    snapshot: store.snapshot,
    runtime,
    actorUserId: "alice",
    command: "gold.grant",
    input: { userId: "alice", amount: 5 },
  });
  expect(first.ok).toBe(true);
  if (!first.ok) throw new Error("first command failed");
  store = { revision: first.snapshot.revision, snapshot: first.snapshot };

  const staleBase = hydrateAt(2, 0);
  const concurrent = applyCommandWithOcc({
    loadedRevision: 2,
    currentRevision: store.revision,
    snapshot: staleBase,
    runtime,
    actorUserId: "alice",
    command: "gold.grant",
    input: { userId: "alice", amount: 3 },
  });
  expect(concurrent).toEqual({ ok: false, reason: REVISION_CONFLICT_REASON });

  const retried = applyCommandWithOcc({
    loadedRevision: store.revision,
    currentRevision: store.revision,
    snapshot: store.snapshot,
    runtime,
    actorUserId: "alice",
    command: "gold.grant",
    input: { userId: "alice", amount: 3 },
  });
  expect(retried.ok).toBe(true);
  if (retried.ok) {
    expect(retried.snapshot.players.alice?.economy.gold).toBe(8);
    expect(retried.snapshot.revision).toBe(4);
  }
});

test("hydrate preserves non-zero server revision", () => {
  const snapshot = hydrateAt(42, 1);
  expect(snapshot.revision).toBe(42);
});

test("resolveActor binds a signed-in caller to their own identity", async () => {
  const actor = await resolveActor(authCtx(identity({ subject: "alice" })), undefined, "required");
  expect(actor).toBe("alice");
});

test("resolveActor rejects a signed-in caller claiming another player's externalId", async () => {
  const actor = await resolveActor(authCtx(identity({ subject: "alice" })), "bob", "required");
  expect(actor).toBeNull();
});

test("resolveActor accepts a signed-in caller's externalId when it matches their own subject", async () => {
  const actor = await resolveActor(authCtx(identity({ subject: "alice" })), "alice", "required");
  expect(actor).toBe("alice");
});

test("resolveActor rejects every caller in required mode with no Convex identity", async () => {
  const actor = await resolveActor(authCtx(null), "anyone", "required");
  expect(actor).toBeNull();
});

test("resolveActor rejects a caller with no identity and no claim, even in anonymous mode", async () => {
  const actor = await resolveActor(authCtx(null), undefined, "anonymous");
  expect(actor).toBeNull();
});

test("isListablePublicly excludes private servers, includes public and undefined", () => {
  expect(isListablePublicly("private")).toBe(false);
  expect(isListablePublicly("public")).toBe(true);
  expect(isListablePublicly(undefined)).toBe(true);
});

test("canJoinPrivateServer rejects a non-member with no code or a wrong code", () => {
  expect(canJoinPrivateServer({ isMember: false, joinCode: "SECRET1", suppliedCode: undefined })).toBe(
    false,
  );
  expect(canJoinPrivateServer({ isMember: false, joinCode: "SECRET1", suppliedCode: "WRONG" })).toBe(
    false,
  );
  expect(canJoinPrivateServer({ isMember: false, joinCode: undefined, suppliedCode: undefined })).toBe(
    false,
  );
});

test("canJoinPrivateServer accepts a non-member presenting the matching (case-insensitive) code", () => {
  expect(canJoinPrivateServer({ isMember: false, joinCode: "SECRET1", suppliedCode: "secret1" })).toBe(
    true,
  );
});

test("canJoinPrivateServer always accepts an existing member, code or not", () => {
  expect(canJoinPrivateServer({ isMember: true, joinCode: "SECRET1", suppliedCode: undefined })).toBe(
    true,
  );
});

const PLAYER_SAVE = { auto: "5s", scope: "player" } as const;

function anonCtx(db: unknown) {
  return { db, auth: { getUserIdentity: async () => null } };
}

function player(userId: string, gold: number) {
  return { userId, inventories: {}, economy: { gold }, unlocks: [], session: {} };
}

function goldOf(rows: Doc[], userId: string): number | undefined {
  const row = rows.find((doc) => doc.userId === userId);
  return (row?.playerState as { economy: Record<string, number> } | undefined)?.economy.gold;
}

/** A runtime whose onNewPlayer grants starting money, the shape issue #1617 reported as lost. */
function grantRuntime() {
  return createGameRuntime({
    gameId: "grant-demo",
    save: PLAYER_SAVE,
    commands: {},
    loop: {
      onNewPlayer(ctx) {
        const existing = ctx.snapshot.players[ctx.player.userId];
        if (!existing) return;
        ctx.setSnapshot(
          markPlayerDirty(
            {
              ...ctx.snapshot,
              players: {
                ...ctx.snapshot.players,
                [ctx.player.userId]: { ...existing, economy: { ...existing.economy, gold: 100 } },
              },
            },
            ctx.player.userId,
          ),
        );
      },
    },
  });
}

test("joinServer persists the profile an onNewPlayer grant just created", async () => {
  const { db, seed, rows } = makeDb();
  seed(
    "jgGameServers",
    serverDoc({ _id: "srv:join", gameId: "grant-demo", memberUserIds: [], save: PLAYER_SAVE }),
  );

  const fns = createGameServerFunctions({ runtimes: [grantRuntime()], auth: "anonymous" });
  const result = (await handlerOf(fns.joinServer)(anonCtx(db), {
    gameId: "grant-demo",
    serverId: "srv:join",
    externalId: "alice",
  })) as { serverId: string; isNew: boolean };

  expect(result.isNew).toBe(true);
  expect(goldOf(rows("jgPlayerProfiles"), "alice")).toBe(100);
});

test("flushSave rewrites every member's profile and clears dirtyAt", async () => {
  const { db, seed, rows } = makeDb();
  const server = seed(
    "jgGameServers",
    serverDoc({
      _id: "srv:flush",
      gameId: "grant-demo",
      save: PLAYER_SAVE,
      dirtyAt: 1,
      sessionPlayers: { alice: player("alice", 42) },
    }),
  );
  seed(
    "jgPlayerProfiles",
    profileDoc({ userId: "alice", gameId: "grant-demo", playerState: player("alice", 42) }),
  );

  const fns = createGameServerFunctions({ runtimes: [grantRuntime()], auth: "anonymous" });
  const flushed = await handlerOf(fns.flushSave)(anonCtx(db), {
    serverId: "srv:flush",
    externalId: "alice",
  });

  expect(flushed).toBe(true);
  expect(goldOf(rows("jgPlayerProfiles"), "alice")).toBe(42);
  expect(server.dirtyAt).toBeUndefined();
});

test("flushDirtyServers writes profiles for every dirty server it sweeps", async () => {
  const { db, seed, rows } = makeDb();
  seed(
    "jgGameServers",
    serverDoc({
      _id: "srv:sweep",
      gameId: "grant-demo",
      save: PLAYER_SAVE,
      dirtyAt: Date.now(),
      memberUserIds: ["alice", "bob"],
      sessionPlayers: { alice: player("alice", 7), bob: player("bob", 9) },
    }),
  );
  seed(
    "jgPlayerProfiles",
    profileDoc({ userId: "alice", gameId: "grant-demo", playerState: player("alice", 7) }),
  );
  seed(
    "jgPlayerProfiles",
    profileDoc({ userId: "bob", gameId: "grant-demo", playerState: player("bob", 9) }),
  );

  const fns = createGameServerFunctions({ runtimes: [grantRuntime()], auth: "anonymous" });
  const result = (await handlerOf(fns.flushDirtyServers)({ db }, {})) as { saved: number };

  expect(result.saved).toBe(1);
  expect(goldOf(rows("jgPlayerProfiles"), "alice")).toBe(7);
  expect(goldOf(rows("jgPlayerProfiles"), "bob")).toBe(9);
});

test("helpers compose a snapshot write with a host table write in one transaction", async () => {
  const { db, seed, rows } = makeDb();
  seed(
    "jgGameServers",
    serverDoc({
      _id: "srv:helpers",
      gameId: "occ-demo",
      save: PLAYER_SAVE,
      sessionPlayers: { alice: player("alice", 10) },
    }),
  );
  seed(
    "jgPlayerProfiles",
    profileDoc({ userId: "alice", gameId: "occ-demo", playerState: player("alice", 10) }),
  );

  const fns = createGameServerFunctions({ runtimes: [makeRuntime()], auth: "anonymous" });
  const ctx = anonCtx(db) as unknown as JGMutationCtx;

  const loaded = await fns.helpers.loadSnapshot(ctx, "srv:helpers");
  expect(loaded).not.toBeNull();
  if (!loaded) throw new Error("server missing");

  const applied = fns.helpers.applyCommand({
    gameId: loaded.server.gameId,
    loadedRevision: loaded.server.revision,
    currentRevision: loaded.server.revision,
    snapshot: loaded.snapshot,
    actorUserId: "alice",
    command: "gold.grant",
    input: { userId: "alice", amount: 5 },
  });
  expect(applied.ok).toBe(true);
  if (!applied.ok) throw new Error(applied.reason);

  await fns.helpers.persistSnapshot(ctx, loaded.server, applied.snapshot);
  await ctx.db.insert("jgFeedBuffers", {
    serverId: loaded.server._id,
    action: "audit",
    entries: [{ userId: "alice", amount: 5 }],
    updatedAt: 1,
  });

  expect(goldOf(rows("jgPlayerProfiles"), "alice")).toBe(15);
  expect(rows("jgFeedBuffers")).toHaveLength(1);
});

test("helpers.runCommand shares the registered mutation's implementation", async () => {
  const { db, seed, rows } = makeDb();
  seed(
    "jgGameServers",
    serverDoc({
      _id: "srv:shared",
      gameId: "occ-demo",
      save: PLAYER_SAVE,
      sessionPlayers: { alice: player("alice", 1) },
    }),
  );
  seed(
    "jgPlayerProfiles",
    profileDoc({ userId: "alice", gameId: "occ-demo", playerState: player("alice", 1) }),
  );

  const fns = createGameServerFunctions({ runtimes: [makeRuntime()], auth: "anonymous" });
  const ctx = anonCtx(db);
  const args = {
    serverId: "srv:shared",
    command: "gold.grant",
    input: { userId: "alice", amount: 2 },
    externalId: "alice",
  };

  expect(await fns.helpers.runCommand(ctx as unknown as JGMutationCtx, args)).toEqual({ ok: true });
  expect(await handlerOf(fns.runCommand)(ctx, args)).toEqual({ ok: true });
  expect(goldOf(rows("jgPlayerProfiles"), "alice")).toBe(5);

  expect(
    await fns.helpers.runCommand(ctx as unknown as JGMutationCtx, { ...args, externalId: "mallory" }),
  ).toEqual(await handlerOf(fns.runCommand)(ctx, { ...args, externalId: "mallory" }));
});

test("createGameServerFunctions refuses a slotsPerServer no single row can hold", () => {
  expect(() => createGameServerFunctions({ slotsPerServer: 10_000 })).toThrow(
    /JG_MAX_MEMBERS_PER_SERVER/,
  );
  expect(() => createGameServerFunctions({ slotsPerServer: JG_MAX_MEMBERS_PER_SERVER })).not.toThrow();
});

test("singleton matchmaking refuses a join past capacity instead of sharding the world", async () => {
  const { db, seed, rows } = makeDb();
  seed(
    "jgGameServers",
    serverDoc({
      _id: "srv:world",
      gameId: "grant-demo",
      save: PLAYER_SAVE,
      slotsPerServer: 1,
      memberUserIds: ["alice"],
    }),
  );

  const fns = createGameServerFunctions({
    runtimes: [grantRuntime()],
    auth: "anonymous",
    matchmaking: "singleton",
    slotsPerServer: 1,
  });

  await expect(
    handlerOf(fns.joinServer)(anonCtx(db), { gameId: "grant-demo", externalId: "bob" }),
  ).rejects.toThrow("Server is full");
  expect(rows("jgGameServers")).toHaveLength(1);
});

test("joinServer reconciles a stored capacity that no longer matches the host option", async () => {
  const { db, seed, rows } = makeDb();
  seed(
    "jgGameServers",
    serverDoc({
      _id: "srv:stale",
      gameId: "grant-demo",
      save: PLAYER_SAVE,
      slotsPerServer: 2,
      memberUserIds: ["alice", "carol"],
    }),
  );

  const fns = createGameServerFunctions({
    runtimes: [grantRuntime()],
    auth: "anonymous",
    matchmaking: "singleton",
    slotsPerServer: 8,
  });
  await handlerOf(fns.joinServer)(anonCtx(db), { gameId: "grant-demo", externalId: "bob" });

  const server = rows("jgGameServers")[0];
  expect(server?.slotsPerServer).toBe(8);
  expect(server?.memberUserIds).toEqual(["alice", "carol", "bob"]);
});

test("a persist that would change nothing writes nothing", async () => {
  const { db, seed, rows } = makeDb();
  seed(
    "jgGameServers",
    serverDoc({
      _id: "srv:quiet",
      gameId: "occ-demo",
      save: PLAYER_SAVE,
      revision: 4,
      sessionPlayers: { alice: player("alice", 3) },
    }),
  );
  seed(
    "jgPlayerProfiles",
    profileDoc({ userId: "alice", gameId: "occ-demo", playerState: player("alice", 3) }),
  );

  const fns = createGameServerFunctions({ runtimes: [makeRuntime()], auth: "anonymous" });
  const ctx = anonCtx(db) as unknown as JGMutationCtx;
  const loaded = await fns.helpers.loadSnapshot(ctx, "srv:quiet");
  if (!loaded) throw new Error("server missing");

  const before = { ...rows("jgGameServers")[0] };
  expect(await fns.helpers.persistSnapshot(ctx, loaded.server, loaded.snapshot)).toBe(false);
  expect(rows("jgGameServers")[0]).toEqual(before);
});

test("loadSnapshot hydrates only the members and chunks it was scoped to", async () => {
  const { db, seed, reads } = makeDb();
  seed(
    "jgGameServers",
    serverDoc({
      _id: "srv:scoped",
      gameId: "occ-demo",
      save: PLAYER_SAVE,
      memberUserIds: ["alice", "bob"],
    }),
  );
  const bob = seed(
    "jgPlayerProfiles",
    profileDoc({ userId: "bob", gameId: "occ-demo", playerState: player("bob", 1) }),
  );
  const far = seed("jgWorldChunks", {
    _id: "chunk:far",
    _creationTime: 0,
    serverId: "srv:scoped",
    chunkKey: "9,9",
    snapshot: { chunkKey: "9,9", objects: [], entities: [] },
    updatedAt: 0,
  });
  seed("jgWorldChunks", {
    _id: "chunk:near",
    _creationTime: 0,
    serverId: "srv:scoped",
    chunkKey: "0,0",
    snapshot: { chunkKey: "0,0", objects: [], entities: [] },
    updatedAt: 0,
  });

  const fns = createGameServerFunctions({ runtimes: [makeRuntime()], auth: "anonymous" });
  const loaded = await fns.helpers.loadSnapshot(
    anonCtx(db) as unknown as JGMutationCtx,
    "srv:scoped",
    { players: ["alice"], chunkKeys: ["0,0"] },
  );
  if (!loaded) throw new Error("server missing");

  expect(Object.keys(loaded.snapshot.players)).toEqual(["alice"]);
  expect(Object.keys(loaded.snapshot.chunks)).toEqual(["0,0"]);
  expect(reads.has(bob._id)).toBe(false);
  expect(reads.has(far._id)).toBe(false);
});

test("persisting a scoped snapshot leaves unhydrated members' session state intact", async () => {
  const { db, seed, rows } = makeDb();
  seed(
    "jgGameServers",
    serverDoc({
      _id: "srv:partial",
      gameId: "occ-demo",
      save: PLAYER_SAVE,
      memberUserIds: ["alice", "bob"],
      sessionPlayers: { alice: player("alice", 1), bob: player("bob", 9) },
    }),
  );
  for (const [userId, gold] of [["alice", 1], ["bob", 9]] as const) {
    seed(
      "jgPlayerProfiles",
      profileDoc({ userId, gameId: "occ-demo", playerState: player(userId, gold) }),
    );
  }

  const fns = createGameServerFunctions({ runtimes: [makeRuntime()], auth: "anonymous" });
  const ctx = anonCtx(db) as unknown as JGMutationCtx;
  const loaded = await fns.helpers.loadSnapshot(ctx, "srv:partial", { players: ["alice"] });
  if (!loaded) throw new Error("server missing");

  const applied = fns.helpers.applyCommand({
    gameId: "occ-demo",
    loadedRevision: loaded.server.revision,
    currentRevision: loaded.server.revision,
    snapshot: loaded.snapshot,
    actorUserId: "alice",
    command: "gold.grant",
    input: { userId: "alice", amount: 4 },
  });
  if (!applied.ok) throw new Error(applied.reason);
  await fns.helpers.persistSnapshot(ctx, loaded.server, applied.snapshot);

  expect(goldOf(rows("jgPlayerProfiles"), "alice")).toBe(5);
  expect(goldOf(rows("jgPlayerProfiles"), "bob")).toBe(9);
  const session = rows("jgGameServers")[0]?.sessionPlayers as Record<string, { economy: Record<string, number> }>;
  expect(session.bob?.economy.gold).toBe(9);
});

test("a deleted profile stays deleted instead of resurrecting from the server row", async () => {
  const { db, seed, rows } = makeDb();
  seed(
    "jgGameServers",
    serverDoc({
      _id: "srv:wiped",
      gameId: "grant-demo",
      save: PLAYER_SAVE,
      dirtyAt: 1,
      sessionPlayers: { alice: player("alice", 999) },
    }),
  );

  const fns = createGameServerFunctions({ runtimes: [grantRuntime()], auth: "anonymous" });
  await handlerOf(fns.flushSave)(anonCtx(db), { serverId: "srv:wiped", externalId: "alice" });

  expect(goldOf(rows("jgPlayerProfiles"), "alice")).toBeUndefined();
});

test("getServerMeta reports lobby state without shipping the world", async () => {
  const { db, seed } = makeDb();
  seed(
    "jgGameServers",
    serverDoc({
      _id: "srv:meta",
      memberUserIds: ["alice", "bob"],
      serverState: { entities: [], objects: [{ instanceId: "rack" }], session: {} },
    }),
  );

  const fns = createGameServerFunctions({ runtimes: [makeRuntime()], auth: "anonymous" });
  const meta = (await handlerOf(fns.getServerMeta)(anonCtx(db), {
    serverId: "srv:meta",
    externalId: "alice",
  })) as Record<string, unknown>;

  expect(meta.memberCount).toBe(2);
  expect(meta.serverState).toBeUndefined();
  expect(meta.memberUserIds).toBeUndefined();
});

test("getChunks returns the requested keys and never more than the query cap", async () => {
  const { db, seed } = makeDb();
  seed("jgGameServers", serverDoc({ _id: "srv:chunks" }));
  for (const chunkKey of ["0,0", "1,0", "2,0"]) {
    seed("jgWorldChunks", {
      _id: `chunk:${chunkKey}`,
      _creationTime: 0,
      serverId: "srv:chunks",
      chunkKey,
      snapshot: { chunkKey, objects: [], entities: [] },
      updatedAt: 0,
    });
  }

  const fns = createGameServerFunctions({ runtimes: [makeRuntime()], auth: "anonymous" });
  const chunks = (await handlerOf(fns.getChunks)(anonCtx(db), {
    serverId: "srv:chunks",
    chunkKeys: ["0,0", "2,0", "missing"],
    externalId: "alice",
  })) as { chunkKey: string }[];

  expect(chunks.map((chunk) => chunk.chunkKey)).toEqual(["0,0", "2,0"]);

  const capped = (await handlerOf(fns.getChunks)(anonCtx(db), {
    serverId: "srv:chunks",
    chunkKeys: Array.from({ length: MAX_CHUNKS_PER_QUERY + 10 }, (_v, i) => `${i},0`),
    externalId: "alice",
  })) as { chunkKey: string }[];
  expect(capped.length).toBeLessThanOrEqual(MAX_CHUNKS_PER_QUERY);
});

test("a non-member gets nothing from getServerMeta or getChunks", async () => {
  const { db, seed } = makeDb();
  seed("jgGameServers", serverDoc({ _id: "srv:closed-door" }));

  const fns = createGameServerFunctions({ runtimes: [makeRuntime()], auth: "anonymous" });
  const args = { serverId: "srv:closed-door", externalId: "mallory" };
  expect(await handlerOf(fns.getServerMeta)(anonCtx(db), args)).toBeNull();
  expect(await handlerOf(fns.getChunks)(anonCtx(db), { ...args, chunkKeys: ["0,0"] })).toEqual([]);
});
