import { expect, test } from "bun:test";
import type { UserIdentity } from "convex/server";

import { createGameRuntime } from "@jgengine/core/runtime/gameRuntime";
import { markPlayerDirty, type GameRuntimeSnapshot } from "@jgengine/core/runtime/snapshot";

import {
  REVISION_CONFLICT_REASON,
  applyCommandWithOcc,
  commitIfRevisionMatch,
} from "./occ";
import { canJoinPrivateServer, isListablePublicly, resolveActor } from "./server";

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
