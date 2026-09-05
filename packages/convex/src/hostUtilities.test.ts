import { expect, test } from "bun:test";
import { createChatFunctions, createClientErrorFunctions, forEachOnlinePlayer, rateLimit, type JGMutationCtx } from "./server";
import { handlerOf, makeDb, serverDoc } from "./testFixtures";
function context(userId: string | null = "alice") {
  const fixture = makeDb();
  const scheduled: { fn: unknown; args: any }[] = [];
  const ctx = { db: fixture.db, auth: { getUserIdentity: async () => userId === null ? null : { subject: userId } }, scheduler: { runAfter: async (_delay: number, fn: unknown, args: any) => { scheduled.push({ fn, args }); } } } as unknown as JGMutationCtx;
  return { ...fixture, ctx, scheduled };
}
test("rate limit isolates keys and resets exactly at expiry", async () => {
  const f = context(), policy = { key: "alice", windowMs: 100, max: 2 };
  expect((await rateLimit(f.ctx, { ...policy, nowMs: 1000 })).ok).toBe(true);
  expect((await rateLimit(f.ctx, { ...policy, nowMs: 1050 })).ok).toBe(true);
  expect(await rateLimit(f.ctx, { ...policy, nowMs: 1099 })).toEqual({ ok: false, retryAfterMs: 1 });
  expect((await rateLimit(f.ctx, { ...policy, key: "bob", nowMs: 1099 })).ok).toBe(true);
  expect((await rateLimit(f.ctx, { ...policy, nowMs: 1100 })).ok).toBe(true);
  expect(f.rows("jgRateLimits").find(row => row.key === "alice")?.count).toBe(1);
});
test("rate limits reject nonfinite arithmetic and malformed policies", async () => {
  const f = context();
  for (const override of [{ nowMs: NaN }, { windowMs: Infinity }, { max: 1.5 }, { key: "" }, { nowMs: Number.MAX_VALUE, windowMs: Number.MAX_VALUE }]) {
    await expect(rateLimit(f.ctx, { key: "a", windowMs: 100, max: 1, ...override })).rejects.toThrow();
  }
  expect(f.rows("jgRateLimits")).toHaveLength(0);
});
test("online batches skip stale/revoked rows and deduplicate sessions across pages", async () => {
  const f = context();
  const seed = (id: string, userId: string, updatedAt: number, revokedAt?: number) => f.seed("jgPoses", { _id: id, _creationTime: updatedAt, serverId: "world", userId, updatedAt, revokedAt });
  seed("stale", "stale", 0); seed("a1", "alice", 900); seed("bob", "bob", 910); seed("a2", "alice", 920); seed("revoked", "carol", 930, 940);
  const options = { batchSize: 2, nowMs: 1000, freshWindowMs: 200, handler: "handler" as never, continuation: "next" as never };
  expect(await forEachOnlinePlayer(f.ctx, options)).toEqual({ scheduled: 1, remaining: true });
  expect(f.scheduled[0]?.args.players).toEqual([{ serverId: "world", userId: "bob" }]);
  expect(f.scheduled[1]?.args).toEqual({ cursor: "2", nowMs: 1000 });
  expect(await forEachOnlinePlayer(f.ctx, { ...options, cursor: "2" })).toEqual({ scheduled: 1, remaining: false });
  expect(f.scheduled[2]?.args.players).toEqual([{ serverId: "world", userId: "alice" }]);
  expect(f.reads.has("stale")).toBe(false);
});
test("empty online population schedules nothing and invalid windows fail", async () => {
  const f = context(), options = { handler: "h" as never, continuation: "c" as never, nowMs: 0 };
  expect(await forEachOnlinePlayer(f.ctx, options)).toEqual({ scheduled: 0, remaining: false });
  expect(f.scheduled).toEqual([]);
  await expect(forEachOnlinePlayer(f.ctx, { ...options, freshWindowMs: NaN })).rejects.toThrow();
  await expect(forEachOnlinePlayer(f.ctx, { ...options, batchSize: 0 })).rejects.toThrow();
});
test("diagnostics require identity, enforce UTF8 byte cap and author cooldown", async () => {
  const api = createClientErrorFunctions(), submit = handlerOf(api.reportClientError), anonymous = context(null);
  expect(await submit(anonymous.ctx, { message: "error" })).toEqual({ ok: false, reason: "unauthorized" });
  expect(anonymous.rows("jgClientErrors")).toEqual([]);
  const f = context();
  expect(await submit(f.ctx, { message: "\u{1f600}".repeat(1025) })).toEqual({ ok: false, reason: "too_long" });
  expect(await submit(f.ctx, { message: "\u{1f600}".repeat(1020) })).toEqual({ ok: true });
  expect(await submit(f.ctx, { message: "again" })).toEqual({ ok: false, reason: "rate_limited" });
  expect(f.rows("jgClientErrors")).toHaveLength(1);
});
test("retention sweeps are indexed and bounded", async () => {
  const f = context(), api = createClientErrorFunctions(), now = Date.now();
  for (let i = 0; i < 260; i++) f.seed("jgClientErrors", { _id: `old:${i}`, _creationTime: i, createdAt: 0 });
  f.seed("jgClientErrors", { _id: "fresh", _creationTime: now, createdAt: now });
  expect(await handlerOf(api.pruneClientErrors)(f.ctx, {})).toEqual({ deleted: 256, remaining: true });
  expect(f.reads.has("fresh")).toBe(false);
  expect(await handlerOf(api.pruneClientErrors)(f.ctx, {})).toEqual({ deleted: 4, remaining: false });
  f.seed("jgRateLimits", { _id: "expired", _creationTime: 0, key: "old", count: 1, startedAt: 0, expiresAt: 0 });
  f.seed("jgRateLimits", { _id: "active", _creationTime: now, key: "new", count: 1, startedAt: now, expiresAt: now + 100000 });
  expect(await handlerOf(api.pruneRateLimits)(f.ctx, {})).toEqual({ deleted: 1, remaining: false });
  expect(f.reads.has("active")).toBe(false);
});
test("chat checks membership, sanitizes text, limits across channels and hides other channels", async () => {
  const f = context(), api = createChatFunctions(), send = handlerOf(api.sendMessage);
  f.seed("jgGameServers", serverDoc({ _id: "world", memberUserIds: ["alice"] }));
  expect(await send(f.ctx, { serverId: "world", channelId: "all", externalId: "bob", body: "hello" })).toEqual({ ok: false, reason: "not signed in" });
  expect(await send(f.ctx, { serverId: "missing", channelId: "all", body: "hello" })).toEqual({ ok: false, reason: "not a member of this server" });
  expect(await send(f.ctx, { serverId: "world", channelId: "all", body: "hello\u0000world" })).toEqual({ ok: true });
  expect(f.rows("jgChatMessages")[0]?.body).toBe("helloworld");
  expect(await send(f.ctx, { serverId: "world", channelId: "other", body: "again" })).toEqual({ ok: false, reason: "sending too fast" });
  expect(await handlerOf(api.messages)(f.ctx, { serverId: "world", channelId: "other" })).toEqual([]);
  expect((await handlerOf(api.messages)(f.ctx, { serverId: "world", channelId: "all" }) as unknown[])).toHaveLength(1);
});
test("chat options reject nonfinite retention and timing", () => {
  expect(() => createChatFunctions({ historyLimit: NaN })).toThrow();
  expect(() => createChatFunctions({ minIntervalMs: Infinity })).toThrow();
  expect(() => createChatFunctions({ maxBodyLength: 0 })).toThrow();
});

test("diagnostic rejection does not consume the author's allowance and exact byte boundary is accepted", async () => {
  const f = context(), submit = handlerOf(createClientErrorFunctions().reportClientError);
  expect(await submit(f.ctx, { message: "x".repeat(4097) })).toEqual({ ok: false, reason: "too_long" });
  expect(f.rows("jgRateLimits")).toHaveLength(0);
  expect(await submit(f.ctx, { message: "x".repeat(4096 - JSON.stringify({ message: "" }).length) })).toEqual({ ok: true });
  expect(f.rows("jgClientErrors")).toHaveLength(1);
  const other = { ...f.ctx, auth: { getUserIdentity: async () => ({ subject: "bob" }) } };
  expect(await submit(other, { message: "same instant, different user" })).toEqual({ ok: true });
});

test("home game batching delivers one lab even when different bot actors span pages", async () => {
  const f = context();
  for (let i = 0; i < 3; i++) f.seed("jgPoses", { _id: `bot${i}`, _creationTime: i, serverId: "world", userId: `bot${i}`, homeGameId: "lab", updatedAt: 900 + i });
  const options = { batchSize: 1, nowMs: 1000, handler: "h" as never, continuation: "c" as never, groupBy: "homeGameId" as const };
  await forEachOnlinePlayer(f.ctx, options);
  await forEachOnlinePlayer(f.ctx, { ...options, cursor: "1" });
  await forEachOnlinePlayer(f.ctx, { ...options, cursor: "2" });
  expect(f.scheduled.filter(entry => entry.fn === "h")).toHaveLength(1);
});
test("diagnostics cap serialized bytes including JSON escaping", async () => {
  const f = context();
  expect(await handlerOf(createClientErrorFunctions().reportClientError)(f.ctx, { message: "\u0000".repeat(1000) })).toEqual({ ok: false, reason: "too_long" });
  expect(f.rows("jgClientErrors")).toHaveLength(0);
});

test("chat rejects unbounded channel metadata without using the rate window", async () => {
  const f = context(), send = handlerOf(createChatFunctions().sendMessage);
  f.seed("jgGameServers", serverDoc({ _id: "world", memberUserIds: ["alice"] }));
  expect(await send(f.ctx, { serverId: "world", channelId: "x".repeat(257), body: "hello" })).toEqual({ ok: false, reason: "invalid_channel_or_author" });
  expect(f.rows("jgRateLimits")).toHaveLength(0);
});

test("chat history orders migrated messages by event time rather than insertion time", async () => {
  const f = context();
  f.seed("jgGameServers", serverDoc({ _id: "world", memberUserIds: ["alice"] }));
  f.seed("jgChatMessages", { _id: "new", _creationTime: 1, serverId: "world", channelId: "all", userId: "alice", body: "new", at: 200 });
  f.seed("jgChatMessages", { _id: "imported-old", _creationTime: 2, serverId: "world", channelId: "all", userId: "alice", body: "old", at: 100 });
  const rows = await handlerOf(createChatFunctions().messages)(f.ctx, { serverId: "world", channelId: "all" }) as { body: string }[];
  expect(rows.map(row => row.body)).toEqual(["old", "new"]);
});
