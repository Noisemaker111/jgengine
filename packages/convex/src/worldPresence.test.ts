import { expect, test } from "bun:test";
import { createWorldPresenceStore } from "./worldPresence";
import type { JGMutationCtx } from "./server";
import { makeDb } from "./testFixtures";

function fixture() {
  const db = makeDb();
  const ctx = { db: db.db } as unknown as JGMutationCtx;
  const store = createWorldPresenceStore({ snapshotIntervalMs: 1000, idleTimeoutMs: 5000, revokedTtlMs: 10000 });
  return { ...db, ctx, store };
}

test("world presence uses chunk indexes and preserves actor, home and owner identity", async () => {
  const { ctx, store, reads } = fixture();
  const near = await store.ensure(ctx, { serverId: "world", actorExternalId: "a", homeGameId: "home-a", kind: "human", presenceId: "human:a", position: { x: 0, y: 0, z: 0 } }, 1000);
  const far = await store.ensure(ctx, { serverId: "world", actorExternalId: "bot:b", ownerActorId: "b", homeGameId: "home-b", kind: "bot", position: { x: 6400, y: 0, z: 0 } }, 1000);
  reads.clear();
  expect((await store.nearby(ctx, "world", "0,0")).map(row => row.actorExternalId)).toEqual(["a"]);
  expect(reads.has(far._id)).toBe(false);
  expect((await store.active(ctx, "bot:b"))?.ownerActorId).toBe("b");
  expect((await store.active(ctx, "a"))?.homeGameId).toBe("home-a");
  expect(near.presenceId).toBe("human:a");
  expect(await store.nearby(ctx, "world", "invalid")).toEqual([]);
});

test("pose sync clamps speed and rejects burst writes while preserving checkpoint cadence", async () => {
  const { ctx, store, rows } = fixture();
  const row = await store.ensure(ctx, { serverId: "world", actorExternalId: "a", homeGameId: "home-a", kind: "human", position: { x: 0, y: 0, z: 0 } }, 1000);
  let snapshots = 0;
  const onSnapshot = async () => { snapshots++; };
  const moved = await store.sync(ctx, row, { position: { x: 100, z: 0, y: 100 } }, { nowMs: 1500, onSnapshot });
  expect(moved.position).toEqual({ x: 6, y: 3, z: 0 });
  const burst = await store.sync(ctx, moved, { position: { x: 12, z: 0 } }, { nowMs: 1550, onSnapshot });
  expect(burst.position).toEqual(moved.position);
  expect(rows("jgPoses")[0]!.updatedAt).toBe(1500);
  expect(snapshots).toBe(1);
  await store.sync(ctx, burst, undefined, { nowMs: 2600, onSnapshot });
  expect(snapshots).toBe(2);
  await expect(store.sync(ctx, row, { position: { x: Infinity, z: 0 } })).rejects.toThrow("finite");
});

test("ensuring reuses the actor row and revocation checkpoints before bounded physical cleanup", async () => {
  const { ctx, store, rows } = fixture();
  const args = { serverId: "world", actorExternalId: "a", homeGameId: "home", kind: "human", position: { x: 1, y: 0, z: 1 } };
  const first = await store.ensure(ctx, args, 1000);
  const again = await store.ensure(ctx, args, 2000);
  expect(again._id).toBe(first._id);
  expect(rows("jgPoses")).toHaveLength(1);
  let saved = "";
  await store.revoke(ctx, again, async row => { saved = row.homeGameId; }, 3000);
  expect(saved).toBe("home");
  expect(await store.active(ctx, "a")).toBeNull();
  expect(await store.nearby(ctx, "world", "0,0")).toEqual([]);
  expect((await store.reap(ctx, { nowMs: 10000 })).deleted).toBe(0);
  expect((await store.reap(ctx, { nowMs: 13000 })).deleted).toBe(1);
  expect(rows("jgPoses")).toHaveLength(0);
});

test("idle reaping is bounded and is not starved by recently revoked rows", async () => {
  const { ctx, store, rows } = fixture();
  for (let i = 0; i < 3; i++) await store.ensure(ctx, { serverId: "world", actorExternalId: `${i}`, homeGameId: "home", kind: "human", position: { x: 0, y: 0, z: 0 } }, 1000);
  const revoked = await store.active(ctx, "0");
  await store.revoke(ctx, revoked!, undefined, 2000);
  const result = await store.reap(ctx, { nowMs: 10000, batchSize: 1 });
  expect(result).toEqual({ reaped: 1, deleted: 1 });
  expect(rows("jgPoses")).toHaveLength(2);
});
