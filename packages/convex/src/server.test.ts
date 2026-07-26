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
  canJoinPrivateServer,
  createGameServerFunctions,
  isListablePublicly,
  resolveActor,
  type JGMutationCtx,
} from "./server";
import { handlerOf, makeDb, serverDoc, type Doc } from "./testFixtures";

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

test("flushSave writes profiles hydrated from session state and clears dirtyAt", async () => {
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
