import { expect, test } from "bun:test";
import { createGameRuntime } from "@jgengine/core/runtime/gameRuntime";
import { createEmptyPlayerRow } from "@jgengine/core/runtime/snapshot";
import { MAX_MEMBER_SESSIONS, MAX_SESSION_ID_LENGTH, createGameServerFunctions, type JGMutationCtx } from "./server";
import { handlerOf, makeDb, profileDoc, serverDoc } from "./testFixtures";

function setup(save: "none" | { auto: string; scope: "player+chunks" } = { auto: "60s", scope: "player+chunks" }) {
  const fixture = makeDb();
  const writes: string[] = [];
  const db = { ...fixture.db, patch: async (id: string, patch: Record<string, unknown>) => {
    writes.push(id);
    await fixture.db.patch(id, patch);
  } };
  const ctx = { db, auth: { getUserIdentity: async () => null } } as unknown as JGMutationCtx;
  const runtime = createGameRuntime({ gameId: "demo", save, commands: {
    grant: { access: "server", validate: () => null, apply: snapshot => snapshot },
    earn: { validate: () => null, apply(snapshot, _input, actor) {
      const player = snapshot.players[actor]!;
      return { ...snapshot, players: { ...snapshot.players, [actor]: { ...player, economy: { cash: (player.economy.cash ?? 0) + 1 }, session: { visits: 7 } } } };
    } },
  }, loop: {
    joinScope: userId => ({ players: [userId], chunkKeys: [] }),
    onNewPlayer(ctx) {
      if (ctx.player.isNew) ctx.snapshot.players[ctx.player.userId]!.economy.cash = 50;
    },
  } });
  const fns = createGameServerFunctions({ topology: "shared", runtimes: [runtime], auth: "anonymous" });
  const join = async (externalId: string, serverId?: string, sessionId?: string) => {
    const result = await handlerOf(fns.joinServer)(ctx, { gameId: "demo", externalId, ...(serverId ? { serverId } : {}), ...(sessionId ? { sessionId } : {}) }) as { ok: boolean; serverId: string; isNew: boolean };
    expect(result.ok).toBe(true);
    return result;
  };
  const leave = (externalId: string, serverId: string, sessionId?: string) =>
    handlerOf(fns.leaveServer)(ctx, { serverId, externalId, ...(sessionId ? { sessionId } : {}) });
  const earn = (externalId: string, serverId: string) =>
    fns.helpers.runCommand(ctx, { serverId, command: "earn", input: {}, externalId });
  return { ...fixture, writes, ctx, fns, join, leave, earn };
}

test("shared singleton accepts over 256 members without rewriting the world row on joins or leaves", async () => {
  const { rows, writes, ctx, fns, join } = setup();
  const first = await join("p0");
  writes.length = 0;
  for (let i = 1; i < 270; i++) expect((await join(`p${i}`)).serverId).toBe(first.serverId);
  expect(rows("jgGameServers")).toHaveLength(1);
  expect(rows("jgServerMembers")).toHaveLength(270);
  expect(rows("jgServerCapacity")[0]!.memberCount).toBe(270);
  expect(rows("jgGameServers")[0]!.memberUserIds).toEqual([]);
  expect(rows("jgGameServers")[0]!.sessionPlayers).toEqual({});
  expect(writes.includes(first.serverId)).toBe(false);
  await handlerOf(fns.leaveServer)(ctx, { serverId: first.serverId, externalId: "p1" });
  expect(rows("jgServerCapacity")[0]!.memberCount).toBe(269);
  expect(writes.includes(first.serverId)).toBe(false);
  await join("p0");
  expect(rows("jgServerCapacity")[0]!.memberCount).toBe(269);
});

test("shared actor commands read only that profile, preserve sessions, and never write the singleton", async () => {
  const { rows, reads, seed, writes, ctx, fns, join } = setup();
  const { serverId } = await join("alice");
  await join("bob");
  const alice = rows("jgPlayerProfiles").find(row => row.userId === "alice")!;
  const bob = rows("jgPlayerProfiles").find(row => row.userId === "bob")!;
  const chunk = seed("jgWorldChunks", { _id: "chunk:far", _creationTime: 0, serverId, chunkKey: "999,999", snapshot: { chunkKey: "999,999", objects: [], entities: [] }, updatedAt: 0 });
  reads.clear(); writes.length = 0;
  expect(await fns.helpers.runCommand(ctx, { serverId, command: "earn", input: {}, externalId: "alice" })).toEqual({ ok: true });
  expect(reads.has(alice._id)).toBe(true);
  expect(reads.has(bob._id)).toBe(false);
  expect(reads.has(chunk._id)).toBe(false);
  expect(writes).toEqual([alice._id]);
  const loaded = await fns.helpers.loadSnapshot(ctx, serverId, { players: ["alice"], chunkKeys: [] });
  expect(loaded!.snapshot.players.alice!.economy.cash).toBe(51);
  expect(loaded!.snapshot.players.alice!.session).toEqual({ visits: 7 });
  await handlerOf(fns.leaveServer)(ctx, { serverId, externalId: "alice" });
  expect((await join("alice", serverId)).isNew).toBe(false);
  const rejoined = await fns.helpers.loadSnapshot(ctx, serverId, { players: ["alice"], chunkKeys: [] });
  expect(rejoined!.snapshot.players.alice!.economy.cash).toBe(51);
  expect(rejoined!.snapshot.players.alice!.session).toEqual({});
});

test("legacy session-only members migrate without being reseeded or losing state", async () => {
  const { seed, rows, ctx, fns, join } = setup("none");
  const legacy = { ...createEmptyPlayerRow("alice"), economy: { cash: 777 }, session: { tutorial: 4 } };
  seed("jgGameServers", serverDoc({ _id: "srv:legacy", memberUserIds: ["alice"], sessionPlayers: { alice: legacy }, save: "none" }));
  const result = await join("alice", "srv:legacy");
  expect(result.isNew).toBe(false);
  const loaded = await fns.helpers.loadSnapshot(ctx, result.serverId, { players: ["alice"], chunkKeys: [] });
  expect(loaded!.snapshot.players.alice).toEqual(legacy);
  expect(rows("jgServerMembers")).toHaveLength(1);
  expect(rows("jgServerCapacity")[0]!.memberCount).toBe(1);
});

test("flush only clears its dirty marker without hydrating or rewriting profiles and chunks", async () => {
  const { seed, reads, writes, ctx, fns } = setup();
  seed("jgGameServers", serverDoc({ _id: "srv:dirty", topology: "shared", dirtyAt: 1, save: { auto: "60s", scope: "player+chunks" } }));
  const profile = seed("jgPlayerProfiles", profileDoc({ userId: "alice", gameId: "demo", playerState: createEmptyPlayerRow("alice") }));
  const chunk = seed("jgWorldChunks", { _id: "chunk:1", _creationTime: 0, serverId: "srv:dirty", chunkKey: "0,0", snapshot: {}, updatedAt: 0 });
  expect(await handlerOf(fns.flushDirtyServers)(ctx, {})).toEqual({ saved: 1 });
  expect(reads.has(profile._id)).toBe(false);
  expect(reads.has(chunk._id)).toBe(false);
  expect(writes).toEqual(["srv:dirty"]);
});

test("profile reset runs the initializer and leaves the shared world and neighbors untouched", async () => {
  const { rows, writes, ctx, fns, join } = setup();
  const { serverId } = await join("alice");
  await join("bob");
  await fns.helpers.runCommand(ctx, { serverId, command: "earn", input: {}, externalId: "alice" });
  const alice = rows("jgPlayerProfiles").find(row => row.userId === "alice")!;
  writes.length = 0;
  const reset = await fns.helpers.resetPlayerProfile(ctx, serverId, "alice");
  expect(reset.economy.cash).toBe(50);
  expect(reset.session).toEqual({});
  expect(writes).toEqual([alice._id]);
  expect(rows("jgGameServers")).toHaveLength(1);
  const loaded = await fns.helpers.loadSnapshot(ctx, serverId, { players: ["alice"], chunkKeys: [] });
  expect(loaded!.snapshot.players.alice!.economy.cash).toBe(50);
  await expect(fns.helpers.resetPlayerProfile(ctx, serverId, "outsider")).rejects.toThrow("Not a member");
});

test("profile reset still reaches a player who left the server", async () => {
  const { ctx, fns, join } = setup();
  const { serverId } = await join("alice");
  await fns.helpers.runCommand(ctx, { serverId, command: "earn", input: {}, externalId: "alice" });
  await handlerOf(fns.leaveServer)(ctx, { serverId, externalId: "alice" });
  const reset = await fns.helpers.resetPlayerProfile(ctx, serverId, "alice");
  expect(reset.economy.cash).toBe(50);
});

test("shared capacity subscribes to membership and capacity, without reading the world document", async () => {
  const { reads, ctx, fns, join } = setup();
  const { serverId } = await join("alice");
  reads.clear();
  expect(await handlerOf(fns.getServerCapacity)(ctx, { serverId, externalId: "alice" })).toMatchObject({ memberCount: 1, status: "running" });
  expect(reads.has(serverId)).toBe(false);
  expect(await handlerOf(fns.getServerCapacity)(ctx, { serverId, externalId: "outsider" })).toBeNull();
});

test("trusted server ensure is idempotent and the first browser join uses that world", async () => {
  const { ctx, rows, fns, join } = setup();
  const first = await fns.helpers.ensureServer(ctx, "demo");
  const again = await fns.helpers.ensureServer(ctx, "demo");
  expect(again._id).toBe(first._id);
  expect(rows("jgGameServers")).toHaveLength(1);
  expect(rows("jgServerCapacity")).toHaveLength(1);
  expect(rows("jgServerMembers")).toHaveLength(0);
  expect((await join("alice")).serverId).toBe(first._id);
  expect(rows("jgGameServers")).toHaveLength(1);
  const rooms = createGameServerFunctions();
  await expect(rooms.helpers.ensureServer(ctx, "demo")).rejects.toThrow("shared singleton");
});

test("runtime topology selects a shared singleton without repeating host configuration", async () => {
  const { ctx, rows } = setup();
  const runtime = createGameRuntime({ gameId: "derived", topology: "shared", save: "none", commands: {} });
  const fns = createGameServerFunctions({ runtimes: [runtime] });
  expect(runtime.topology).toBe("shared");
  const server = await fns.helpers.ensureServer(ctx, "derived");
  expect(server.topology).toBe("shared");
  expect(server.slotsPerServer).toBe(Number.MAX_SAFE_INTEGER);
  expect(rows("jgGameServers")).toHaveLength(1);
});

test("public runCommand refuses server-only commands that the host helper still runs", async () => {
  const { ctx, fns, join } = setup();
  const { serverId } = await join("alice");
  expect(await handlerOf(fns.runCommand)(ctx, { serverId, command: "grant", input: {}, externalId: "alice" })).toEqual({ ok: false, reason: "Command is server-only" });
  expect(await handlerOf(fns.runCommand)(ctx, { serverId, command: "earn", input: {}, externalId: "alice" })).toEqual({ ok: true });
  expect(await fns.helpers.runCommand(ctx, { serverId, command: "grant", input: {}, externalId: "alice" })).toEqual({ ok: true });
});

test("closing one of two sessions keeps the user a member; closing both leaves", async () => {
  const { rows, join, leave, earn } = setup();
  const { serverId } = await join("alice", undefined, "tab-a");
  await join("alice", serverId, "tab-b");
  expect(rows("jgServerMembers")).toHaveLength(1);
  expect(rows("jgServerCapacity")[0]!.memberCount).toBe(1);
  await leave("alice", serverId, "tab-b");
  expect(rows("jgServerMembers")[0]!.sessionIds).toEqual(["tab-a"]);
  expect(await earn("alice", serverId)).toEqual({ ok: true });
  await leave("alice", serverId, "tab-a");
  expect(rows("jgServerMembers")).toHaveLength(0);
  expect(rows("jgServerCapacity")[0]!.memberCount).toBe(0);
  expect(await earn("alice", serverId)).toEqual({ ok: false, reason: "Not a member of this server" });
});

test("a leave without a session id leaves outright", async () => {
  const { rows, join, leave, earn } = setup();
  const { serverId } = await join("alice", undefined, "tab-a");
  await join("alice", serverId, "tab-b");
  await leave("alice", serverId);
  expect(rows("jgServerMembers")).toHaveLength(0);
  expect(await earn("alice", serverId)).toEqual({ ok: false, reason: "Not a member of this server" });
});

test("a disposed join's late leave does not evict the session that replaced it", async () => {
  const { rows, join, leave, earn } = setup();
  const { serverId } = await join("alice", undefined, "mount-1");
  await join("alice", serverId, "mount-2");
  await leave("alice", serverId, "mount-1");
  await leave("alice", serverId, "mount-1");
  await leave("alice", serverId, "never-joined");
  expect(rows("jgServerMembers")[0]!.sessionIds).toEqual(["mount-2"]);
  expect(await earn("alice", serverId)).toEqual({ ok: true });
});

test("legacy member rows without session ids leave on any session leave", async () => {
  const { rows, join, leave } = setup();
  const { serverId } = await join("alice");
  expect(rows("jgServerMembers")[0]!.sessionIds).toBeUndefined();
  await leave("alice", serverId, "tab-a");
  expect(rows("jgServerMembers")).toHaveLength(0);
});

test("membership remembers a bounded number of sessions and rejects oversized ids", async () => {
  const { rows, join, ctx, fns } = setup();
  const { serverId } = await join("alice", undefined, "s0");
  for (let i = 1; i < 40; i++) await join("alice", serverId, `s${i}`);
  expect(rows("jgServerMembers")[0]!.sessionIds).toHaveLength(MAX_MEMBER_SESSIONS);
  expect(rows("jgServerMembers")[0]!.sessionIds!.at(-1)).toBe("s39");
  await expect(handlerOf(fns.joinServer)(ctx, { gameId: "demo", externalId: "alice", sessionId: "x".repeat(MAX_SESSION_ID_LENGTH + 1) })).rejects.toThrow("Invalid sessionId");
});

test("ensureJoined lets a host run a command for a user with no live session, idempotently", async () => {
  const { rows, ctx, fns, join, leave, earn } = setup();
  const { serverId } = await join("alice", undefined, "tab-a");
  await leave("alice", serverId, "tab-a");
  expect(await fns.helpers.runCommand(ctx, { serverId, command: "earn", input: {}, actorUserId: "alice" })).toEqual({ ok: false, reason: "Not a member of this server" });
  expect(await fns.helpers.ensureJoined(ctx, { gameId: "demo", userId: "alice" })).toEqual({ ok: true, serverId, isNew: false });
  expect(await fns.helpers.ensureJoined(ctx, { gameId: "demo", userId: "alice", serverId })).toEqual({ ok: true, serverId, isNew: false });
  expect(await fns.helpers.ensureJoined(ctx, { gameId: "demo", userId: "alice" })).toMatchObject({ ok: true, serverId });
  expect(rows("jgServerMembers")).toHaveLength(1);
  expect(rows("jgServerMembers")[0]!.sessionIds).toBeUndefined();
  expect(rows("jgServerCapacity")[0]!.memberCount).toBe(1);
  expect(await fns.helpers.runCommand(ctx, { serverId, command: "earn", input: {}, actorUserId: "alice" })).toEqual({ ok: true });
  expect(await fns.helpers.ensureJoined(ctx, { gameId: "demo", userId: "agent-7" })).toEqual({ ok: true, serverId, isNew: true });
  expect(rows("jgServerCapacity")[0]!.memberCount).toBe(2);
  expect(await earn("agent-7", serverId)).toEqual({ ok: true });
});
