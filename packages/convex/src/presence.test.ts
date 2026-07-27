import { expect, test } from "bun:test";

import { createPresenceFunctions, type JGMutationCtx } from "./server";
import { handlerOf, makeDb, serverDoc, type Doc } from "./testFixtures";

function anonCtx(db: unknown) {
  return { db, auth: { getUserIdentity: async () => null } };
}

const POSE = { x: 1, y: 0, z: 2, rotationY: 0.5, rotationPitch: 0 };

function seedServer(seed: ReturnType<typeof makeDb>["seed"]) {
  seed("jgGameServers", serverDoc({ _id: "srv:presence", memberUserIds: ["alice", "bob"] }));
}

function poseRows(rows: (table: string) => Doc[]): Doc[] {
  return rows("jgPoses");
}

test("sync returns the pose the server holds after clamping", async () => {
  const { db, seed, rows } = makeDb();
  seedServer(seed);

  const fns = createPresenceFunctions({ auth: "anonymous" });
  const first = (await handlerOf(fns.sync)(anonCtx(db), {
    serverId: "srv:presence",
    pose: POSE,
    externalId: "alice",
  })) as { pose: typeof POSE; displaced: boolean } | null;

  expect(first?.displaced).toBe(false);
  // Spawned at the origin, so a 12 u/s cap over the 0.5s max elapsed window holds it short of (1, 2).
  expect(first?.pose.rotationY).toBe(0.5);
  expect(Math.hypot(first?.pose.x ?? 0, first?.pose.z ?? 0)).toBeLessThanOrEqual(6.001);
  expect(poseRows(rows)).toHaveLength(1);
});

test("sync without a pose is a keep-alive that holds the stored position", async () => {
  const { db, seed, rows } = makeDb();
  seedServer(seed);

  const fns = createPresenceFunctions({ auth: "anonymous" });
  const ctx = anonCtx(db);
  const placed = (await handlerOf(fns.sync)(ctx, {
    serverId: "srv:presence",
    pose: POSE,
    externalId: "alice",
  })) as { pose: typeof POSE };

  const kept = (await handlerOf(fns.sync)(ctx, {
    serverId: "srv:presence",
    externalId: "alice",
  })) as { pose: typeof POSE };

  expect(kept.pose).toEqual(placed.pose);
  expect(poseRows(rows)).toHaveLength(1);
});

test("resolveSpawn decides where a session with no row starts", async () => {
  const { db, seed, rows } = makeDb();
  seedServer(seed);

  const fns = createPresenceFunctions({
    auth: "anonymous",
    resolveSpawn: async (_ctx, args) => (args.userId === "alice" ? { x: 40, y: 0, z: 40 } : null),
  });
  await handlerOf(fns.sync)(anonCtx(db), { serverId: "srv:presence", externalId: "alice" });

  const row = poseRows(rows)[0];
  expect([row?.x, row?.z]).toEqual([40, 40]);
});

test("poseRules may differ per actor kind", async () => {
  const { db, seed, rows } = makeDb();
  seedServer(seed);

  const fns = createPresenceFunctions({
    auth: "anonymous",
    poseRules: (kind) => ({
      maxSpeed: kind === "agent" ? 1_000 : 12,
      maxVerticalOffset: 3,
      minElapsedSec: 0.05,
      maxElapsedSec: 0.5,
      keepAliveRefreshMs: 10_000,
    }),
  });
  await handlerOf(fns.sync)(anonCtx(db), {
    serverId: "srv:presence",
    pose: { ...POSE, x: 200, z: 0 },
    kind: "agent",
    label: "Courier",
    externalId: "alice",
  });

  const row = poseRows(rows)[0];
  expect(row?.x).toBe(200);
  expect([row?.kind, row?.label]).toEqual(["agent", "Courier"]);
});

test("a second session revokes the first, which learns it was displaced", async () => {
  const { db, seed, rows } = makeDb();
  seedServer(seed);

  const fns = createPresenceFunctions({ auth: "anonymous" });
  const ctx = anonCtx(db);
  const args = { serverId: "srv:presence", pose: POSE, externalId: "alice" };

  await handlerOf(fns.sync)(ctx, { ...args, sessionId: "tab-1" });
  await handlerOf(fns.sync)(ctx, { ...args, sessionId: "tab-2" });

  expect(poseRows(rows)).toHaveLength(2);
  expect(poseRows(rows).find((row) => row.sessionId === "tab-1")?.revokedAt).toBeNumber();

  const listed = (await handlerOf(fns.list)(ctx, {
    serverId: "srv:presence",
    externalId: "alice",
  })) as { sessionId?: string }[];
  expect(listed.map((row) => row.sessionId)).toEqual(["tab-2"]);

  const back = (await handlerOf(fns.sync)(ctx, { ...args, sessionId: "tab-1" })) as {
    displaced: boolean;
  };
  expect(back.displaced).toBe(true);
  expect(poseRows(rows).find((row) => row.sessionId === "tab-2")?.revokedAt).toBeNumber();
});

test("leave revokes rather than deletes, so the row stays for the reaper", async () => {
  const { db, seed, rows } = makeDb();
  seedServer(seed);

  const fns = createPresenceFunctions({ auth: "anonymous" });
  const ctx = anonCtx(db);
  await handlerOf(fns.sync)(ctx, { serverId: "srv:presence", pose: POSE, externalId: "alice" });
  await handlerOf(fns.leave)(ctx, { serverId: "srv:presence", externalId: "alice" });

  expect(poseRows(rows)).toHaveLength(1);
  expect(poseRows(rows)[0]?.revokedAt).toBeNumber();
  expect(
    await handlerOf(fns.list)(ctx, { serverId: "srv:presence", externalId: "alice" }),
  ).toEqual([]);
});

test("reapIdlePresence deletes rows nobody has written since the cutoff", async () => {
  const { db, seed, rows } = makeDb();
  seedServer(seed);
  const now = Date.now();
  seed("jgPoses", {
    _id: "pose:stale",
    _creationTime: 0,
    serverId: "srv:presence",
    userId: "bob",
    ...POSE,
    updatedAt: now - 600_000,
  });

  const fns = createPresenceFunctions({ auth: "anonymous", idleCutoffMs: 60_000 });
  const ctx = anonCtx(db) as unknown as JGMutationCtx;
  await handlerOf(fns.sync)(ctx, { serverId: "srv:presence", pose: POSE, externalId: "alice" });

  expect(await handlerOf(fns.reapIdlePresence)(ctx, {})).toEqual({ reaped: 1 });
  expect(poseRows(rows).map((row) => row.userId)).toEqual(["alice"]);
});
